import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { runWithUsage } from './llm-usage';
import { VOICE_PRESETS, type VoiceGender } from './brand-onboard';
import { SHARED_BRAND_CTA } from './prompts';

interface CompilePersona {
  name?: string;
  ageRange?: string;
  profile?: string;
  painPoints?: string[];
  appealAngle?: string;
  lane?: string;
}

interface CompileAudience {
  name?: string;
  painPoints?: string[];
  appealAngle?: string;
  lane?: string;
}

interface CompileRule {
  ruleType?: string;
  statement?: string;
}

interface CompileKeyword {
  category?: string;
  value?: string;
}

interface CompileChannel {
  platform?: string;
  toneOfVoice?: string;
}

interface CompileDraft {
  tagline?: string;
  websiteNote?: string;
  personas?: CompilePersona[];
  audiences?: CompileAudience[];
  rules?: CompileRule[];
  keywords?: CompileKeyword[];
  channels?: CompileChannel[];
  compiledMarkdown?: string;
}

const RULE_TYPES = new Set(['can_claim', 'cannot_claim', 'marketing_rule', 'negative_rule']);
const KEYWORD_CATEGORIES = new Set(['hashtag', 'key_message', 'cta', 'website_cta']);
const CHANNELS = new Set(['facebook', 'instagram', 'threads', 'website']);

function laneOf(value: string | undefined): 'b2b' | 'b2c' {
  return value === 'b2c' ? 'b2c' : 'b2b';
}

function asList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit);
}

async function fetchHomepageText(url: string): Promise<string> {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GoMarketingBot' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  } catch {
    return '';
  }
}

export async function compileBrandIntelligence(env: Env, brandId: string, actorUserId: string): Promise<{
  personaCount: number;
  documentCount: number;
  usedWebsite: boolean;
}> {
  const sql = getSql(env);
  const brandRows = await sql`
    SELECT id, slug, name, tagline, website_url, website_note
    FROM brands WHERE id = ${brandId}::uuid LIMIT 1
  `;
  if (!brandRows.length) throw new Error('找不到品牌');
  const brand = brandRows[0] as {
    id: string; slug: string; name: string; tagline: string | null; website_url: string | null; website_note: string | null;
  };

  const [docs, assets, agents] = await Promise.all([
    sql`
      SELECT title, raw_content, key_points, extract_status
      FROM brand_documents
      WHERE brand_id = ${brandId}::uuid
      ORDER BY created_at DESC
      LIMIT 8
    `.catch(() => []),
    sql`
      SELECT name, caption FROM brand_assets
      WHERE brand_id = ${brandId}::uuid AND asset_type = 'image'
      ORDER BY created_at DESC LIMIT 12
    `.catch(() => []),
    sql`
      SELECT persona FROM ai_agents
      WHERE brand_id = ${brandId}::uuid AND is_active = true
      ORDER BY created_at ASC LIMIT 1
    `.catch(() => []),
  ]);

  const persona = ((agents[0] as { persona?: { voiceGender?: string } } | undefined)?.persona) ?? {};
  const voiceGender: VoiceGender = persona.voiceGender === 'male' ? 'male' : 'female';
  const voiceLabel = VOICE_PRESETS[voiceGender].label;
  const homepage = await fetchHomepageText(brand.website_url ?? '');

  const docLines = (docs as { title: string | null; raw_content: string | null; key_points: unknown; extract_status: string | null }[])
    .map((doc) => {
      const points = asList(doc.key_points, 8).join('、');
      return `- ${doc.title ?? '未命名'}（${doc.extract_status ?? 'unknown'}）${doc.raw_content ? `：${doc.raw_content.slice(0, 300)}` : ''}${points ? `；賣點：${points}` : ''}`;
    });
  const assetLines = (assets as { name: string | null; caption: string | null }[])
    .map((asset) => `- ${asset.name ?? '照片'}${asset.caption ? `：${asset.caption}` : ''}`);

  const draft = await runWithUsage({ brandId, feature: 'brand_compile' }, () => chatCompleteJson<CompileDraft>(env, {
    messages: [
      {
        role: 'system',
        content: '你是台灣品牌策略。只根據提供的資料整理品牌智慧。不可發明客戶數、市佔、營收、滿意度、媒體露出或保證成效。不知道就不要寫。',
      },
      {
        role: 'user',
        content: [
          `品牌：${brand.name}`,
          `定位：${brand.tagline ?? ''}`,
          `已知說明：${brand.website_note ?? ''}`,
          `聲音：${voiceLabel}`,
          homepage ? `官網首頁文字：${homepage}` : '沒有抓到官網文字。',
          docLines.length ? `簡報與文件：\n${docLines.join('\n')}` : '尚未有抽出的簡報重點。',
          assetLines.length ? `照片素材檔名：\n${assetLines.join('\n')}` : '尚未上傳照片。',
          '請回傳 JSON：{"tagline":"一句定位","websiteNote":"給產文用的官網說明，80字內","personas":[{"name":"","ageRange":"","profile":"","painPoints":[],"appealAngle":"","lane":"b2b"}],"audiences":[{"name":"","painPoints":[],"appealAngle":"","lane":"b2b"}],"rules":[{"ruleType":"can_claim","statement":""}],"keywords":[{"category":"hashtag","value":""}],"channels":[{"platform":"facebook","toneOfVoice":""}],"compiledMarkdown":"繁中品牌簡介"}',
          'personas 與 audiences 各 2 則。rules 只寫看得到的事實與禁止事項。hashtag 最多 6 個。compiledMarkdown 用標題與短段落，不要表格。',
        ].join('\n\n'),
      },
    ],
    temperature: 0.4,
    maxTokens: 3500,
  }));

  const personas = (draft.personas ?? []).filter((p) => p.name?.trim()).slice(0, 4);
  const audiences = (draft.audiences ?? []).filter((a) => a.name?.trim()).slice(0, 4);
  const rules = (draft.rules ?? [])
    .filter((rule) => rule.statement?.trim() && RULE_TYPES.has(rule.ruleType ?? ''))
    .slice(0, 12);
  const keywords = (draft.keywords ?? [])
    .filter((item) => item.value?.trim() && KEYWORD_CATEGORIES.has(item.category ?? ''))
    .slice(0, 16);
  const channels = (draft.channels ?? [])
    .filter((item) => item.toneOfVoice?.trim() && CHANNELS.has(item.platform ?? ''));

  const versionRows = await sql`
    SELECT coalesce(max(version_number), 0)::int AS n
    FROM brand_versions WHERE brand_id = ${brandId}::uuid
  `;
  const nextVersion = Number((versionRows[0] as { n: number }).n) + 1;
  const markdown = (draft.compiledMarkdown?.trim() || `# ${brand.name}\n\n${draft.tagline ?? brand.tagline ?? ''}`).slice(0, 8000);
  const insertedVersion = await sql`
    INSERT INTO brand_versions (
      brand_id, version_number, status, summary_of_changes, compiled_markdown,
      confidence_score, published_by, published_at
    )
    VALUES (
      ${brandId}::uuid, ${nextVersion}, 'published',
      ${'由系統整理官網、簡報與照片後發布'},
      ${markdown},
      0.6, ${actorUserId}::uuid, now()
    )
    RETURNING id
  `;
  const versionId = String((insertedVersion[0] as { id: string }).id);

  const tagline = draft.tagline?.trim().slice(0, 180) || brand.tagline;
  const websiteNote = draft.websiteNote?.trim().slice(0, 400) || brand.website_note;
  await sql`
    UPDATE brands
    SET tagline = ${tagline}, website_note = ${websiteNote}, current_version_id = ${versionId}::uuid
    WHERE id = ${brandId}::uuid
  `;

  await sql`DELETE FROM brand_personas WHERE brand_id = ${brandId}::uuid`;
  await sql`DELETE FROM brand_audiences WHERE brand_id = ${brandId}::uuid`;
  await sql`DELETE FROM brand_rules WHERE brand_id = ${brandId}::uuid`;
  await sql`
    DELETE FROM brand_keywords
    WHERE brand_id = ${brandId}::uuid AND category IN ('hashtag', 'key_message')
  `;

  const audienceRows = audiences.length
    ? audiences
    : [{ name: `${brand.name} 主要客戶`, painPoints: ['日常作業分散'], appealAngle: '把事情收回同一個地方', lane: 'b2b' }];
  for (let i = 0; i < audienceRows.length; i += 1) {
    const audience = audienceRows[i];
    await sql`
      INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order, lane)
      VALUES (
        ${brandId}::uuid, ${versionId}::uuid, ${audience.name!.trim()},
        ${JSON.stringify(asList(audience.painPoints, 6))}::jsonb,
        ${audience.appealAngle?.trim() || null}, ${i + 1}, ${laneOf(audience.lane)}
      )
    `;
  }

  const personaRows: CompilePersona[] = personas.length ? personas : audienceRows.map((audience) => ({
    name: audience.name,
    profile: audience.appealAngle,
    painPoints: audience.painPoints,
    appealAngle: audience.appealAngle,
    lane: audience.lane,
  }));
  for (let i = 0; i < personaRows.length; i += 1) {
    const personaRow = personaRows[i];
    await sql`
      INSERT INTO brand_personas (
        brand_id, brand_version_id, code, name, age_range, profile, pain_points, appeal_angle, lane, sort_order
      )
      VALUES (
        ${brandId}::uuid, ${versionId}::uuid, ${`P${i + 1}`}, ${personaRow.name!.trim()},
        ${personaRow.ageRange?.trim() || null}, ${personaRow.profile?.trim() || null},
        ${JSON.stringify(asList(personaRow.painPoints, 6))}::jsonb,
        ${personaRow.appealAngle?.trim() || null}, ${laneOf(personaRow.lane)}, ${i + 1}
      )
    `;
  }

  const fixedRules: CompileRule[] = [
    { ruleType: 'cannot_claim', statement: '不可發明客戶數、市佔、營收、滿意度或保證成效' },
    { ruleType: 'negative_rule', statement: '不可寫成保證成功、全台第一，或與產品無關的誇大承諾' },
    { ruleType: 'marketing_rule', statement: `社群主 CTA 用匠管窗口。聲音：${voiceLabel}` },
  ];
  const seen = new Set(fixedRules.map((rule) => rule.statement));
  const ruleRows = [
    ...fixedRules,
    ...rules.filter((rule) => rule.statement && !seen.has(rule.statement.trim())),
  ];
  for (let i = 0; i < ruleRows.length; i += 1) {
    const rule = ruleRows[i];
    await sql`
      INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, verification, sort_order)
      VALUES (
        ${brandId}::uuid, ${versionId}::uuid, ${rule.ruleType}::brand_rule_type,
        ${rule.statement!.trim()}, 'claimed', ${i + 1}
      )
    `;
  }

  const keywordRows = keywords.filter((item) => item.category === 'hashtag' || item.category === 'key_message');
  if (!keywordRows.some((item) => item.category === 'key_message') && tagline) {
    keywordRows.push({ category: 'key_message', value: tagline });
  }
  for (const item of keywordRows) {
    await sql`
      INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
      VALUES (${brandId}::uuid, ${versionId}::uuid, ${item.category}, ${item.value!.trim()})
    `;
  }
  await sql`
    INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
    SELECT ${brandId}::uuid, ${versionId}::uuid, 'cta', ${SHARED_BRAND_CTA}
    WHERE NOT EXISTS (
      SELECT 1 FROM brand_keywords WHERE brand_id = ${brandId}::uuid AND category = 'cta'
    )
  `;

  for (const channel of channels) {
    const tone = channel.toneOfVoice!.includes('聲音：')
      ? channel.toneOfVoice!.trim()
      : `${channel.toneOfVoice!.trim()}。聲音：${voiceLabel}`;
    await sql`
      UPDATE brand_channels
      SET tone_of_voice = ${tone.slice(0, 240)}, brand_version_id = ${versionId}::uuid
      WHERE brand_id = ${brandId}::uuid AND platform::text = ${channel.platform}
    `.catch((e) => {
      console.error('[compile] 平台調性略過', channel.platform, e);
    });
  }

  return {
    personaCount: personaRows.length,
    documentCount: docs.length,
    usedWebsite: Boolean(homepage),
  };
}
