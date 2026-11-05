import type { Env } from './env';
import type { AuthUser } from './auth';
import { canAccessBrandSlug } from './auth';
import { getSql } from './db';
import { getBrandBySlug, getBrandsForUser } from './queries';
import { getBrandVoice } from './prompts';
import { hashToken } from './mcp-auth';
import { ensureBrandAssetLibrary } from './brand-assets';
import { buildBrandLibraryKey, putMedia } from './media';
import {
  executeEditorTool,
  loadBrandEditor,
  type EditorDeskContext,
  type EditorDraftCard,
  type EditorToolResult,
} from './editor-agent';

const PORTFOLIO = ['taskgo', 'homigo', 'washgo'] as const;
const PLATFORMS = ['threads', 'facebook', 'instagram'] as const;
const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;

const PLATFORM_LABEL: Record<(typeof PLATFORMS)[number], string> = {
  threads: 'Threads',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const VIDEO_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const WRITE_TOOLS = new Set(['save_image_asset', 'create_video_upload', 'draft_post', 'schedule_post']);

export const MCP_TOOLS = [
  {
    name: 'list_brands',
    description: '列出這把金鑰看得到的品牌。回傳 slug 與名稱，不含帳號密鑰。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_brand_context',
    description: '讀單一品牌的語氣、小編人設、待審稿、未來行程與近期素材。討論「接下來發什麼」時先呼叫這支。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: '品牌 slug，例如 taskgo、homigo、washgo、bbbox' },
      },
      required: ['brand'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_performance',
    description: '讀單一品牌近 7 日與近 28 日的發文數、曝光、互動，以及互動較高的已發貼文。不要自行補數字。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: '品牌 slug' },
      },
      required: ['brand'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_portfolio',
    description: '三品牌總和助理用。只回 TaskGo、Homigo、Washgo 的近 1／7／28 日成效、待審與下一檔。不含和居家居。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_market_signals',
    description: '讀單一品牌最近的市場情報標題與狀態。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: '品牌 slug' },
      },
      required: ['brand'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_image_asset',
    description: '把使用者傳來的圖片存進該品牌素材庫。image_base64 可含 data URL 前綴。上限約 8MB。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        name: { type: 'string', description: '素材名稱' },
        image_base64: { type: 'string' },
        mime_type: { type: 'string', description: 'image/jpeg、image/png、image/webp、image/gif' },
        caption: { type: 'string' },
        usage_context: { type: 'string', description: '這張圖適合用在什麼貼文' },
      },
      required: ['brand', 'name', 'image_base64'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_video_upload',
    description: '影片不放在參數裡。回一個 15 分鐘、一次性的上傳網址，收到檔案後寫進該品牌素材庫。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        name: { type: 'string' },
        caption: { type: 'string' },
      },
      required: ['brand', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_post',
    description: '用站內品牌語氣產一篇待審稿，不排程、不發到平台。使用者還沒明確說要發時用這支。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        platform: { type: 'string', enum: ['threads', 'facebook', 'instagram'] },
        topic: { type: 'string', description: '貼文切角，必須落在品牌可講的範圍' },
        instruction: { type: 'string', description: '補充條件，例如要引用哪張素材' },
      },
      required: ['brand', 'topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_post',
    description: '只有使用者這則訊息明確說要發或排程時，才可把 mode 設為 publish。mode 不是 publish 就只留待審。publish 還要行銷中心總開關與該平台自動發佈都開著，才會建立發布單。',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        mode: { type: 'string', enum: ['review', 'publish'] },
        platform: { type: 'string', enum: ['threads', 'facebook', 'instagram'] },
        topic: { type: 'string' },
        instruction: { type: 'string' },
        content_id: { type: 'string' },
        content_version_id: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO 時間。太近或空白時改用下一個合適檔期。' },
      },
      required: ['brand'],
      additionalProperties: false,
    },
  },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]['name'];

const KNOWN_TOOLS = new Set<string>(MCP_TOOLS.map((tool) => tool.name));

export interface McpToolOutcome {
  ok: boolean;
  brandSlug: string | null;
  payload: unknown;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function slugOf(value: unknown): string {
  return text(value, 40).toLowerCase();
}

function platformOf(value: unknown): (typeof PLATFORMS)[number] {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)
    ? value as (typeof PLATFORMS)[number]
    : 'threads';
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url || url.startsWith('data:')) return null;
  return url;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

async function requireBrand(env: Env, user: AuthUser, raw: unknown) {
  const slug = slugOf(raw);
  if (!slug) return { error: '要指定品牌 slug' as const };
  if (!canAccessBrandSlug(user, slug)) return { error: '沒有這個品牌的權限' as const };
  const brand = await getBrandBySlug(env, slug);
  if (!brand) return { error: '找不到這個品牌' as const };
  return { brand };
}

function compactContext(context: EditorDeskContext) {
  return {
    schedule: context.schedule.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      platform: item.platform,
      status: item.status,
      scheduledAt: item.scheduledAt,
      body: clip(item.body, 180),
    })),
    queue: context.queue.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      platform: item.targetPlatform,
      body: clip(item.body, 180),
    })),
    assets: context.assets.slice(0, 12).map((item) => ({
      id: item.id,
      caption: item.caption,
      fileUrl: safeUrl(item.fileUrl),
    })),
    press: context.pressCoverages.slice(0, 5).map((item) => ({
      outlet: item.outlet,
      headline: item.headline,
      publishedOn: item.publishedOn,
    })),
  };
}

function compactDraft(draft: EditorDraftCard | undefined) {
  if (!draft) return null;
  return {
    contentId: draft.contentId,
    contentVersionId: draft.contentVersionId,
    platform: draft.platform,
    title: draft.title,
    status: draft.status,
    scheduledAt: draft.scheduledAt ?? null,
    body: clip(draft.body, 1500),
    imageUrl: safeUrl(draft.imageUrl),
  };
}

async function markMcpSource(env: Env, brandId: string, contentId: string | undefined) {
  if (!contentId) return;
  const sql = getSql(env);
  await sql`
    UPDATE contents
    SET generation_prompt_meta = coalesce(generation_prompt_meta, '{}'::jsonb) || '{"source":"mcp"}'::jsonb
    WHERE id = ${contentId}::uuid AND brand_id = ${brandId}::uuid
  `;
}

function decodeBase64(input: string): Uint8Array {
  const cleaned = input.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sniffImage(bytes: Uint8Array, declared: string): { mime: string; ext: string } | null {
  const mime = IMAGE_MIME[declared] ? declared : '';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (mime && IMAGE_MIME[mime]) return { mime, ext: IMAGE_MIME[mime] };
  return null;
}

async function publishGate(env: Env, brandId: string, platform: (typeof PLATFORMS)[number]) {
  const sql = getSql(env);
  const label = PLATFORM_LABEL[platform];
  try {
    const settings = await sql`SELECT auto_publish FROM office_settings WHERE id = 1`;
    const office = settings[0] as { auto_publish?: boolean } | undefined;
    if (office && office.auto_publish === false) {
      return { open: false, reason: '行銷中心總開關是關的，稿留在待審，沒有建立發布單。' };
    }
  } catch {
    return { open: false, reason: '讀不到行銷中心總開關，稿留在待審，沒有建立發布單。' };
  }
  try {
    const accounts = await sql`
      SELECT auto_publish FROM brand_social_accounts
      WHERE brand_id = ${brandId}::uuid AND platform = ${platform}
      LIMIT 1
    `;
    const account = accounts[0] as { auto_publish?: boolean } | undefined;
    if (!account) return { open: false, reason: `尚未連接 ${label} 帳號，稿留在待審，沒有建立發布單。` };
    if (!account.auto_publish) {
      return { open: false, reason: `${label} 的自動發佈是關的，稿留在待審。請到社群帳號打開，或在工作台核准。` };
    }
  } catch {
    return { open: false, reason: '讀不到社群帳號的自動發佈開關，稿留在待審，沒有建立發布單。' };
  }
  return { open: true, reason: null };
}

async function runEditor(
  env: Env,
  user: AuthUser,
  brand: { id: string; slug: string; name: string },
  args: {
    name: 'list_context' | 'draft_post' | 'schedule_post';
    platform?: string;
    topic?: string;
    instruction?: string;
    contentId?: string;
    contentVersionId?: string;
    scheduledAt?: string;
    mode?: 'review' | 'publish';
  },
): Promise<EditorToolResult> {
  return executeEditorTool(env, {
    brandId: brand.id,
    slug: brand.slug,
    brandName: brand.name,
    auth: user,
    args,
  });
}

export async function callMcpTool(
  env: Env,
  user: AuthUser,
  keyId: string,
  name: string,
  args: Record<string, unknown>,
  origin: string,
): Promise<McpToolOutcome> {
  if (!KNOWN_TOOLS.has(name)) {
    return { ok: false, brandSlug: null, payload: { error: '未知工具' } };
  }
  if (user.role === 'viewer' && WRITE_TOOLS.has(name)) {
    return {
      ok: false,
      brandSlug: slugOf(args.brand) || null,
      payload: { error: '這個帳號是唯讀，不能產稿、排程或上傳素材。' },
    };
  }

  if (name === 'list_brands') {
    const brands = await getBrandsForUser(env, user);
    return {
      ok: true,
      brandSlug: null,
      payload: {
        summary: `看得到 ${brands.length} 個品牌。`,
        brands: brands.map((brand) => ({ slug: brand.slug, name: brand.name, tagline: brand.tagline ?? null })),
      },
    };
  }

  if (name === 'get_portfolio') {
    const visible = new Set((await getBrandsForUser(env, user)).map((brand) => brand.slug));
    const slugs = PORTFOLIO.filter((slug) => visible.has(slug));
    if (!slugs.length) {
      return { ok: false, brandSlug: null, payload: { error: '這把金鑰看不到 TaskGo、Homigo、Washgo。' } };
    }
    const sql = getSql(env);
    const [statRows, pendingRows, nextRows] = await Promise.all([
      sql`
        SELECT b.slug,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '1 day')::int AS posts_1,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '7 days')::int AS posts_7,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '28 days')::int AS posts_28,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '1 day'), 0)::int AS views_1,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '7 days'), 0)::int AS views_7,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::int AS views_28,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '1 day' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::int AS interactions_1,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '7 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::int AS interactions_7,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '28 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::int AS interactions_28
        FROM brands b
        LEFT JOIN contents c ON c.brand_id = b.id
        LEFT JOIN publishing_jobs pj ON pj.content_id = c.id AND pj.status = 'published'
        LEFT JOIN LATERAL (
          SELECT impressions, comments, shares, saves, raw_metrics
          FROM performance_reports
          WHERE publishing_job_id = pj.id
          ORDER BY captured_at DESC NULLS LAST
          LIMIT 1
        ) pr ON true
        WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        GROUP BY b.slug
      `,
      sql`
        SELECT b.slug, c.title, c.target_platform::text AS platform
        FROM contents c
        JOIN brands b ON b.id = c.brand_id
        WHERE b.slug IN ('taskgo', 'homigo', 'washgo') AND c.status = 'pending_review'
        ORDER BY c.updated_at DESC
        LIMIT 40
      `,
      sql`
        SELECT b.slug, coalesce(c.title, '未命名') AS title, pj.platform::text AS platform, pj.scheduled_at
        FROM publishing_jobs pj
        JOIN contents c ON c.id = pj.content_id
        JOIN brands b ON b.id = c.brand_id
        WHERE pj.status IN ('queued', 'scheduled', 'publishing')
          AND b.slug IN ('taskgo', 'homigo', 'washgo')
        ORDER BY pj.scheduled_at ASC NULLS LAST
        LIMIT 30
      `,
    ]);
    const allowed = new Set(slugs);
    const stats = (statRows as Record<string, unknown>[]).filter((row) => allowed.has(String(row.slug) as typeof slugs[number]));
    const pendingBySlug = new Map<string, { title: string | null; platform: string | null }[]>();
    for (const row of pendingRows as { slug: string; title: string | null; platform: string | null }[]) {
      if (!allowed.has(row.slug as typeof slugs[number])) continue;
      const list = pendingBySlug.get(row.slug) ?? [];
      if (list.length < 5) list.push({ title: row.title, platform: row.platform });
      pendingBySlug.set(row.slug, list);
    }
    const nextBySlug = new Map<string, { title: string; platform: string; scheduledAt: string | null }>();
    for (const row of nextRows as { slug: string; title: string; platform: string; scheduled_at: string | null }[]) {
      if (!allowed.has(row.slug as typeof slugs[number]) || nextBySlug.has(row.slug)) continue;
      nextBySlug.set(row.slug, { title: row.title, platform: row.platform, scheduledAt: row.scheduled_at });
    }
    return {
      ok: true,
      brandSlug: null,
      payload: {
        summary: `總和助理看 ${slugs.join('、')}。和居家居不在這份總覽。寫入時要指名品牌。`,
        brands: slugs.map((slug) => ({
          slug,
          stats: stats.find((row) => row.slug === slug) ?? null,
          pending: pendingBySlug.get(slug) ?? [],
          next: nextBySlug.get(slug) ?? null,
        })),
      },
    };
  }

  const resolved = await requireBrand(env, user, args.brand);
  if ('error' in resolved) return { ok: false, brandSlug: slugOf(args.brand) || null, payload: { error: resolved.error } };
  const { brand } = resolved;

  if (name === 'get_brand_context') {
    const [editor, listed] = await Promise.all([
      loadBrandEditor(env, brand.id, brand.slug),
      runEditor(env, user, brand, { name: 'list_context' }),
    ]);
    const voice = getBrandVoice(brand.slug);
    return {
      ok: true,
      brandSlug: brand.slug,
      payload: {
        summary: listed.summary,
        brand: { slug: brand.slug, name: brand.name, tagline: brand.tagline ?? null },
        voice: {
          persona: clip(voice.frontlinePersona, 400),
          concerns: clip(voice.dailyConcerns, 400),
        },
        editor: {
          nickname: editor.nickname,
          characterTitle: editor.characterTitle,
          temperament: editor.temperament,
          catchphrase: editor.catchphrase,
          focus: editor.focus,
        },
        context: listed.context ? compactContext(listed.context) : null,
      },
    };
  }

  if (name === 'get_performance') {
    const sql = getSql(env);
    const [totals, top] = await Promise.all([
      sql`
        SELECT
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '7 days')::int AS posts_7,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '28 days')::int AS posts_28,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '7 days'), 0)::int AS impressions_7,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::int AS impressions_28,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '7 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::int AS interactions_7,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '28 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::int AS interactions_28
        FROM publishing_jobs pj
        JOIN contents c ON c.id = pj.content_id
        LEFT JOIN LATERAL (
          SELECT impressions, comments, shares, saves, raw_metrics
          FROM performance_reports
          WHERE publishing_job_id = pj.id
          ORDER BY captured_at DESC NULLS LAST
          LIMIT 1
        ) pr ON true
        WHERE c.brand_id = ${brand.id}::uuid
          AND pj.status = 'published'
          AND pj.published_at >= now() - interval '28 days'
      `,
      sql`
        SELECT c.title, pj.platform::text AS platform, pj.published_at,
               coalesce(pr.impressions, 0)::int AS impressions,
               coalesce(pr.engagement_rate, 0)::float AS engagement_rate,
               left(coalesce(cv.body, ''), 120) AS body
        FROM publishing_jobs pj
        JOIN contents c ON c.id = pj.content_id
        LEFT JOIN LATERAL (
          SELECT impressions, engagement_rate
          FROM performance_reports
          WHERE publishing_job_id = pj.id
          ORDER BY captured_at DESC NULLS LAST
          LIMIT 1
        ) pr ON true
        LEFT JOIN LATERAL (
          SELECT body FROM content_versions
          WHERE content_id = c.id
          ORDER BY version_number DESC
          LIMIT 1
        ) cv ON true
        WHERE c.brand_id = ${brand.id}::uuid
          AND pj.status = 'published'
          AND pj.published_at >= now() - interval '28 days'
        ORDER BY pr.engagement_rate DESC NULLS LAST, pr.impressions DESC NULLS LAST
        LIMIT 5
      `,
    ]);
    const row = (totals[0] ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      brandSlug: brand.slug,
      payload: {
        summary: `${brand.name} 近 7 日發文 ${Number(row.posts_7 ?? 0)} 則、曝光 ${Number(row.impressions_7 ?? 0)}、互動 ${Number(row.interactions_7 ?? 0)}。`,
        days7: {
          posts: Number(row.posts_7 ?? 0),
          impressions: Number(row.impressions_7 ?? 0),
          interactions: Number(row.interactions_7 ?? 0),
        },
        days28: {
          posts: Number(row.posts_28 ?? 0),
          impressions: Number(row.impressions_28 ?? 0),
          interactions: Number(row.interactions_28 ?? 0),
        },
        topPosts: (top as Record<string, unknown>[]).map((item) => ({
          title: item.title,
          platform: item.platform,
          publishedAt: item.published_at,
          impressions: Number(item.impressions ?? 0),
          engagementRate: Number(item.engagement_rate ?? 0),
          body: item.body,
        })),
      },
    };
  }

  if (name === 'list_market_signals') {
    const sql = getSql(env);
    const rows = await sql`
      SELECT title, status::text AS status, discovered_at, left(coalesce(summary, ''), 180) AS summary
      FROM market_signals
      WHERE brand_id = ${brand.id}::uuid
      ORDER BY discovered_at DESC
      LIMIT 8
    `;
    return {
      ok: true,
      brandSlug: brand.slug,
      payload: {
        summary: `${brand.name} 最近 ${rows.length} 則市場情報。`,
        signals: rows,
      },
    };
  }

  if (name === 'save_image_asset') {
    if (!env.MEDIA) return { ok: false, brandSlug: brand.slug, payload: { error: '素材庫儲存還沒接上' } };
    if (typeof args.image_base64 !== 'string' || args.image_base64.length > 12_000_000) {
      return { ok: false, brandSlug: brand.slug, payload: { error: args.image_base64 ? '圖片請壓在 8MB 以內' : '缺少圖片內容' } };
    }
    const encoded = args.image_base64.trim();
    if (!encoded) return { ok: false, brandSlug: brand.slug, payload: { error: '缺少圖片內容' } };
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(encoded);
    } catch {
      return { ok: false, brandSlug: brand.slug, payload: { error: '圖片不是有效的 base64' } };
    }
    if (!bytes.length) return { ok: false, brandSlug: brand.slug, payload: { error: '圖片是空的' } };
    if (bytes.length > IMAGE_MAX) return { ok: false, brandSlug: brand.slug, payload: { error: '圖片請壓在 8MB 以內' } };
    const sniffed = sniffImage(bytes, text(args.mime_type, 40).toLowerCase());
    if (!sniffed) return { ok: false, brandSlug: brand.slug, payload: { error: '只收 jpg、png、webp、gif' } };
    const assetName = text(args.name, 80) || '素材圖片';
    const caption = text(args.caption, 300) || null;
    const usageContext = text(args.usage_context, 300) || null;
    const key = buildBrandLibraryKey(brand.slug, sniffed.ext);
    const fileUrl = await putMedia(env, key, bytes, sniffed.mime);
    await ensureBrandAssetLibrary(env).catch(() => undefined);
    const sql = getSql(env);
    const rows = await sql`
      INSERT INTO brand_assets (
        brand_id, asset_type, name, file_url, caption, usage_context, asset_status, uploaded_by
      )
      VALUES (
        ${brand.id}::uuid, 'image', ${assetName}, ${fileUrl}, ${caption}, ${usageContext},
        'active', ${user.id}::uuid
      )
      RETURNING id, name, file_url
    `;
    const saved = rows[0] as { id: string; name: string; file_url: string };
    return {
      ok: true,
      brandSlug: brand.slug,
      payload: {
        summary: `已把「${saved.name}」存進 ${brand.name} 素材庫。`,
        asset: { id: saved.id, name: saved.name, fileUrl: saved.file_url, assetType: 'image' },
      },
    };
  }

  if (name === 'create_video_upload') {
    const assetName = text(args.name, 80) || '素材影片';
    const caption = text(args.caption, 300) || null;
    const token = `upl_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const sql = getSql(env);
    await sql`
      INSERT INTO mcp_upload_tokens (token_hash, key_id, user_id, brand_id, name, caption, expires_at)
      VALUES (
        ${await hashToken(token)}, ${keyId}::uuid, ${user.id}::uuid, ${brand.id}::uuid,
        ${assetName}, ${caption}, ${new Date(Date.now() + UPLOAD_TTL_MS).toISOString()}
      )
    `;
    const uploadUrl = `${origin}/api/mcp/upload?token=${encodeURIComponent(token)}`;
    return {
      ok: true,
      brandSlug: brand.slug,
      payload: {
        summary: `請用 POST multipart，欄位名 file，把影片傳到上傳網址。15 分鐘內有效，只能用一次，上限 40MB。成功後會進 ${brand.name} 素材庫。`,
        uploadUrl,
        expiresInMinutes: 15,
        maxBytes: VIDEO_MAX,
        accept: Object.keys(VIDEO_MIME),
      },
    };
  }

  if (name === 'draft_post') {
    const topic = text(args.topic, 200);
    if (!topic) return { ok: false, brandSlug: brand.slug, payload: { error: '要給貼文切角 topic' } };
    const drafted = await runEditor(env, user, brand, {
      name: 'draft_post',
      platform: platformOf(args.platform),
      topic,
      instruction: text(args.instruction, 800) || undefined,
    });
    await markMcpSource(env, brand.id, drafted.draft?.contentId);
    return {
      ok: drafted.ok,
      brandSlug: brand.slug,
      payload: {
        summary: drafted.summary,
        draft: compactDraft(drafted.draft),
      },
    };
  }

  if (name === 'schedule_post') {
    const mode = args.mode === 'publish' ? 'publish' : 'review';
    const platform = platformOf(args.platform);
    const topic = text(args.topic, 200);
    const instruction = text(args.instruction, 800) || undefined;
    const contentId = text(args.content_id, 80) || undefined;
    const contentVersionId = text(args.content_version_id, 80) || undefined;
    const scheduledAt = text(args.scheduled_at, 40) || undefined;

    if (mode === 'publish') {
      const gate = await publishGate(env, brand.id, platform);
      if (!gate.open) {
        let draft: EditorDraftCard | undefined;
        if (!contentId) {
          if (!topic) {
            return { ok: false, brandSlug: brand.slug, payload: { error: `${gate.reason} 還沒有稿，請帶 topic 或 content_id。` } };
          }
          const drafted = await runEditor(env, user, brand, {
            name: 'draft_post', platform, topic, instruction,
          });
          draft = drafted.draft;
          await markMcpSource(env, brand.id, draft?.contentId);
          if (!drafted.ok) return { ok: false, brandSlug: brand.slug, payload: { summary: drafted.summary, reason: gate.reason } };
        }
        return {
          ok: true,
          brandSlug: brand.slug,
          payload: {
            summary: gate.reason,
            scheduled: false,
            draft: compactDraft(draft),
            contentId: contentId ?? draft?.contentId ?? null,
          },
        };
      }
    }

    const scheduled = await runEditor(env, user, brand, {
      name: 'schedule_post',
      mode,
      platform,
      topic: topic || undefined,
      instruction,
      contentId,
      contentVersionId,
      scheduledAt,
    });
    await markMcpSource(env, brand.id, scheduled.draft?.contentId);
    return {
      ok: scheduled.ok,
      brandSlug: brand.slug,
      payload: {
        summary: scheduled.summary,
        scheduled: mode === 'publish' && scheduled.ok,
        draft: compactDraft(scheduled.draft),
      },
    };
  }

  return { ok: false, brandSlug: slugOf(args.brand) || null, payload: { error: '未知工具' } };
}

export async function saveUploadedVideo(
  env: Env,
  token: string,
  file: File,
): Promise<{ ok: true; assetId: string; name: string; fileUrl: string } | { ok: false; error: string; status: number }> {
  if (!env.MEDIA) return { ok: false, error: '素材庫儲存還沒接上', status: 500 };
  if (!token.startsWith('upl_')) return { ok: false, error: '上傳連結無效', status: 401 };
  const mime = file.type || 'video/mp4';
  const ext = VIDEO_MIME[mime];
  if (!ext) return { ok: false, error: '只收 mp4、webm、mov', status: 400 };
  if (!file.size) return { ok: false, error: '影片是空的', status: 400 };
  if (file.size > VIDEO_MAX) return { ok: false, error: '影片請壓在 40MB 以內', status: 400 };

  const sql = getSql(env);
  const claimed = await sql`
    UPDATE mcp_upload_tokens
    SET used_at = now()
    WHERE token_hash = ${await hashToken(token)}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING brand_id, user_id, name, caption
  `;
  const row = claimed[0] as { brand_id: string; user_id: string; name: string; caption: string | null } | undefined;
  if (!row) return { ok: false, error: '上傳連結已用過或已過期', status: 401 };

  try {
    const brandRows = await sql`SELECT slug FROM brands WHERE id = ${row.brand_id}::uuid LIMIT 1`;
    const slug = (brandRows[0] as { slug?: string } | undefined)?.slug;
    if (!slug) {
      await sql`UPDATE mcp_upload_tokens SET used_at = NULL WHERE token_hash = ${await hashToken(token)}`;
      return { ok: false, error: '找不到品牌', status: 404 };
    }
    const key = buildBrandLibraryKey(slug, ext);
    const fileUrl = await putMedia(env, key, new Uint8Array(await file.arrayBuffer()), mime);
    await ensureBrandAssetLibrary(env).catch(() => undefined);
    const saved = await sql`
      INSERT INTO brand_assets (
        brand_id, asset_type, name, file_url, caption, asset_status, uploaded_by
      )
      VALUES (
        ${row.brand_id}::uuid, 'video', ${row.name}, ${fileUrl}, ${row.caption},
        'active', ${row.user_id}::uuid
      )
      RETURNING id, name, file_url
    `;
    const asset = saved[0] as { id: string; name: string; file_url: string };
    return { ok: true, assetId: asset.id, name: asset.name, fileUrl: asset.file_url };
  } catch (e) {
    await sql`
      UPDATE mcp_upload_tokens SET used_at = NULL
      WHERE token_hash = ${await hashToken(token)}
    `.catch(() => undefined);
    console.error('[mcp] 影片入庫失敗', e);
    return { ok: false, error: '影片沒有存進素材庫', status: 500 };
  }
}
