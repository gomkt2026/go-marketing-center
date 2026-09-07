#!/usr/bin/env node
/**
 * 把 FIXERCOWORK 活動報名、報名 CSV、名片夾 OCR 寫進人脈資料庫。
 * 用法:
 *   node scripts/import-network.mjs
 *   node scripts/import-network.mjs --cards "/Users/benchen/Downloads/Fixercowork 的名片"
 *   node scripts/import-network.mjs --no-cards
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const noCards = args.includes('--no-cards');
const cardsIdx = args.indexOf('--cards');
const cardsDir = cardsIdx >= 0
  ? args[cardsIdx + 1]
  : '/Users/benchen/Downloads/Fixercowork 的名片';
const csvPath = '/Users/benchen/Downloads/fixercowork-biz-exchange-0828-registrations.csv';

function loadEnv(file) {
  const extra = {};
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return extra; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    extra[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return extra;
}

const env = { ...loadEnv(join(root, '.dev.vars')), ...loadEnv(join(root, '.env')), ...process.env };
const sql = neon(env.DATABASE_URL || '');
if (!env.DATABASE_URL) {
  console.error('找不到 DATABASE_URL');
  process.exit(1);
}

function phoneDigits(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('886') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  return digits;
}

function asList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (typeof value === 'string') return [...new Set(value.split(/[,，、/;／\n]+/).map((s) => s.trim()).filter(Boolean))];
  return [];
}

function parseDispatch(value) {
  const text = String(value ?? '').trim();
  if (/^(是|要|願意|ok|yes|true)$/i.test(text)) return true;
  if (/^(否|不|不要|沒有|no|false)$/i.test(text)) return false;
  return null;
}

async function upsert(brandId, draft) {
  const name = (draft.name || draft.company || '').trim();
  if (!name) return 'skipped';
  const digits = phoneDigits(draft.phone);
  const email = draft.email ? String(draft.email).trim().toLowerCase() : null;
  let existing = null;
  if (draft.registrationId) {
    const rows = await sql`SELECT id, specialties, service_regions, extra, status FROM network_contacts WHERE brand_id = ${brandId}::uuid AND registration_id = ${draft.registrationId}::uuid LIMIT 1`;
    existing = rows[0] ?? null;
  }
  if (!existing && digits) {
    const rows = await sql`SELECT id, specialties, service_regions, extra, status FROM network_contacts WHERE brand_id = ${brandId}::uuid AND phone_digits = ${digits} LIMIT 1`;
    existing = rows[0] ?? null;
  }
  if (!existing && email) {
    const rows = await sql`SELECT id, specialties, service_regions, extra, status FROM network_contacts WHERE brand_id = ${brandId}::uuid AND lower(email) = ${email} LIMIT 1`;
    existing = rows[0] ?? null;
  }
  const specialties = JSON.stringify(asList(draft.specialties));
  const regions = JSON.stringify(asList(draft.serviceRegions));
  const extra = JSON.stringify(draft.extra ?? {});
  const status = draft.status || 'pending_review';
  if (existing) {
    await sql`
      UPDATE network_contacts SET
        name = ${name},
        company = COALESCE(${draft.company ?? null}, company),
        title = COALESCE(${draft.title ?? null}, title),
        phone = COALESCE(${draft.phone ?? null}, phone),
        phone_digits = COALESCE(${digits}, phone_digits),
        email = COALESCE(${email}, email),
        line_id = COALESCE(${draft.lineId ?? null}, line_id),
        website = COALESCE(${draft.website ?? null}, website),
        address = COALESCE(${draft.address ?? null}, address),
        industry = COALESCE(${draft.industry ?? null}, industry),
        specialties = ${specialties}::jsonb,
        service_regions = ${regions}::jsonb,
        years_experience = COALESCE(${draft.yearsExperience ?? null}, years_experience),
        accepts_dispatch = COALESCE(${draft.acceptsDispatch ?? null}, accepts_dispatch),
        chambers = COALESCE(${draft.chambers ?? null}, chambers),
        notes = COALESCE(${draft.notes ?? null}, notes),
        raw_ocr = COALESCE(${draft.rawOcr ?? null}, raw_ocr),
        source_ref = COALESCE(${draft.sourceRef ?? null}, source_ref),
        event_id = COALESCE(${draft.eventId ?? null}::uuid, event_id),
        registration_id = COALESCE(${draft.registrationId ?? null}::uuid, registration_id),
        status = CASE WHEN status = 'archived' THEN status WHEN ${status} = 'verified' THEN 'verified' ELSE status END,
        confidence = COALESCE(${draft.confidence ?? null}, confidence),
        extra = ${extra}::jsonb
      WHERE id = ${existing.id}::uuid
    `;
    return 'updated';
  }
  await sql`
    INSERT INTO network_contacts (
      brand_id, name, company, title, phone, phone_digits, email, line_id, website, address,
      industry, specialties, service_regions, years_experience, accepts_dispatch, chambers, notes,
      raw_ocr, source, source_ref, event_id, registration_id, status, confidence, extra
    ) VALUES (
      ${brandId}::uuid, ${name}, ${draft.company ?? null}, ${draft.title ?? null}, ${draft.phone ?? null},
      ${digits}, ${email}, ${draft.lineId ?? null}, ${draft.website ?? null}, ${draft.address ?? null},
      ${draft.industry ?? null}, ${specialties}::jsonb, ${regions}::jsonb, ${draft.yearsExperience ?? null},
      ${draft.acceptsDispatch ?? null}, ${draft.chambers ?? null}, ${draft.notes ?? null},
      ${draft.rawOcr ?? null}, ${draft.source}, ${draft.sourceRef ?? null},
      ${draft.eventId ?? null}::uuid, ${draft.registrationId ?? null}::uuid, ${status},
      ${draft.confidence ?? null}, ${extra}::jsonb
    )
  `;
  return 'created';
}

async function ocrImage(bytes, mime) {
  const b64 = Buffer.from(bytes).toString('base64');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是台灣修繕／工程／商會人脈名片辨識助手。不是名片就 isBusinessCard=false。不要發明電話或 Email。回傳 JSON。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '辨識這張圖，回傳 JSON：{"isBusinessCard":true,"name":"","company":"","title":"","phone":"","email":"","lineId":"","website":"","address":"","industry":"","specialties":[],"serviceRegions":[],"notes":"","rawText":"","confidence":0.8,"skipReason":""}' },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

const brands = await sql`SELECT id, slug FROM brands WHERE slug = 'fixercowork' LIMIT 1`;
if (!brands.length) {
  console.error('找不到 fixercowork 品牌');
  process.exit(1);
}
const brandId = brands[0].id;
const tally = { created: 0, updated: 0, skipped: 0 };

console.log('1/3 同步活動報名…');
const regs = await sql`
  SELECT r.id, r.event_id, r.name, r.phone, r.email, r.line_id, r.custom_answers
  FROM event_registrations r
  JOIN events e ON e.id = r.event_id
  WHERE e.brand_id = ${brandId}::uuid AND r.status = 'registered'
`;
for (const row of regs) {
  const custom = row.custom_answers && typeof row.custom_answers === 'object' ? row.custom_answers : {};
  const result = await upsert(brandId, {
    name: row.name,
    phone: row.phone,
    email: row.email,
    lineId: row.line_id,
    company: custom.company || null,
    industry: custom.industry || null,
    specialties: custom.expertise || custom.specialties || [],
    yearsExperience: Number(custom.years_experience) || null,
    acceptsDispatch: parseDispatch(custom.accept_repair_jobs),
    chambers: [custom.chambers, custom.chambers_other].flat().filter(Boolean).join('、') || null,
    source: 'event',
    sourceRef: row.event_id,
    eventId: row.event_id,
    registrationId: row.id,
    status: 'verified',
    extra: { customAnswers: custom },
  });
  tally[result] += 1;
}
console.log(`   報名 ${regs.length} 筆`);

console.log('2/3 匯入報名 CSV…');
try {
  const csv = readFileSync(csvPath, 'utf8');
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  for (const line of lines.slice(1)) {
    const cols = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    const row = Object.fromEntries(headers.map((h, i) => [h.trim(), (cols[i] ?? '').trim()]));
    const result = await upsert(brandId, {
      name: row['姓名'],
      phone: row['手機'],
      email: row.Email || row.email,
      lineId: row['LINE ID'],
      company: row['公司名稱'],
      industry: row['產業別'],
      specialties: row['專長'],
      yearsExperience: Number(row['該產業年資（年）']) || null,
      acceptsDispatch: parseDispatch(row['是否願意承接修繕中心派案']),
      chambers: [row['現行加入的商會'], row['其他商會名稱']].filter(Boolean).join('、') || null,
      notes: [row['本次活動介紹人'] && `介紹人:${row['本次活動介紹人']}`, row['如何得知商會'] && `得知管道:${row['如何得知商會']}`].filter(Boolean).join('；') || null,
      source: 'csv',
      sourceRef: 'fixercowork-biz-exchange-0828-registrations.csv',
      status: 'verified',
      extra: { csv: row },
    });
    tally[result] += 1;
  }
} catch (e) {
  console.log(`   CSV 略過：${e instanceof Error ? e.message : e}`);
}

if (!noCards) {
  if (!env.OPENAI_API_KEY) {
    console.error('沒有 OPENAI_API_KEY，略過名片 OCR');
  } else {
    console.log(`3/3 OCR 名片夾 ${cardsDir}`);
    const files = readdirSync(cardsDir)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .sort();
    for (const [i, name] of files.entries()) {
      const filePath = join(cardsDir, name);
      const ext = extname(name).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      process.stdout.write(`   [${i + 1}/${files.length}] ${name} … `);
      try {
        const ocr = await ocrImage(readFileSync(filePath), mime);
        if (!ocr.isBusinessCard) {
          console.log(`略過（${ocr.skipReason || '不像名片'}）`);
          tally.skipped += 1;
          continue;
        }
        const result = await upsert(brandId, {
          name: ocr.name || ocr.company,
          company: ocr.company,
          title: ocr.title,
          phone: ocr.phone,
          email: ocr.email,
          lineId: ocr.lineId,
          website: ocr.website,
          address: ocr.address,
          industry: ocr.industry,
          specialties: ocr.specialties,
          serviceRegions: ocr.serviceRegions,
          notes: ocr.notes,
          rawOcr: ocr.rawText,
          source: 'business_card',
          sourceRef: name,
          status: 'pending_review',
          confidence: ocr.confidence,
        });
        tally[result] += 1;
        console.log(`${result} ${ocr.name || ocr.company || ''}`);
      } catch (e) {
        tally.skipped += 1;
        console.log(`失敗 ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

console.log(`完成：新增 ${tally.created}、更新 ${tally.updated}、略過 ${tally.skipped}`);
