import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { DEFAULT_SLOT_DEFS } from './posting-slots';
import {
  fallbackSeoTopics, replaceBrandSeoTopics,
} from './seo-topics';
import type { SeoTopicSeed } from './prompts';
import { SHARED_BRAND_CTA } from './prompts';
import { defaultPromptForSlot, IMAGE_PROMPT_SLOTS, ensureImagePromptTable } from './image-prompts';

const RESERVED_SLUGS = new Set([
  'settings', 'login', 'privacy', 'checkin', 'podcast', 'meetings', 'decisions',
  'collaborations', 'timeline', 'trending', 'personas', 'admin', 'api', 'media',
  'e', 'go', 'dashboard',
]);

export interface OnboardBrandInput {
  name: string;
  slug: string;
  tagline?: string;
  primaryColor?: string;
  industry: string;
  audience?: string;
  websiteUrl?: string;
  blogBaseUrl?: string;
  ingestBaseUrl?: string;
  cta?: string;
  editorNickname?: string;
}

export interface OnboardBrandResult {
  brandId: string;
  slug: string;
  name: string;
  seoTopicCount: number;
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function validateOnboardInput(input: OnboardBrandInput): OnboardBrandInput {
  const name = input.name.trim();
  if (!name) throw new Error('請填品牌名稱');
  const slug = normalizeSlug(input.slug || name);
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(slug)) {
    throw new Error('網址代碼需為 2-32 字的英文小寫、數字或連字號，並以英文開頭');
  }
  if (RESERVED_SLUGS.has(slug)) throw new Error(`「${slug}」是系統保留代碼，請換一個`);
  const industry = input.industry.trim();
  if (industry.length < 8) throw new Error('請用幾句話說明這個品牌做什麼、給誰用');
  const color = (input.primaryColor || '#3A5A7C').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('主色請用 #RRGGBB');
  return {
    name,
    slug,
    tagline: input.tagline?.trim() || `${name}，把日常作業收回同一個地方`,
    primaryColor: color,
    industry,
    audience: input.audience?.trim() || '',
    websiteUrl: input.websiteUrl?.trim() || '',
    blogBaseUrl: input.blogBaseUrl?.trim() || input.websiteUrl?.trim() || '',
    ingestBaseUrl: input.ingestBaseUrl?.trim() || '',
    cta: input.cta?.trim() || SHARED_BRAND_CTA,
    editorNickname: input.editorNickname?.trim() || '小編',
  };
}

async function generateSeoTopics(env: Env, input: OnboardBrandInput): Promise<SeoTopicSeed[]> {
  try {
    const result = await chatCompleteJson<{ topics: SeoTopicSeed[] }>(env, {
      messages: [
        {
          role: 'system',
          content: '你是台灣 B2B／生活服務品牌的 SEO 企劃。只根據已知產品事實出題，不可發明客戶數、市佔或保證成效。',
        },
        {
          role: 'user',
          content: [
            `品牌:${input.name}`,
            `定位:${input.tagline}`,
            `產業與產品:${input.industry}`,
            input.audience ? `受眾:${input.audience}` : '',
            '請產出 4 個官網 SEO 長文題，不要一次出 8 題。一半偏搜尋痛點、一半偏產品怎麼用。之後再用「搜尋新文章」補還沒覆蓋的題。',
            '回傳 JSON:{"topics":[{"topic":"中文題目","angle":"寫作角度40-80字","primaryKeyword":"主關鍵字","relatedTerms":["相關詞"],"category":"pain|product|policy|trust|talk","searchIntent":"informational|solution","audience":"consumer|merchant"}]}',
          ].filter(Boolean).join('\n'),
        },
      ],
      temperature: 0.5,
      maxTokens: 2500,
    });
    const topics = (result.topics ?? []).filter((t) => t.topic && t.angle).slice(0, 4);
    if (topics.length >= 4) return topics;
  } catch (e) {
    console.error('[onboard] SEO 主題生成失敗，改用後備題庫', e);
  }
  return fallbackSeoTopics(input.name, input.industry);
}

export async function onboardBrand(env: Env, raw: OnboardBrandInput, actorUserId: string): Promise<OnboardBrandResult> {
  const input = validateOnboardInput(raw);
  const sql = getSql(env);

  const exists = await sql`SELECT id FROM brands WHERE slug = ${input.slug} LIMIT 1`;
  if (exists.length) throw new Error(`品牌代碼 ${input.slug} 已存在`);

  const brandRows = await sql`
    INSERT INTO brands (
      slug, name, tagline, primary_color, website_url, website_note,
      blog_base_url, ingest_base_url, is_active
    )
    VALUES (
      ${input.slug}, ${input.name}, ${input.tagline}, ${input.primaryColor},
      ${input.websiteUrl || null}, ${input.industry},
      ${input.blogBaseUrl || null}, ${input.ingestBaseUrl || null}, true
    )
    RETURNING id
  `;
  const brandId = String((brandRows[0] as { id: string }).id);

  const versionRows = await sql`
    INSERT INTO brand_versions (
      brand_id, version_number, status, summary_of_changes, compiled_markdown,
      confidence_score, published_by, published_at
    )
    VALUES (
      ${brandId}::uuid, 1, 'published',
      ${`首版：${input.name} 加入 Go 行銷中心`},
      ${`# ${input.name}\n\n${input.tagline}\n\n${input.industry}\n\n受眾：${input.audience || '待補'}`},
      0.7, ${actorUserId}::uuid, now()
    )
    RETURNING id
  `;
  const versionId = String((versionRows[0] as { id: string }).id);
  await sql`UPDATE brands SET current_version_id = ${versionId}::uuid WHERE id = ${brandId}::uuid`;

  const audienceName = input.audience || `${input.name} 主要客戶`;
  await sql`
    INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order, lane)
    VALUES
      (${brandId}::uuid, ${versionId}::uuid, ${audienceName}, ${JSON.stringify(['日常作業散落在 LINE 與 Excel'])}::jsonb, ${'把流程收回同一個地方'}, 1, 'b2b'),
      (${brandId}::uuid, ${versionId}::uuid, ${`${input.name} 使用者`}, ${JSON.stringify(['不知道下一步怎麼做'])}::jsonb, ${'步驟清楚、語氣像現場的人'}, 2, 'b2c')
  `;

  await sql`
    INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, verification, sort_order)
    VALUES
      (${brandId}::uuid, ${versionId}::uuid, 'can_claim', ${input.industry}, 'claimed', 1),
      (${brandId}::uuid, ${versionId}::uuid, 'cannot_claim', '不可發明客戶數、市佔、營收、滿意度或保證成效', 'verified', 2),
      (${brandId}::uuid, ${versionId}::uuid, 'negative_rule', '不可寫成保證成功、全台第一，或與產品無關的誇大承諾', 'verified', 3),
      (${brandId}::uuid, ${versionId}::uuid, 'marketing_rule', ${`社群主 CTA 用匠管窗口；官網長文可用品牌指定行動呼籲：${input.cta}`}, 'verified', 4)
  `;

  await sql`
    INSERT INTO brand_channels (brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max, posting_frequency)
    VALUES
      (${brandId}::uuid, ${versionId}::uuid, 'facebook', '完整敘事、專業可信', '150-400字', '痛點 → 解法 → CTA', 2, 3, '每天台灣 19:00 業者主題'),
      (${brandId}::uuid, ${versionId}::uuid, 'instagram', '視覺優先、短 hook', '80-180字', '4:5 痛點海報+現場畫面', 8, 12, '每天台灣 19:00 業者主題'),
      (${brandId}::uuid, ${versionId}::uuid, 'threads', '口語、短、敢聊現場', '1-3 段', '每檔照發文時段主題寫', 0, 4, '依發文時段')
  `;
  try {
    await sql`
      INSERT INTO brand_channels (brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline, posting_frequency)
      VALUES (${brandId}::uuid, ${versionId}::uuid, 'website', '專業、答案先行', '500-1800字', 'answer-first SEO 長文', '依主題庫')
    `;
  } catch (e) {
    console.error('[onboard] website 頻道略過', e);
  }

  const hashtags = [
    `#${input.name.replace(/\s+/g, '')}`,
    `#${input.slug}`,
    input.industry.slice(0, 12),
  ];
  await sql`
    INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
    VALUES
      (${brandId}::uuid, ${versionId}::uuid, 'hashtag', ${hashtags[0]}),
      (${brandId}::uuid, ${versionId}::uuid, 'hashtag', ${hashtags[1]}),
      (${brandId}::uuid, ${versionId}::uuid, 'key_message', ${input.tagline}),
      (${brandId}::uuid, ${versionId}::uuid, 'cta', ${SHARED_BRAND_CTA}),
      (${brandId}::uuid, ${versionId}::uuid, 'website_cta', ${input.cta})
  `;

  await sql`
    INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
    VALUES
      (${brandId}::uuid, ${versionId}::uuid, '主色', ${input.primaryColor}, 'color', 1),
      (${brandId}::uuid, ${versionId}::uuid, 'IG輪播尺寸', '1080x1350 (4:5)', 'layout', 2)
  `;

  const platforms = DEFAULT_SLOT_DEFS.map((d) => d.platform);
  const hours = DEFAULT_SLOT_DEFS.map((d) => d.hourTw);
  const kinds = DEFAULT_SLOT_DEFS.map((d) => d.slotKind);
  await sql`
    INSERT INTO brand_posting_slots (brand_id, platform, hour_tw, slot_kind, enabled)
    SELECT ${brandId}::uuid, t.platform::publishing_platform, t.hour_tw, t.slot_kind, true
    FROM unnest(
      ${platforms}::text[],
      ${hours}::int[],
      ${kinds}::text[]
    ) AS t(platform, hour_tw, slot_kind)
    ON CONFLICT (brand_id, platform, hour_tw, slot_kind) DO NOTHING
  `;

  try {
    await ensureImagePromptTable(env);
    for (const slot of IMAGE_PROMPT_SLOTS) {
      const prompt = defaultPromptForSlot(input.slug, slot);
      await sql`
        INSERT INTO brand_image_prompts (brand_id, slot, prompt)
        VALUES (${brandId}::uuid, ${slot}, ${prompt})
        ON CONFLICT (brand_id, slot) DO NOTHING
      `;
    }
  } catch (e) {
    console.error('[onboard] 圖片 prompt 種子略過', e);
  }

  await sql`
    INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, is_active)
    SELECT ${brandId}::uuid, r.id, ${`${input.name} ${input.editorNickname}`}, ${input.primaryColor}, true
    FROM agent_roles r
    WHERE r.code = 'brand_ai'
    LIMIT 1
  `;

  await sql`
    INSERT INTO brand_members (brand_id, user_id, role)
    VALUES (${brandId}::uuid, ${actorUserId}::uuid, 'super_admin')
    ON CONFLICT (brand_id, user_id) DO NOTHING
  `;

  const topics = await generateSeoTopics(env, input);
  await replaceBrandSeoTopics(env, brandId, topics);

  return {
    brandId,
    slug: input.slug,
    name: input.name,
    seoTopicCount: topics.length,
  };
}
