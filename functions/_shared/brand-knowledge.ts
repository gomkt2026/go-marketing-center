import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel, rowsToCamel } from './case';
import { logActivity } from './activity';
import type { AuthUser } from './auth';

export const KNOWLEDGE_SECTIONS = [
  'core', 'audience', 'persona', 'channel', 'rule', 'visual', 'keyword', 'example', 'image_prompt',
] as const;
export type KnowledgeSection = (typeof KNOWLEDGE_SECTIONS)[number];
export type KnowledgeAction = 'update' | 'create' | 'delete';

export interface KnowledgeChange {
  id: string;
  section: KnowledgeSection | string;
  action: KnowledgeAction;
  entityId?: string | null;
  label: string;
  before?: unknown;
  after?: unknown;
  at: string;
  by?: string;
}

export interface BrandVersionRow {
  id: string;
  brandId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'archived';
  summaryOfChanges: string | null;
  compiledMarkdown?: string | null;
  confidenceScore: number | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  changeLog: KnowledgeChange[];
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeEditBody {
  section: KnowledgeSection;
  action: KnowledgeAction;
  id?: string;
  payload?: Record<string, unknown>;
}

const SECTION_LABEL: Record<string, string> = {
  core: '品牌核心',
  audience: '受眾',
  persona: 'Persona',
  channel: '平台調性',
  rule: '規則邊界',
  visual: '視覺',
  keyword: '關鍵字',
  example: '內容支柱／主題',
  image_prompt: '產圖 Prompt',
};

function isMissingChangeLog(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?change_log["']? does not exist/i.test(msg);
}

export async function ensureBrandVersionChangeLog(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`ALTER TABLE brand_versions ADD COLUMN IF NOT EXISTS change_log JSONB NOT NULL DEFAULT '[]'`;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function clip(text: unknown, max = 80): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '（空白）';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function mapVersion(row: Record<string, unknown>): BrandVersionRow {
  const mapped = rowToCamel<BrandVersionRow>(row);
  const raw = row.change_log ?? row.changeLog ?? [];
  const changeLog = Array.isArray(raw) ? raw as KnowledgeChange[] : [];
  return { ...mapped, changeLog };
}

function summarizeChanges(log: KnowledgeChange[]): string {
  if (!log.length) return '無變更摘要';
  return log.map((c) => {
    const sec = SECTION_LABEL[c.section] ?? c.section;
    if (c.action === 'create') return `新增${sec}：${c.label}`;
    if (c.action === 'delete') return `刪除${sec}：${c.label}`;
    return `調整${sec}：${c.label}`;
  }).join('\n');
}

export async function listBrandVersions(env: Env, brandId: string): Promise<BrandVersionRow[]> {
  try {
    await ensureBrandVersionChangeLog(env);
  } catch (e) {
    console.error('[brand-knowledge] 補 change_log 欄位失敗', e);
  }
  const sql = getSql(env);
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await sql`
      SELECT id, brand_id, version_number, status, summary_of_changes, confidence_score,
             published_by, published_at, change_log, created_at, updated_at
      FROM brand_versions
      WHERE brand_id = ${brandId}::uuid
      ORDER BY version_number DESC
    ` as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingChangeLog(e)) throw e;
    rows = await sql`
      SELECT id, brand_id, version_number, status, summary_of_changes, confidence_score,
             published_by, published_at, created_at, updated_at
      FROM brand_versions
      WHERE brand_id = ${brandId}::uuid
      ORDER BY version_number DESC
    ` as Record<string, unknown>[];
  }
  return rows.map(mapVersion);
}

export async function getDraftVersion(env: Env, brandId: string): Promise<BrandVersionRow | null> {
  const list = await listBrandVersions(env, brandId);
  return list.find((v) => v.status === 'draft') ?? null;
}

export async function getPublishedVersion(env: Env, brandId: string): Promise<BrandVersionRow | null> {
  const list = await listBrandVersions(env, brandId);
  return list.find((v) => v.status === 'published') ?? null;
}

export async function getOrCreateDraft(
  env: Env,
  brandId: string,
  actorName?: string,
): Promise<BrandVersionRow> {
  const existing = await getDraftVersion(env, brandId);
  if (existing) return existing;
  const sql = getSql(env);
  await ensureBrandVersionChangeLog(env);
  const inserted = await sql`
    INSERT INTO brand_versions (brand_id, version_number, status, summary_of_changes, change_log, confidence_score)
    VALUES (
      ${brandId}::uuid,
      (SELECT COALESCE(MAX(version_number), 0) + 1 FROM brand_versions WHERE brand_id = ${brandId}::uuid),
      'draft',
      ${actorName ? `${actorName} 開始調整品牌智慧` : '品牌智慧草稿'},
      '[]'::jsonb,
      NULL
    )
    RETURNING id, brand_id, version_number, status, summary_of_changes, confidence_score,
              published_by, published_at, change_log, created_at, updated_at
  `;
  if (!inserted.length) throw new Error('無法建立品牌智慧草稿');
  return mapVersion(inserted[0] as Record<string, unknown>);
}

export async function recordKnowledgeChange(
  env: Env,
  params: {
    brandId: string;
    actor: AuthUser;
    section: KnowledgeSection | string;
    action: KnowledgeAction;
    entityId?: string | null;
    label: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<BrandVersionRow> {
  const draft = await getOrCreateDraft(env, params.brandId, params.actor.displayName);
  const change: KnowledgeChange = {
    id: crypto.randomUUID(),
    section: params.section,
    action: params.action,
    entityId: params.entityId ?? null,
    label: params.label,
    before: params.before ?? null,
    after: params.after ?? null,
    at: new Date().toISOString(),
    by: params.actor.displayName,
  };
  const nextLog = [...(draft.changeLog ?? []), change];
  const sql = getSql(env);
  const updated = await sql`
    UPDATE brand_versions
    SET change_log = ${JSON.stringify(nextLog)}::jsonb,
        summary_of_changes = ${summarizeChanges(nextLog)},
        updated_at = now()
    WHERE id = ${draft.id}::uuid
    RETURNING id, brand_id, version_number, status, summary_of_changes, confidence_score,
              published_by, published_at, change_log, created_at, updated_at
  `;
  await logActivity(env, {
    brandId: params.brandId,
    actorType: 'user',
    actorUserId: params.actor.id,
    action: 'brand_knowledge.updated',
    entityType: 'brand_version',
    entityId: draft.id,
    beforeState: params.before ?? null,
    afterState: { section: params.section, action: params.action, label: params.label, after: params.after ?? null },
  });
  return mapVersion((updated[0] ?? { ...draft, change_log: nextLog }) as Record<string, unknown>);
}

async function compileFromBrandId(
  env: Env,
  brand: { id?: string; name: string; tagline: string | null; websiteUrl?: string | null },
): Promise<string> {
  const sql = getSql(env);
  if (!brand.id) return `# ${brand.name}\n\n一句話定位: ${brand.tagline ?? ''}\n`;
  const [audiences, personas, channels, rules, visuals, keywords, examples] = await Promise.all([
    sql`SELECT name, lane, pain_points, appeal_angle FROM brand_audiences WHERE brand_id = ${brand.id}::uuid ORDER BY sort_order`,
    sql`SELECT code, name, age_range, pain_points, appeal_angle FROM brand_personas WHERE brand_id = ${brand.id}::uuid ORDER BY sort_order`,
    sql`SELECT platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max FROM brand_channels WHERE brand_id = ${brand.id}::uuid ORDER BY platform`,
    sql`SELECT rule_type, statement, condition_note, verification, valid_until FROM brand_rules WHERE brand_id = ${brand.id}::uuid ORDER BY sort_order, created_at`,
    sql`SELECT label, value, category FROM brand_visuals WHERE brand_id = ${brand.id}::uuid ORDER BY sort_order`,
    sql`SELECT category, value FROM brand_keywords WHERE brand_id = ${brand.id}::uuid ORDER BY category, value`,
    sql`SELECT category, title, body, weight_percent FROM brand_examples WHERE brand_id = ${brand.id}::uuid ORDER BY category, title`,
  ]);
  const a = rowsToCamel(audiences as Record<string, unknown>[]);
  const p = rowsToCamel(personas as Record<string, unknown>[]);
  const c = rowsToCamel(channels as Record<string, unknown>[]);
  const r = rowsToCamel(rules as Record<string, unknown>[]);
  const v = rowsToCamel(visuals as Record<string, unknown>[]);
  const k = rowsToCamel(keywords as Record<string, unknown>[]);
  const e = rowsToCamel(examples as Record<string, unknown>[]);
  const pillars = e.filter((x) => x.category === 'content_pillar');
  const topics = e.filter((x) => x.category === 'hot_topic_bank');
  const line = (items: string[]) => items.filter(Boolean).map((s) => `- ${s}`).join('\n') || '- （尚未填寫）';
  return `# ${brand.name} 品牌知識庫(Brand Knowledge Base)

> 版本發布時自動編譯,不可手動修改。如需修改請至品牌智慧頁編輯結構化條目。

## 1. 品牌總覽
- 一句話定位: ${brand.tagline ?? ''}
- 官方網站: ${brand.websiteUrl ?? '（未填）'}

## 3. 目標受眾
${line(a.map((x) => `${x.name}${x.lane ? `（${x.lane}）` : ''}：${x.appealAngle ?? ''}／痛點 ${asStringList(x.painPoints).join('、')}`))}

### Persona
${line(p.map((x) => `${x.code ?? ''} ${x.name}${x.ageRange ? ` ${x.ageRange}` : ''}：${x.appealAngle ?? ''}／痛點 ${asStringList(x.painPoints).join('、')}`))}

## 5. 各平台調性
${line(c.map((x) => `${x.platform}：語氣 ${x.toneOfVoice ?? ''}；字數 ${x.lengthGuideline ?? ''}；格式 ${x.formatGuideline ?? ''}；hashtag ${x.hashtagCountMin ?? 0}–${x.hashtagCountMax ?? 0}`))}

## 6. 內容支柱與熱點
${line(pillars.map((x) => `${x.title}（${x.weightPercent ?? 0}%）：${x.body ?? ''}`))}
${line(topics.map((x) => `${x.title}：${x.body ?? ''}`))}

## 7. 品牌規則
${line(r.map((x) => `[${x.ruleType}] ${x.statement}${x.conditionNote ? `（${x.conditionNote}）` : ''} ${x.verification}`))}

## 8. 視覺識別
${line(v.map((x) => `${x.label}: ${x.value}`))}

## 10. Hashtag / CTA / 關鍵字
${line(k.map((x) => `[${x.category}] ${x.value}`))}
`;
}

export async function publishDraft(
  env: Env,
  brandId: string,
  actor: AuthUser,
  note?: string,
): Promise<{ published: BrandVersionRow; versions: BrandVersionRow[] }> {
  const draft = await getDraftVersion(env, brandId);
  if (!draft) throw new Error('目前沒有未發布的調整');
  if (!draft.changeLog?.length && !note?.trim()) throw new Error('草稿還沒有任何調整');

  const sql = getSql(env);
  const brandRows = await sql`
    SELECT id, name, tagline, website_url FROM brands WHERE id = ${brandId}::uuid LIMIT 1
  `;
  const brand = brandRows[0] as { id: string; name: string; tagline: string | null; website_url: string | null } | undefined;
  if (!brand) throw new Error('Brand not found');
  const markdown = await compileFromBrandId(env, {
    id: brand.id,
    name: brand.name,
    tagline: brand.tagline,
    websiteUrl: brand.website_url,
  });
  const summary = note?.trim()
    ? `${note.trim()}\n\n${summarizeChanges(draft.changeLog)}`
    : summarizeChanges(draft.changeLog);

  await sql`
    UPDATE brand_versions
    SET status = 'archived', updated_at = now()
    WHERE brand_id = ${brandId}::uuid AND status = 'published'
  `;
  const publishedRows = await sql`
    UPDATE brand_versions
    SET status = 'published',
        summary_of_changes = ${summary},
        compiled_markdown = ${markdown},
        published_by = ${actor.id}::uuid,
        published_at = now(),
        updated_at = now()
    WHERE id = ${draft.id}::uuid
    RETURNING id, brand_id, version_number, status, summary_of_changes, confidence_score,
              published_by, published_at, change_log, created_at, updated_at
  `;
  await sql`
    UPDATE brands SET current_version_id = ${draft.id}::uuid, updated_at = now()
    WHERE id = ${brandId}::uuid
  `;
  await logActivity(env, {
    brandId,
    actorType: 'user',
    actorUserId: actor.id,
    action: 'brand_version.published',
    entityType: 'brand_version',
    entityId: draft.id,
    afterState: { versionNumber: draft.versionNumber, summary },
  });
  const published = mapVersion(publishedRows[0] as Record<string, unknown>);
  return { published, versions: await listBrandVersions(env, brandId) };
}

function pickText(payload: Record<string, unknown> | undefined, key: string, fallback: unknown): string {
  if (!payload || payload[key] === undefined || payload[key] === null) return String(fallback ?? '');
  return String(payload[key]).trim();
}

export async function applyKnowledgeEdit(
  env: Env,
  brandId: string,
  actor: AuthUser,
  body: KnowledgeEditBody,
): Promise<{ item: Record<string, unknown> | null; draft: BrandVersionRow }> {
  if (!KNOWLEDGE_SECTIONS.includes(body.section)) throw new Error('未知的知識區塊');
  const action = body.action;
  const payload = body.payload ?? {};
  const sql = getSql(env);
  let item: Record<string, unknown> | null = null;
  let label = SECTION_LABEL[body.section];
  let before: unknown = null;
  let after: unknown = null;
  let entityId = body.id ?? null;

  if (body.section === 'core') {
    const prev = await sql`SELECT tagline FROM brands WHERE id = ${brandId}::uuid LIMIT 1`;
    if (!prev.length) throw new Error('Brand not found');
    const oldTagline = (prev[0] as { tagline: string | null }).tagline;
    if (payload.tagline === undefined) throw new Error('請填一句話定位');
    const tagline = String(payload.tagline).trim();
    if (tagline.length < 2) throw new Error('一句話定位太短');
    const updated = await sql`
      UPDATE brands SET tagline = ${tagline}, updated_at = now()
      WHERE id = ${brandId}::uuid
      RETURNING id, tagline
    `;
    item = rowToCamel(updated[0] as Record<string, unknown>);
    label = '一句話定位';
    before = oldTagline;
    after = tagline;
  } else if (body.section === 'audience') {
    if (action === 'create') {
      const name = pickText(payload, 'name', '新受眾');
      const inserted = await sql`
        INSERT INTO brand_audiences (brand_id, name, pain_points, appeal_angle, lane, sort_order)
        VALUES (
          ${brandId}::uuid, ${name},
          ${JSON.stringify(asStringList(payload.painPoints))}::jsonb,
          ${pickText(payload, 'appealAngle', '') || null},
          ${payload.lane === 'b2b' || payload.lane === 'b2c' ? payload.lane : null},
          99
        )
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = `受眾「${name}」`;
      after = item;
    } else {
      if (!body.id) throw new Error('缺少受眾 id');
      const prev = await sql`SELECT * FROM brand_audiences WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('受眾不存在');
      before = rowToCamel(prev[0] as Record<string, unknown>);
      if (action === 'delete') {
        await sql`DELETE FROM brand_audiences WHERE id = ${body.id}::uuid`;
        label = `受眾「${(before as { name?: string }).name ?? ''}」`;
      } else {
        const name = pickText(payload, 'name', (before as { name: string }).name);
        const updated = await sql`
          UPDATE brand_audiences SET
            name = ${name},
            pain_points = ${JSON.stringify(payload.painPoints !== undefined ? asStringList(payload.painPoints) : (prev[0] as { pain_points: unknown }).pain_points)}::jsonb,
            appeal_angle = ${payload.appealAngle !== undefined ? pickText(payload, 'appealAngle', '') : (prev[0] as { appeal_angle: string }).appeal_angle},
            lane = ${payload.lane !== undefined ? (payload.lane === 'b2b' || payload.lane === 'b2c' ? payload.lane : null) : (prev[0] as { lane: string | null }).lane}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = `受眾「${name}」`;
        after = item;
      }
    }
  } else if (body.section === 'persona') {
    if (action === 'create') {
      const name = pickText(payload, 'name', '新 Persona');
      const inserted = await sql`
        INSERT INTO brand_personas (brand_id, code, name, age_range, profile, pain_points, appeal_angle, lane, sort_order)
        VALUES (
          ${brandId}::uuid,
          ${pickText(payload, 'code', '') || null},
          ${name},
          ${pickText(payload, 'ageRange', '') || null},
          ${pickText(payload, 'profile', '') || null},
          ${JSON.stringify(asStringList(payload.painPoints))}::jsonb,
          ${pickText(payload, 'appealAngle', '') || null},
          ${payload.lane === 'b2b' || payload.lane === 'b2c' ? payload.lane : null},
          99
        )
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = `Persona「${name}」`;
      after = item;
    } else {
      if (!body.id) throw new Error('缺少 Persona id');
      const prev = await sql`SELECT * FROM brand_personas WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('Persona 不存在');
      before = rowToCamel(prev[0] as Record<string, unknown>);
      if (action === 'delete') {
        await sql`DELETE FROM brand_personas WHERE id = ${body.id}::uuid`;
        label = `Persona「${(before as { name?: string }).name ?? ''}」`;
      } else {
        const row = prev[0] as Record<string, unknown>;
        const name = pickText(payload, 'name', row.name);
        const updated = await sql`
          UPDATE brand_personas SET
            code = ${payload.code !== undefined ? pickText(payload, 'code', '') || null : row.code},
            name = ${name},
            age_range = ${payload.ageRange !== undefined ? pickText(payload, 'ageRange', '') || null : row.age_range},
            profile = ${payload.profile !== undefined ? pickText(payload, 'profile', '') || null : row.profile},
            pain_points = ${JSON.stringify(payload.painPoints !== undefined ? asStringList(payload.painPoints) : row.pain_points)}::jsonb,
            appeal_angle = ${payload.appealAngle !== undefined ? pickText(payload, 'appealAngle', '') : row.appeal_angle},
            lane = ${payload.lane !== undefined ? (payload.lane === 'b2b' || payload.lane === 'b2c' ? payload.lane : null) : row.lane}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = `Persona「${name}」`;
        after = item;
      }
    }
  } else if (body.section === 'channel') {
    if (!body.id) throw new Error('缺少平台調性 id');
    const prev = await sql`SELECT * FROM brand_channels WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
    if (!prev.length) throw new Error('平台調性不存在');
    const row = prev[0] as Record<string, unknown>;
    before = rowToCamel(row);
    const updated = await sql`
      UPDATE brand_channels SET
        tone_of_voice = ${payload.toneOfVoice !== undefined ? pickText(payload, 'toneOfVoice', '') : row.tone_of_voice},
        length_guideline = ${payload.lengthGuideline !== undefined ? pickText(payload, 'lengthGuideline', '') : row.length_guideline},
        format_guideline = ${payload.formatGuideline !== undefined ? pickText(payload, 'formatGuideline', '') : row.format_guideline},
        hashtag_count_min = ${payload.hashtagCountMin !== undefined ? Number(payload.hashtagCountMin) || 0 : row.hashtag_count_min},
        hashtag_count_max = ${payload.hashtagCountMax !== undefined ? Number(payload.hashtagCountMax) || 0 : row.hashtag_count_max}
      WHERE id = ${body.id}::uuid
      RETURNING *
    `;
    item = rowToCamel(updated[0] as Record<string, unknown>);
    label = `${row.platform} 平台調性`;
    after = item;
  } else if (body.section === 'rule') {
    if (action === 'create') {
      const statement = pickText(payload, 'statement', '新規則');
      const ruleType = ['can_claim', 'cannot_claim', 'marketing_rule', 'negative_rule'].includes(String(payload.ruleType))
        ? String(payload.ruleType)
        : 'marketing_rule';
      const inserted = await sql`
        INSERT INTO brand_rules (brand_id, rule_type, statement, condition_note, verification)
        VALUES (
          ${brandId}::uuid, ${ruleType}, ${statement},
          ${pickText(payload, 'conditionNote', '') || null},
          ${['verified', 'claimed', 'pending'].includes(String(payload.verification)) ? String(payload.verification) : 'pending'}
        )
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = clip(statement);
      after = item;
    } else {
      if (!body.id) throw new Error('缺少規則 id');
      const prev = await sql`SELECT * FROM brand_rules WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('規則不存在');
      const row = prev[0] as Record<string, unknown>;
      before = rowToCamel(row);
      if (action === 'delete') {
        await sql`DELETE FROM brand_rules WHERE id = ${body.id}::uuid`;
        label = clip(row.statement);
      } else {
        const statement = pickText(payload, 'statement', row.statement);
        const updated = await sql`
          UPDATE brand_rules SET
            statement = ${statement},
            condition_note = ${payload.conditionNote !== undefined ? pickText(payload, 'conditionNote', '') || null : row.condition_note},
            verification = ${payload.verification !== undefined && ['verified', 'claimed', 'pending'].includes(String(payload.verification)) ? String(payload.verification) : row.verification},
            rule_type = ${payload.ruleType !== undefined && ['can_claim', 'cannot_claim', 'marketing_rule', 'negative_rule'].includes(String(payload.ruleType)) ? String(payload.ruleType) : row.rule_type}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = clip(statement);
        after = item;
      }
    }
  } else if (body.section === 'visual') {
    if (action === 'create') {
      const labelText = pickText(payload, 'label', '新視覺項目');
      const inserted = await sql`
        INSERT INTO brand_visuals (brand_id, label, value, category, sort_order)
        VALUES (
          ${brandId}::uuid, ${labelText},
          ${pickText(payload, 'value', '')},
          ${['color', 'layout', 'typography'].includes(String(payload.category)) ? String(payload.category) : 'color'},
          99
        )
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = labelText;
      after = item;
    } else {
      if (!body.id) throw new Error('缺少視覺項目 id');
      const prev = await sql`SELECT * FROM brand_visuals WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('視覺項目不存在');
      const row = prev[0] as Record<string, unknown>;
      before = rowToCamel(row);
      if (action === 'delete') {
        await sql`DELETE FROM brand_visuals WHERE id = ${body.id}::uuid`;
        label = String(row.label);
      } else {
        const labelText = pickText(payload, 'label', row.label);
        const updated = await sql`
          UPDATE brand_visuals SET
            label = ${labelText},
            value = ${payload.value !== undefined ? pickText(payload, 'value', '') : row.value},
            category = ${payload.category !== undefined && ['color', 'layout', 'typography'].includes(String(payload.category)) ? String(payload.category) : row.category}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = labelText;
        after = item;
      }
    }
  } else if (body.section === 'keyword') {
    if (action === 'create') {
      const value = pickText(payload, 'value', '');
      if (!value) throw new Error('請填關鍵字');
      const category = ['hashtag', 'cta', 'key_message'].includes(String(payload.category))
        ? String(payload.category)
        : 'key_message';
      const inserted = await sql`
        INSERT INTO brand_keywords (brand_id, category, value)
        VALUES (${brandId}::uuid, ${category}, ${value})
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = `${category} ${value}`;
      after = item;
    } else {
      if (!body.id) throw new Error('缺少關鍵字 id');
      const prev = await sql`SELECT * FROM brand_keywords WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('關鍵字不存在');
      const row = prev[0] as Record<string, unknown>;
      before = rowToCamel(row);
      if (action === 'delete') {
        await sql`DELETE FROM brand_keywords WHERE id = ${body.id}::uuid`;
        label = String(row.value);
      } else {
        const value = pickText(payload, 'value', row.value);
        const updated = await sql`
          UPDATE brand_keywords SET
            value = ${value},
            category = ${payload.category !== undefined && ['hashtag', 'cta', 'key_message'].includes(String(payload.category)) ? String(payload.category) : row.category}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = value;
        after = item;
      }
    }
  } else if (body.section === 'example') {
    if (action === 'create') {
      const title = pickText(payload, 'title', '新主題');
      const category = ['content_pillar', 'hot_topic_bank', 'storytelling', 'competitor'].includes(String(payload.category))
        ? String(payload.category)
        : 'content_pillar';
      const inserted = await sql`
        INSERT INTO brand_examples (brand_id, category, title, body, weight_percent)
        VALUES (
          ${brandId}::uuid, ${category}, ${title},
          ${pickText(payload, 'body', '') || null},
          ${payload.weightPercent !== undefined && payload.weightPercent !== '' ? Number(payload.weightPercent) : null}
        )
        RETURNING *
      `;
      item = rowToCamel(inserted[0] as Record<string, unknown>);
      entityId = item.id as string;
      label = title;
      after = item;
    } else {
      if (!body.id) throw new Error('缺少內容條目 id');
      const prev = await sql`SELECT * FROM brand_examples WHERE id = ${body.id}::uuid AND brand_id = ${brandId}::uuid LIMIT 1`;
      if (!prev.length) throw new Error('內容條目不存在');
      const row = prev[0] as Record<string, unknown>;
      before = rowToCamel(row);
      if (action === 'delete') {
        await sql`DELETE FROM brand_examples WHERE id = ${body.id}::uuid`;
        label = String(row.title);
      } else {
        const title = pickText(payload, 'title', row.title);
        const updated = await sql`
          UPDATE brand_examples SET
            title = ${title},
            body = ${payload.body !== undefined ? pickText(payload, 'body', '') || null : row.body},
            weight_percent = ${payload.weightPercent !== undefined ? (payload.weightPercent === '' || payload.weightPercent === null ? null : Number(payload.weightPercent)) : row.weight_percent},
            category = ${payload.category !== undefined && ['content_pillar', 'hot_topic_bank', 'storytelling', 'competitor'].includes(String(payload.category)) ? String(payload.category) : row.category}
          WHERE id = ${body.id}::uuid
          RETURNING *
        `;
        item = rowToCamel(updated[0] as Record<string, unknown>);
        label = title;
        after = item;
      }
    }
  } else {
    throw new Error('此區塊請用原本的儲存按鈕');
  }

  const draft = await recordKnowledgeChange(env, {
    brandId,
    actor,
    section: body.section,
    action,
    entityId,
    label,
    before,
    after,
  });
  return { item, draft };
}

export function canEditBrandKnowledge(user: AuthUser): boolean {
  return user.role !== 'viewer';
}

export function canPublishBrandVersion(user: AuthUser): boolean {
  return user.role === 'super_admin' || user.role === 'brand_manager' || user.role === 'brand_editor';
}
