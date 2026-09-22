import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { asStringList, ensureNetworkTables, type NetworkContactRecord } from './network-contacts';
import { rowToCamel } from './case';
import {
  cleanAskField,
  expandSearchTerms,
  inferTradesFromText,
  looksLikeNudge,
  looksLikeVendorAsk,
  toTaiwanText,
} from './network-trades';

export { looksLikeNudge, looksLikeVendorAsk } from './network-trades';

export interface VendorAsk {
  isVendorAsk: boolean;
  category: string | null;
  region: string | null;
  summary: string | null;
  aliases: string[];
}

export async function classifyVendorAsk(env: Env, text: string): Promise<VendorAsk> {
  const textTw = toTaiwanText(text);
  const inferred = inferTradesFromText(textTw);
  if (looksLikeNudge(textTw)) {
    return { isVendorAsk: false, category: null, region: null, summary: null, aliases: [] };
  }
  if (inferred.category) {
    return {
      isVendorAsk: true,
      category: inferred.category,
      region: inferred.region,
      summary: inferred.summary ?? textTw.slice(0, 40),
      aliases: inferred.aliases,
    };
  }
  if (!looksLikeVendorAsk(textTw)) {
    return { isVendorAsk: false, category: null, region: null, summary: null, aliases: [] };
  }

  const result = await chatCompleteJson<VendorAsk>(env, {
    messages: [
      {
        role: 'system',
        content: '你在判斷台灣修繕群組訊息是否在「求廠商／求推薦」。只回 JSON。'
          + '症狀要對到工種：修馬桶/水管/跳電→水電；壁癌/滲水/屋頂漏→防水；冷氣不冷→冷氣；搬家公司→搬家；二手傢俱→傢俱。'
          + '{"isVendorAsk":true/false,"category":"工種","region":"縣市或行政區或空字串","summary":"一句話需求"}'
          + '沒有地區就回空字串，不要回 null 這個字。',
      },
      { role: 'user', content: textTw },
    ],
    temperature: 0.1,
    maxTokens: 300,
  });
  const category = cleanAskField(result.category);
  return {
    isVendorAsk: result.isVendorAsk !== false,
    category,
    region: cleanAskField(result.region) ?? inferred.region,
    summary: cleanAskField(result.summary),
    aliases: expandSearchTerms(category),
  };
}

export interface RankedContact {
  contact: NetworkContactRecord;
  score: number;
  reasons: string[];
}

export async function searchVendors(
  env: Env,
  brandId: string,
  ask: VendorAsk,
): Promise<RankedContact[]> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const terms = expandSearchTerms(ask.category, ask.aliases ?? []);
  const region = cleanAskField(ask.region) ?? '';
  if (!terms.length) return [];

  const rows = await sql`
    SELECT * FROM network_contacts
    WHERE brand_id = ${brandId}::uuid
      AND status <> 'archived'
    ORDER BY updated_at DESC
    LIMIT 200
  `;

  const ranked = (rows as Record<string, unknown>[]).map((row) => {
    const contact = {
      ...rowToCamel<NetworkContactRecord>(row),
      specialties: asStringList((row as { specialties?: unknown }).specialties),
      serviceRegions: asStringList((row as { service_regions?: unknown }).service_regions),
    };
    return scoreContact(contact, terms, region);
  }).filter((item) => item.score > 0);

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3);
}

function scoreContact(contact: NetworkContactRecord, terms: string[], region: string): RankedContact {
  let score = 0;
  const reasons: string[] = [];
  const blob = [contact.name, contact.company, contact.industry, contact.title, contact.notes, ...contact.specialties]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let termScore = 0;
  let hitTerm = '';
  for (const term of terms) {
    const cat = term.toLowerCase();
    if (!cat) continue;
    const specHit = contact.specialties.some((s) => s.includes(term) || term.includes(s));
    if (specHit && termScore < 4) {
      termScore = 4;
      hitTerm = term;
    } else if (blob.includes(cat) && termScore < 3) {
      termScore = 3;
      hitTerm = term;
    } else if (termScore < 2) {
      const tokens = term.split(/[／/\s、]+/).filter((item) => item.length >= 2);
      if (tokens.some((token) => blob.includes(token.toLowerCase()))) {
        termScore = 2;
        hitTerm = term;
      }
    }
  }
  if (termScore <= 0) return { contact, score: 0, reasons };
  score += termScore;
  reasons.push(termScore >= 4 ? `專長符合「${hitTerm}」` : `資料提到「${hitTerm}」`);

  if (region) {
    const regionHit = contact.serviceRegions.some((r) => r.includes(region) || region.includes(r))
      || (contact.address ?? '').includes(region)
      || (contact.notes ?? '').includes(region);
    if (regionHit) {
      score += 2;
      reasons.push(`服務地區含「${region}」`);
    }
  }
  if (contact.acceptsDispatch) {
    score += 1;
    reasons.push('願意承接修繕中心派案');
  }
  if (contact.status === 'verified') score += 1;
  if (contact.phone) score += 0.5;
  return { contact, score, reasons };
}

export async function logNetworkMatch(
  env: Env,
  params: {
    brandId: string;
    queryText: string;
    ask: VendorAsk;
    matches: RankedContact[];
    lineUserId?: string | null;
    lineGroupId?: string | null;
  },
): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO network_match_logs (
      brand_id, query_text, category, region, intent, matched_contact_ids, line_user_id, line_group_id
    ) VALUES (
      ${params.brandId}::uuid, ${params.queryText}, ${params.ask.category}, ${params.ask.region},
      ${params.ask.isVendorAsk ? '求廠商' : '其他'},
      ${JSON.stringify(params.matches.map((m) => m.contact.id))}::jsonb,
      ${params.lineUserId ?? null}, ${params.lineGroupId ?? null}
    )
  `;
}

export function contactLineUri(raw: string | null | undefined): string | null {
  const id = raw?.trim();
  if (!id) return null;
  if (/^https?:\/\//i.test(id)) return id;
  if (id.startsWith('@')) return `https://line.me/R/ti/p/${encodeURIComponent(id)}`;
  return `https://line.me/ti/p/~${encodeURIComponent(id.replace(/^~/, ''))}`;
}

export function contactTelUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const part = raw.split(/[,，、/\s]+/).find((item) => /\d{8,}/.test(item));
  const digits = (part ?? raw).replace(/[^\d+]/g, '');
  if (digits.length < 8) return null;
  const phone = digits.startsWith('886') ? `0${digits.slice(3)}` : digits;
  return `tel:${phone}`;
}

export function formatMatchTopic(ask: VendorAsk): string {
  return [cleanAskField(ask.region), cleanAskField(ask.category)].filter(Boolean).join('／')
    || cleanAskField(ask.summary)
    || '你說的這項';
}

export function formatMatchText(ask: VendorAsk, matches: RankedContact[]): string {
  const topic = formatMatchTopic(ask);
  if (!matches.length) {
    return `這題我對過了，「${topic}」人脈庫裡暫時沒有現成名單。我先記下來，之後有人加入會再跟你說。`;
  }
  const blocks = matches.map((m, i) => {
    const c = m.contact;
    const lineLink = contactLineUri(c.lineId);
    const phone = c.phone?.replace(/\s+/g, '') ?? '';
    return [
      `${['1️⃣', '2️⃣', '3️⃣'][i] ?? `${i + 1}.`} ${c.name}${c.company ? `｜${c.company}` : ''}`,
      c.specialties.length ? `🛠️ ${c.specialties.slice(0, 3).join('、')}` : '',
      phone ? `📞 ${phone}` : '',
      lineLink ? `💬 ${lineLink}` : '',
    ].filter(Boolean).join('\n');
  });
  return `「${topic}」我幫你對到這幾位，可以直接打電話或加 LINE 問檔期～\n\n${blocks.join('\n\n')}`;
}
