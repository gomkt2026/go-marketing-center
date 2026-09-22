import type { Env } from './env';
import { getSql } from './db';
import { ensurePostingOpsTables } from './posting-slots';
import {
  bindLineSpace,
  brandKeyToSlug,
  findOpsUserByLineId,
  getLineSpace,
  parseSpaceBindCommand,
  recordLineSpaceEvent,
  type LineOpsSpace,
} from './line-spaces';
import {
  handleLineScriptIntake,
  hasOpenScriptSession,
  inferBrandSlug,
  isScriptCancel,
  isScriptConfirm,
  isScriptUploadCommand,
  looksLikeScript,
  seedHomigoGhostStoryScripts,
} from './short-scripts';

const LINE_API = 'https://api.line.me/v2/bot';

type BrandRow = { id: string; slug: string; name: string };

type BrandKpi = {
  published: number;
  failed: number;
  impressions: number;
  likes: number;
  comments: number;
  clicks: number;
  shares: number;
  pending: number;
  lastPublishedAt: string | null;
  platforms: Array<{ platform: string; published: number; impressions: number }>;
};

type TodayPost = {
  brandId: string;
  title: string;
  platform: string;
  publishedAt: string | null;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  permalink: string | null;
};

type LineMentionee = { index?: number; length?: number; isSelf?: boolean; userId?: string };
type LineMention = { mentionees?: LineMentionee[] };
type LineOpsSource = { type?: string; userId?: string; groupId?: string; roomId?: string };
export type LineOpsEvent = {
  type?: string;
  replyToken?: string;
  source?: LineOpsSource;
  message?: { type?: string; text?: string; mention?: LineMention; quotedMessageId?: string; id?: string };
};

type OpsIntent =
  | 'bind' | 'kpi' | 'today' | 'failed' | 'pending'
  | 'schedule' | 'press' | 'voice' | 'assets' | 'shorts'
  | 'upload_script' | 'help' | 'unknown';

const BRAND_THEME: Record<string, { header: string; accent: string; label: string }> = {
  homigo: { header: '#2F6F5E', accent: '#8CAA71', label: 'Homigo 包租管家' },
  taskgo: { header: '#1A2F4B', accent: '#3D7EA6', label: 'TaskGo 匠管' },
  washgo: { header: '#0B6E8A', accent: '#2A9BB5', label: 'Washgo 洗衣店' },
};

const EDITOR_BRIEFS: Record<string, { editor: string; lines: string[] }> = {
  homigo: {
    editor: '小咪 · 包租管家',
    lines: [
      '對象：房東／代管；不要寫成房客吐槽或房仲廣告',
      'FB／IG 80–180 字（上限 220），前 125 字就要是痛點 hook',
      'Threads 像 LINE 群回覆：務實、有溫度，可吐槽行業亂象',
      '可講：租屋關係、收租報修、合約信任、已核准露出',
      '禁止：假裝限時優惠、留言才告訴你、站隊罵房東或房客',
      '視覺：米白＋深藍，黃只做主標；痛點→情境→最後才是 Homigo',
      '主 CTA：Service@inforcraft.com.tw ／ 0972-395-117',
    ],
  },
  taskgo: {
    editor: '阿豪 · 工班頭',
    lines: [
      '對象：工程行老闆／工班頭；不要變成裝潢估價業務',
      'FB／IG 80–180 字（上限 220），圖上主標與第一句同義',
      'Threads 80–180 字（上限 220），一句一行，可用台語',
      '可講：派工、現場回報、案場日常、已核准露出',
      '禁止：數位轉型廣告腔、深灰橘色語錄卡、人身攻擊業主',
      '視覺：海軍藍斜切工地風＋蜂巢；人物是海報構圖，不是寫實工地照',
      '主 CTA：Service@inforcraft.com.tw ／ 0972-395-117',
    ],
  },
  washgo: {
    editor: '阿樂 · 洗衣店店員',
    lines: [
      'Threads 60–120 字（上限 150），一篇只講一件事',
      '主軸擇一：A 系統服務／B 洗滌知識／C 流行洗法',
      'FB／IG 80–180 字（上限 220），前 125 字是店主痛點 hook',
      '可講：洗衣乾洗日常、LINE 送洗履歷、門市調撥、已核准露出',
      '禁止：硬廣折扣、私訊加 LINE、文青獨白、整頁後台截圖直發',
      '配圖：可愛洗衣插畫痛點海報；FB／IG 結尾必須出現匠管聯絡',
      '主 CTA：Service@inforcraft.com.tw ／ 0972-395-117',
    ],
  },
};

const VIDEO_STATUS_LABEL: Record<string, string> = {
  analyzing: '分析中',
  strategy_review: '待核准策略',
  rendering_preview: '等 720p 預覽',
  preview_review: '待核准預覽',
  rendering_final: '等正式檔',
  ready: '可交付',
  rejected: '已打回',
};

function videoJobLabel(status: string, sourceType?: string): string {
  if (sourceType === 'script' && (status === 'strategy_review' || status === 'analyzing')) return '腳本待拍';
  return VIDEO_STATUS_LABEL[status] ?? status;
}

const ASSET_CATEGORY_LABEL: Record<string, string> = {
  system_screenshot: '系統畫面',
  real_photo: '實拍',
  people: '人物',
  scene: '場景',
  brand_collab: '聯名',
  press_clipping: '見報',
  brand_identity: '品牌',
  other: '其他',
};

export function lineOpsConfigured(env: Env): boolean {
  return Boolean(env.LINE_OPS_CHANNEL_SECRET && env.LINE_OPS_CHANNEL_ACCESS_TOKEN);
}

function requireOpsToken(env: Env): string {
  if (!env.LINE_OPS_CHANNEL_ACCESS_TOKEN) throw new Error('LINE_OPS_CHANNEL_ACCESS_TOKEN 尚未設定');
  return env.LINE_OPS_CHANNEL_ACCESS_TOKEN;
}

async function linePost(env: Env, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireOpsToken(env)}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API ${path} 失敗 (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function replyOpsMessages(
  env: Env,
  replyToken: string,
  messages: unknown[],
  brands?: BrandRow[],
): Promise<void> {
  await linePost(env, '/message/reply', { replyToken, messages: withQuickReply(messages, brands) });
}

export async function replyOps(env: Env, replyToken: string, text: string): Promise<void> {
  await replyOpsMessages(env, replyToken, [textMsg(text)]);
}

export async function pushOps(env: Env, to: string, text: string): Promise<boolean> {
  if (!lineOpsConfigured(env)) return false;
  try {
    await linePost(env, '/message/push', { to, messages: [{ type: 'text', text }] });
    return true;
  } catch (e) {
    console.error('[line-ops] push 失敗', e);
    return false;
  }
}

async function lineDisplayName(env: Env, lineUserId: string): Promise<string | null> {
  try {
    const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${requireOpsToken(env)}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

function maskLineId(id: string): string {
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function textMsg(text: string) {
  return { type: 'text', text };
}

function flexText(text: string, extra: Record<string, unknown> = {}) {
  return { type: 'text', text, wrap: true, ...extra };
}

function platformLabel(platform: string): string {
  if (platform === 'facebook') return 'FB';
  if (platform === 'instagram') return 'IG';
  if (platform === 'threads') return 'Threads';
  return platform;
}

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString('zh-TW');
}

function fmtTime(iso: string | null): string {
  if (!iso) return '尚無發布';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtClock(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function themeOf(slug: string) {
  return BRAND_THEME[slug] ?? { header: '#3A3A3A', accent: '#8CAA71', label: slug };
}

const BARE_COMMAND_RE = /^(homigo|taskgo|washgo|小咪|匠管|阿豪|阿樂)?(成效|kpi|今日發文|今日|今天|失敗|待審|排程|待發|檔期|行程|媒體|新聞|露出|報導|口吻|人設|怎麼寫|規格|素材|短影音|影片|shorts|腳本|交腳本|上傳腳本|怎麼問|說明|幫助|help|指令|選單|菜單|你好|嗨|hi|hello)$/i;

export function isGroupSource(source?: LineOpsSource): boolean {
  return source?.type === 'group' || source?.type === 'room'
    || Boolean(source?.groupId || source?.roomId);
}

const BOT_MENTION_RE = /[@＠]?\s*GO\s*行銷\s*機器人|[@＠]?\s*行銷機器人|[@＠]?\s*GO行銷/gi;

export function botWasMentioned(text: string, mention?: LineMention): boolean {
  if (mention?.mentionees?.some((m) => m.isSelf || m.index === 0)) return true;
  if (mention?.mentionees?.length) return true;
  BOT_MENTION_RE.lastIndex = 0;
  return BOT_MENTION_RE.test(text);
}

export function stripLineMention(text: string, mention?: LineMention): string {
  let next = text;
  const selves = (mention?.mentionees ?? [])
    .filter((m) => (m.isSelf || m.index === 0) && typeof m.index === 'number' && typeof m.length === 'number')
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  for (const m of selves) {
    const start = m.index ?? 0;
    const end = start + (m.length ?? 0);
    if (start >= 0 && end <= next.length) next = `${next.slice(0, start)}${next.slice(end)}`;
  }
  next = next
    .replace(BOT_MENTION_RE, '')
    .replace(/[\u200b\u200c\u200d\ufeff\u00a0\u2060]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return next;
}

const BRAND_ONLY_RE = /^(homigo|taskgo|washgo|小咪|匠管|阿豪|阿樂)$/i;

export function isBareOpsCommand(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return false;
  if (/^綁定\d{6}$/.test(compact)) return true;
  if (BRAND_ONLY_RE.test(compact)) return true;
  return BARE_COMMAND_RE.test(compact);
}

export function parseOpsIntent(text: string): OpsIntent {
  if (/^綁定\s*\d{6}$/.test(text)) return 'bind';
  if (isScriptUploadCommand(text)) return 'upload_script';
  if (/失敗/.test(text)) return 'failed';
  if (/待審/.test(text)) return 'pending';
  if (/短影音|shorts|腳本|影片/.test(text)) return 'shorts';
  if (/媒體|新聞|露出|報導/.test(text)) return 'press';
  if (/排程|待發|檔期|行程/.test(text)) return 'schedule';
  if (/口吻|人設|怎麼寫|規格/.test(text)) return 'voice';
  if (/素材/.test(text)) return 'assets';
  if (/今日|今天/.test(text) && !/成效|kpi/i.test(text)) return 'today';
  if (/成效|kpi|曝光|數據|怎麼了/i.test(text)) return 'kpi';
  if (/怎麼問|說明|幫助|help|指令|選單|菜單/i.test(text)) return 'help';
  if (/你好|嗨|hi|hello/i.test(text)) return 'help';
  if (!text || BRAND_ONLY_RE.test(text.replace(/\s+/g, ''))) return 'help';
  return 'unknown';
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value || !/^https:\/\//i.test(value.trim())) return null;
  return value.trim();
}

function qrItem(label: string, text: string) {
  return { type: 'action', action: { type: 'message', label, text } };
}

function quickReplyItems(brands?: BrandRow[]) {
  if (brands && brands.length === 0) {
    return [
      qrItem('綁 Homigo', '這個群綁定 Homigo'),
      qrItem('綁 TaskGo', '這個群綁定 TaskGo'),
      qrItem('綁 Washgo', '這個群綁定 Washgo'),
      qrItem('指令集', '指令'),
    ];
  }
  if (brands?.length === 1) {
    const name = brands[0].name;
    return [
      qrItem('今日發文', `${name}今日發文`),
      qrItem('排程', `${name}排程`),
      qrItem('媒體露出', `${name}媒體`),
      qrItem('短影音', `${name}短影音`),
      qrItem('交腳本', '交腳本'),
      qrItem('口吻規格', `${name}口吻`),
      qrItem('素材', `${name}素材`),
      qrItem('待審', `${name}待審`),
      qrItem('成效', `${name}成效`),
      qrItem('指令集', '指令'),
    ];
  }
  return [
    qrItem('今日發文', '今日發文'),
    qrItem('排程', '排程'),
    qrItem('媒體露出', '媒體'),
    qrItem('短影音', '短影音'),
    qrItem('交腳本', '交腳本'),
    qrItem('口吻規格', '口吻'),
    qrItem('素材', '素材'),
    qrItem('三品牌成效', '成效'),
    qrItem('Homigo', 'Homigo成效'),
    qrItem('TaskGo', 'TaskGo成效'),
    qrItem('Washgo', 'Washgo成效'),
    qrItem('待審', '待審'),
    qrItem('指令集', '指令'),
  ];
}

function withQuickReply(messages: unknown[], brands?: BrandRow[]): unknown[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1] as Record<string, unknown> | null;
  if (!last || typeof last !== 'object') return messages;
  if (last.quickReply) return messages;
  return [...messages.slice(0, -1), { ...last, quickReply: { items: quickReplyItems(brands) } }];
}

const MENU_UNKNOWN = '這句我還沒學會。點下面一項就好。';
const MENU_JOIN = [
  '已加入這個群。請管理員先指定品牌，之後這個群就只看那一個品牌。',
  '',
  '已在 GO 行銷中心綁定 LINE 的管理員請回：',
  '這個群綁定 Homigo',
  '這個群綁定 TaskGo',
  '這個群綁定 Washgo',
  '',
  '指定前我不會在這裡查成效、素材或腳本。',
].join('\n');
const MENU_FOLLOW = '加好友成功。內部人員請先到設定頁產生綁定碼，傳「綁定 123456」。外包小編請在品牌工作群 @我，這個群只會看到該品牌。';
const MENU_NEED_GROUP_BIND = '這個群還沒指定品牌，我不會在這裡查其他品牌的資料。管理員請回「這個群綁定 Homigo」。';
const MENU_NEED_USER_BIND = '請先到 GO 行銷中心設定頁產生綁定碼，傳「綁定 123456」。外包小編請走品牌工作群，不必私訊查其他品牌。';
const MENU_FOREIGN = (name: string) => `這個群只看 ${name}。要看別的品牌請進那個品牌的工作群，或用已綁定的總部私訊。`;

export async function getBindingForUser(env: Env, userId: string) {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT line_user_id, display_name, notify_review, notify_failed
    FROM user_line_bindings WHERE user_id = ${userId}::uuid LIMIT 1
  `;
  const row = rows[0] as { line_user_id: string; display_name: string | null; notify_review: boolean; notify_failed: boolean } | undefined;
  return {
    bound: !!row,
    lineUserIdMasked: row ? maskLineId(row.line_user_id) : null,
    displayName: row?.display_name ?? null,
    notifyReview: false,
    notifyFailed: false,
    configured: lineOpsConfigured(env),
    addFriendUrl: env.LINE_OPS_ADD_FRIEND_URL ?? 'https://line.me/R/ti/p/@706hmbhp',
  };
}

export async function createBindCode(env: Env, userId: string): Promise<{ code: string; expiresAt: string }> {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await sql`DELETE FROM line_bind_codes WHERE user_id = ${userId}::uuid OR expires_at < now()`;
  await sql`
    INSERT INTO line_bind_codes (code, user_id, expires_at)
    VALUES (${code}, ${userId}::uuid, ${expires.toISOString()}::timestamptz)
  `;
  return { code, expiresAt: expires.toISOString() };
}

export async function updateBindingPrefs(
  env: Env,
  userId: string,
  body: { notifyReview?: boolean; notifyFailed?: boolean; unbind?: boolean },
) {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  if (body.unbind) {
    await sql`DELETE FROM user_line_bindings WHERE user_id = ${userId}::uuid`;
    return getBindingForUser(env, userId);
  }
  await sql`
    UPDATE user_line_bindings
    SET notify_review = false,
        notify_failed = false,
        updated_at = now()
    WHERE user_id = ${userId}::uuid
  `;
  return getBindingForUser(env, userId);
}

async function bindLineUser(env: Env, lineUserId: string, code: string): Promise<string> {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT user_id FROM line_bind_codes
    WHERE code = ${code} AND expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return '綁定碼無效或已過期，請回設定頁重新產生。';
  const userId = (rows[0] as { user_id: string }).user_id;
  const name = await lineDisplayName(env, lineUserId);
  await sql`DELETE FROM user_line_bindings WHERE user_id = ${userId}::uuid OR line_user_id = ${lineUserId}`;
  await sql`
    INSERT INTO user_line_bindings (user_id, line_user_id, display_name, notify_review, notify_failed)
    VALUES (${userId}::uuid, ${lineUserId}, ${name}, false, false)
  `;
  await sql`DELETE FROM line_bind_codes WHERE user_id = ${userId}::uuid`;
  return '已綁定 GO 行銷中心。之後用問答查成效即可，不會主動推發文通知。';
}

async function opsBrands(env: Env): Promise<BrandRow[]> {
  const sql = getSql(env);
  return await sql`
    SELECT id, slug, name FROM brands
    WHERE is_active = true
    ORDER BY slug
  ` as BrandRow[];
}

function scopeBrands(brands: BrandRow[], text: string): BrandRow[] {
  const lower = text.toLowerCase();
  const hit = brands.find((b) => {
    if (lower.includes(b.slug) || text.includes(b.name)) return true;
    if (b.slug === 'homigo' && /小咪/.test(text)) return true;
    if (b.slug === 'taskgo' && /阿豪|匠管/.test(text)) return true;
    if (b.slug === 'washgo' && /阿樂/.test(text)) return true;
    return false;
  });
  return hit ? [hit] : brands;
}

async function loadBrandKpis(env: Env, brands: BrandRow[]): Promise<Map<string, BrandKpi>> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const empty = new Map<string, BrandKpi>();
  for (const brand of brands) {
    empty.set(brand.id, {
      published: 0, failed: 0, impressions: 0, likes: 0, comments: 0,
      clicks: 0, shares: 0, pending: 0, lastPublishedAt: null, platforms: [],
    });
  }
  if (!ids.length) return empty;

  const [statRows, pendingRows] = await Promise.all([
    sql`
      SELECT
        c.brand_id,
        pj.platform,
        count(*) FILTER (WHERE pj.status = 'published')::int AS published,
        count(*) FILTER (WHERE pj.status = 'failed')::int AS failed,
        coalesce(sum(pr.impressions), 0)::int AS impressions,
        coalesce(sum(pr.clicks), 0)::int AS clicks,
        coalesce(sum(pr.comments), 0)::int AS comments,
        coalesce(sum(pr.shares), 0)::int AS shares,
        coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::int ELSE 0 END), 0)::int AS likes,
        max(pj.published_at) AS last_published_at
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ANY(${ids}::uuid[])
        AND coalesce(pj.published_at, pj.updated_at) >= now() - interval '7 days'
      GROUP BY c.brand_id, pj.platform
    `,
    sql`
      SELECT brand_id, count(*)::int AS n
      FROM contents
      WHERE brand_id = ANY(${ids}::uuid[]) AND status = 'pending_review'
      GROUP BY brand_id
    `,
  ]);

  for (const row of statRows as Array<{
    brand_id: string; platform: string; published: number; failed: number;
    impressions: number; clicks: number; comments: number; shares: number; likes: number;
    last_published_at: string | null;
  }>) {
    const kpi = empty.get(row.brand_id);
    if (!kpi) continue;
    kpi.published += row.published;
    kpi.failed += row.failed;
    kpi.impressions += row.impressions;
    kpi.clicks += row.clicks;
    kpi.comments += row.comments;
    kpi.shares += row.shares;
    kpi.likes += row.likes;
    if (row.last_published_at && (!kpi.lastPublishedAt || row.last_published_at > kpi.lastPublishedAt)) {
      kpi.lastPublishedAt = row.last_published_at;
    }
    kpi.platforms.push({
      platform: row.platform,
      published: row.published,
      impressions: row.impressions,
    });
  }
  for (const row of pendingRows as Array<{ brand_id: string; n: number }>) {
    const kpi = empty.get(row.brand_id);
    if (kpi) kpi.pending = row.n;
  }
  return empty;
}

async function loadTodayPosts(env: Env, brands: BrandRow[]): Promise<Map<string, TodayPost[]>> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const byBrand = new Map<string, TodayPost[]>();
  for (const brand of brands) byBrand.set(brand.id, []);
  if (!ids.length) return byBrand;

  const rows = await sql`
    SELECT
      c.brand_id,
      coalesce(
        nullif(c.title, ''),
        c.generation_prompt_meta->>'theme',
        left(cv.body, 40),
        '(無標題)'
      ) AS title,
      pj.platform,
      pj.published_at,
      coalesce(pr.impressions, 0)::int AS impressions,
      coalesce(pr.comments, 0)::int AS comments,
      coalesce(pr.shares, 0)::int AS shares,
      coalesce(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::int ELSE 0 END, 0)::int AS likes,
      (
        SELECT lg.detail FROM publishing_logs lg
        WHERE lg.publishing_job_id = pj.id AND lg.event = 'published'
        ORDER BY lg.created_at DESC LIMIT 1
      ) AS permalink
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    LEFT JOIN content_versions cv ON cv.id = pj.content_version_id
    LEFT JOIN LATERAL (
      SELECT impressions, comments, shares, raw_metrics
      FROM performance_reports
      WHERE publishing_job_id = pj.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) pr ON true
    WHERE c.brand_id = ANY(${ids}::uuid[])
      AND pj.status = 'published'
      AND pj.published_at >= date_trunc('day', now() + interval '8 hours') - interval '8 hours'
    ORDER BY pj.published_at DESC
  `;

  for (const row of rows as Array<{
    brand_id: string; title: string | null; platform: string; published_at: string | null;
    impressions: number; comments: number; shares: number; likes: number; permalink: string | null;
  }>) {
    const list = byBrand.get(row.brand_id);
    if (!list) continue;
    const permalink = row.permalink && /^https?:\/\//i.test(row.permalink) ? row.permalink : null;
    list.push({
      brandId: row.brand_id,
      title: row.title || '(無標題)',
      platform: row.platform,
      publishedAt: row.published_at,
      impressions: row.impressions,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      permalink,
    });
  }
  return byBrand;
}

function postRow(post: TodayPost) {
  const hasMetrics = post.impressions > 0 || post.likes > 0 || post.comments > 0 || post.shares > 0;
  const metrics = hasMetrics
    ? `曝光 ${fmtNum(post.impressions)}　讚 ${fmtNum(post.likes)}　留言 ${fmtNum(post.comments)}`
    : '成效尚未回收';
  const row: Record<string, unknown> = {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: '6px',
    paddingAll: '10px',
    backgroundColor: '#F7F9F5',
    cornerRadius: '8px',
    contents: [
      flexText(`${fmtClock(post.publishedAt)}  ${platformLabel(post.platform)}`, { size: 'xxs', color: '#6C6C6C' }),
      flexText(clip(post.title, 24), { size: 'sm', weight: 'bold', color: '#3A3A3A' }),
      flexText(metrics, { size: 'xs', color: '#3A3A3A' }),
    ],
  };
  if (post.permalink) row.action = { type: 'uri', uri: post.permalink };
  return row;
}

function todayBubble(brand: BrandRow, posts: TodayPost[]) {
  const theme = themeOf(brand.slug);
  const shown = posts.slice(0, 6);
  const extra = posts.length - shown.length;
  const body = shown.length
    ? [
      flexText(`今日已發 ${posts.length} 則，含目前瀏覽與互動`, { size: 'xs', color: '#6C6C6C' }),
      ...shown.map(postRow),
      ...(extra > 0 ? [flexText(`還有 ${extra} 則未列出`, { size: 'xxs', color: '#6C6C6C', margin: '6px' })] : []),
    ]
    : [flexText('今天還沒有已發出的貼文。', { size: 'sm', color: '#6C6C6C' })];

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: theme.header,
      paddingAll: '14px',
      contents: [
        flexText(theme.label, { color: '#FFFFFF', size: 'md', weight: 'bold' }),
        flexText('今日發文清單', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '14px', contents: body },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: theme.header,
        action: { type: 'message', label: `問 ${brand.name} 成效`, text: `${brand.name}成效` },
      }],
    },
  };
}

function kpiBubble(brand: BrandRow, kpi: BrandKpi, todayCount = 0) {
  const theme = themeOf(brand.slug);
  const platforms = ['facebook', 'instagram', 'threads']
    .map((p) => {
      const row = kpi.platforms.find((x) => x.platform === p);
      return `${platformLabel(p)} ${row?.published ?? 0}`;
    })
    .join('  /  ');

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: theme.header,
      paddingAll: '16px',
      contents: [
        flexText(theme.label, { color: '#FFFFFF', size: 'lg', weight: 'bold' }),
        flexText('近 7 天發文與成效', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            statBox('已發', fmtNum(kpi.published), theme.accent),
            statBox('失敗', fmtNum(kpi.failed), kpi.failed ? '#D97B7B' : '#6C6C6C'),
            statBox('待審', fmtNum(kpi.pending), '#ED9121'),
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          margin: '12px',
          contents: [
            flexText(`曝光 ${fmtNum(kpi.impressions)}　讚 ${fmtNum(kpi.likes)}`, { size: 'sm', color: '#3A3A3A' }),
            flexText(`留言 ${fmtNum(kpi.comments)}　分享 ${fmtNum(kpi.shares)}　點擊 ${fmtNum(kpi.clicks)}`, { size: 'sm', color: '#6C6C6C' }),
            flexText(platforms, { size: 'xs', color: '#6C6C6C', margin: '6px' }),
            flexText(`最近一則 ${fmtTime(kpi.lastPublishedAt)}`, { size: 'xs', color: '#6C6C6C' }),
            flexText(`今日已發 ${todayCount} 則（下方清單含瀏覽／互動）`, { size: 'xs', color: theme.header, margin: '6px', weight: 'bold' }),
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: theme.header,
          action: { type: 'message', label: `問 ${brand.name} 成效`, text: `${brand.name}成效` },
        },
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          action: { type: 'message', label: '今日發文清單', text: `${brand.name}今日` },
        },
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          action: { type: 'message', label: '看失敗單', text: `${brand.name}失敗` },
        },
      ],
    },
  };
}

function statBox(label: string, value: string, color: string) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      flexText(label, { size: 'xxs', color: '#6C6C6C', align: 'center' }),
      flexText(value, { size: 'xl', weight: 'bold', color, align: 'center', margin: '4px' }),
    ],
  };
}

function listBubble(brand: BrandRow, title: string, lines: string[], empty: string, ask: string) {
  const theme = themeOf(brand.slug);
  const body = lines.length
    ? lines.map((line) => flexText(line, { size: 'sm', color: '#3A3A3A' }))
    : [flexText(empty, { size: 'sm', color: '#6C6C6C' })];
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: theme.header,
      paddingAll: '14px',
      contents: [
        flexText(theme.label, { color: '#FFFFFF', size: 'md', weight: 'bold' }),
        flexText(title, { color: '#D7E8E2', size: 'xs', margin: '4px' }),
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: body },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: theme.header,
        action: { type: 'message', label: `問 ${brand.name} 成效`, text: ask },
      }],
    },
  };
}

function carousel(altText: string, bubbles: unknown[]) {
  return {
    type: 'flex',
    altText: altText.slice(0, 390),
    contents: bubbles.length === 1
      ? bubbles[0]
      : { type: 'carousel', contents: bubbles },
  };
}

function menuButton(label: string, text: string, color?: string) {
  return {
    type: 'button',
    style: color ? 'primary' : 'secondary',
    height: 'sm',
    flex: 1,
    ...(color ? { color } : {}),
    action: { type: 'message', label, text },
  };
}

function menuRow(left: [string, string], right?: [string, string], color?: string) {
  const contents = [menuButton(left[0], left[1], color)];
  if (right) contents.push(menuButton(right[0], right[1], color));
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    margin: '8px',
    contents,
  };
}

function menuSection(title: string) {
  return flexText(title, { size: 'xs', color: '#6C6C6C', weight: 'bold', margin: '12px' });
}

function commandMenuMessages(brands: BrandRow[], intro?: string): unknown[] {
  const scoped = brands.length === 1 ? brands[0] : null;
  const prefix = scoped?.name ?? '';
  const cmd = (name: string) => (prefix ? `${prefix}${name}` : name);
  const headerColor = scoped ? themeOf(scoped.slug).header : '#1A2F4B';
  const subtitle = scoped
    ? `${themeOf(scoped.slug).label} · 點一項就好`
    : '點一項就好，不用打字、不用背指令';

  const body = [
    flexText(subtitle, { size: 'sm', color: '#3A3A3A' }),
    menuSection('小編'),
    menuRow(['今日發文', cmd('今日發文')], ['之後排程', cmd('排程')]),
    menuRow(['媒體露出', cmd('媒體')], ['寫文規格', cmd('口吻')]),
    menuRow(['素材庫', cmd('素材')], ['待審稿', cmd('待審')]),
    menuSection('短影音'),
    menuRow(['短影音工作', cmd('短影音')], ['交腳本', '交腳本']),
  ];

  if (scoped) {
    body.push(menuSection('成效'));
    body.push(menuRow(['近 7 天成效', cmd('成效')], ['失敗單', cmd('失敗')], headerColor));
  } else if (brands.length > 1) {
    body.push(menuSection('指定品牌今日'));
    body.push(menuRow(['Homigo', 'Homigo今日'], ['TaskGo', 'TaskGo今日']));
    body.push(menuRow(['Washgo', 'Washgo今日'], ['三品牌成效', '成效'], headerColor));
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerColor,
      paddingAll: '14px',
      contents: [
        flexText('GO 行銷機器人', { color: '#FFFFFF', size: 'md', weight: 'bold' }),
        flexText('指令集', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '14px', contents: body },
  };

  const messages: unknown[] = [];
  if (intro) messages.push(textMsg(intro));
  messages.push({
    type: 'flex',
    altText: scoped ? `${scoped.name} 指令：今日發文、排程、媒體、口吻、短影音、交腳本` : '點指令：今日發文、排程、媒體、口吻、短影音、交腳本、成效',
    contents: bubble,
  });
  return messages;
}

async function todayMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const today = await loadTodayPosts(env, brands);
  const bubbles = brands.map((brand) => todayBubble(brand, today.get(brand.id) ?? []));
  const alt = brands.map((b) => {
    const posts = today.get(b.id) ?? [];
    return `${b.name} 今日 ${posts.length} 則`;
  }).join('；');
  return [carousel(alt || '今日發文清單', bubbles)];
}

async function performanceMessages(env: Env, brands: BrandRow[], intro?: string): Promise<unknown[]> {
  const [kpis, today] = await Promise.all([loadBrandKpis(env, brands), loadTodayPosts(env, brands)]);
  const bubbles = brands.map((brand) => kpiBubble(brand, kpis.get(brand.id)!, (today.get(brand.id) ?? []).length));
  const alt = brands.map((b) => {
    const k = kpis.get(b.id)!;
    return `${b.name} 近7天 發${k.published}/失敗${k.failed} 曝光${fmtNum(k.impressions)}`;
  }).join('；');
  const messages: unknown[] = [];
  if (intro) messages.push(textMsg(intro));
  messages.push(carousel(alt || '近 7 天行銷成效', bubbles));
  messages.push(carousel('今日已發文與互動', brands.map((brand) => todayBubble(brand, today.get(brand.id) ?? []))));
  return messages;
}

async function failedMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = await sql`
    SELECT c.brand_id, c.title, pj.platform, pj.updated_at
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    WHERE c.brand_id = ANY(${ids}::uuid[])
      AND pj.status = 'failed'
      AND pj.updated_at >= now() - interval '7 days'
    ORDER BY pj.updated_at DESC
  ` as Array<{ brand_id: string; title: string | null; platform: string; updated_at: string }>;

  const bubbles = brands.map((brand) => {
    const items = rows.filter((r) => r.brand_id === brand.id).slice(0, 5);
    const lines = items.map((r) => `・${platformLabel(r.platform)} ${r.title || '(無標題)'}`);
    return listBubble(brand, '近 7 天失敗單', lines, '近 7 天沒有失敗單。', `${brand.name}成效`);
  });
  return [carousel('近 7 天發文失敗', bubbles)];
}

async function pendingMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = await sql`
    SELECT brand_id, title, target_platform
    FROM contents
    WHERE brand_id = ANY(${ids}::uuid[]) AND status = 'pending_review'
    ORDER BY updated_at DESC
  ` as Array<{ brand_id: string; title: string | null; target_platform: string | null }>;

  const bubbles = brands.map((brand) => {
    const items = rows.filter((r) => r.brand_id === brand.id).slice(0, 5);
    const lines = items.map((r) => `・${platformLabel(r.target_platform ?? '')} ${r.title || '(無標題)'}`);
    return listBubble(brand, '待審閱內容', lines, '目前沒有待審內容。', `${brand.name}成效`);
  });
  return [carousel('待審閱內容', bubbles)];
}

async function scheduleMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = ids.length ? await sql`
    SELECT c.brand_id, c.title, pj.platform, pj.status, pj.scheduled_at
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    WHERE c.brand_id = ANY(${ids}::uuid[])
      AND pj.status IN ('scheduled', 'queued', 'publishing')
      AND pj.scheduled_at IS NOT NULL
      AND pj.scheduled_at < now() + interval '7 days'
      AND pj.scheduled_at >= now() - interval '2 hours'
    ORDER BY pj.scheduled_at ASC
  `.catch(() => []) as Array<{
    brand_id: string; title: string | null; platform: string; status: string; scheduled_at: string | null;
  }> : [];

  const bubbles = brands.map((brand) => {
    const items = rows.filter((r) => r.brand_id === brand.id).slice(0, 6);
    const lines = items.map((r) => {
      const when = fmtTime(r.scheduled_at);
      const state = r.status === 'publishing' ? '發送中' : r.status === 'queued' ? '排隊' : '已排';
      return `・${when} ${platformLabel(r.platform)} ${state} ${clip(r.title || '(無標題)', 18)}`;
    });
    return listBubble(brand, '未來 7 天排程', lines, '未來 7 天沒有已排貼文。', `${brand.name}今日`);
  });
  return [carousel('未來 7 天排程', bubbles)];
}

async function pressMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = ids.length ? await sql`
    SELECT brand_id, outlet, headline, published_on, status, article_url
    FROM press_coverages
    WHERE brand_id = ANY(${ids}::uuid[])
      AND status IN ('published', 'syndicated', 'inbox')
    ORDER BY published_on DESC NULLS LAST, updated_at DESC
    LIMIT 24
  `.catch(() => []) as Array<{
    brand_id: string; outlet: string; headline: string; published_on: string | null;
    status: string; article_url: string | null;
  }> : [];

  const bubbles = brands.map((brand) => {
    const theme = themeOf(brand.slug);
    const items = rows.filter((r) => r.brand_id === brand.id).slice(0, 5);
    const contents = items.length
      ? items.map((r) => {
        const day = r.published_on
          ? new Date(r.published_on).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })
          : '日期未定';
        const state = r.status === 'inbox' ? '待整理' : r.status === 'syndicated' ? '轉載' : '可跟風';
        const row: Record<string, unknown> = {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          margin: '6px',
          paddingAll: '10px',
          backgroundColor: '#F7F9F5',
          cornerRadius: '8px',
          contents: [
            flexText(`${day}  ${r.outlet}  ${state}`, { size: 'xxs', color: '#6C6C6C' }),
            flexText(clip(r.headline, 28), { size: 'sm', weight: 'bold', color: '#3A3A3A' }),
          ],
        };
        const url = httpsUrl(r.article_url);
        if (url) row.action = { type: 'uri', uri: url };
        return row;
      })
      : [flexText('目前沒有可跟風的媒體露出。', { size: 'sm', color: '#6C6C6C' })];

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: theme.header,
        paddingAll: '14px',
        contents: [
          flexText(theme.label, { color: '#FFFFFF', size: 'md', weight: 'bold' }),
          flexText('媒體露出（點卡片開原文）', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '14px', contents },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: theme.header,
          action: { type: 'message', label: `${brand.name} 口吻`, text: `${brand.name}口吻` },
        }],
      },
    };
  });
  return [carousel('媒體露出', bubbles)];
}

function voiceMessages(brands: BrandRow[]): unknown[] {
  const bubbles = brands.map((brand) => {
    const theme = themeOf(brand.slug);
    const brief = EDITOR_BRIEFS[brand.slug];
    const lines = brief?.lines ?? ['先對準這個品牌的日常場景，不要發明優惠與數字。'];
    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: theme.header,
        paddingAll: '14px',
        contents: [
          flexText(theme.label, { color: '#FFFFFF', size: 'md', weight: 'bold' }),
          flexText(brief?.editor ?? '品牌小編規格', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: lines.map((line) => flexText(`・${line}`, { size: 'sm', color: '#3A3A3A' })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: theme.header,
            action: { type: 'message', label: `${brand.name} 今日發文`, text: `${brand.name}今日` },
          },
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: { type: 'message', label: `${brand.name} 媒體`, text: `${brand.name}媒體` },
          },
        ],
      },
    };
  });
  return [carousel('小編口吻與規格', bubbles)];
}

async function assetMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = ids.length ? await sql`
    SELECT brand_id, name, caption, image_category, usage_context
    FROM brand_assets
    WHERE brand_id = ANY(${ids}::uuid[])
      AND asset_type = 'image'
      AND asset_status = 'active'
    ORDER BY last_used_at DESC NULLS LAST, created_at DESC
    LIMIT 24
  `.catch(() => []) as Array<{
    brand_id: string; name: string; caption: string | null;
    image_category: string | null; usage_context: string | null;
  }> : [];

  const bubbles = brands.map((brand) => {
    const items = rows.filter((r) => r.brand_id === brand.id).slice(0, 5);
    const lines = items.map((r) => {
      const cat = ASSET_CATEGORY_LABEL[r.image_category ?? ''] ?? '圖片';
      const title = r.caption || r.name || '未命名素材';
      const hint = r.usage_context ? `｜${clip(r.usage_context, 12)}` : '';
      return `・${cat} ${clip(title, 18)}${hint}`;
    });
    return listBubble(brand, '素材庫近期圖片', lines, '這個品牌素材庫目前是空的。', `${brand.name}今日`);
  });
  return [carousel('品牌素材庫', bubbles)];
}

async function shortsMessages(env: Env, brands: BrandRow[]): Promise<unknown[]> {
  const sql = getSql(env);
  const ids = brands.map((b) => b.id);
  const rows = (ids.length ? await sql`
    SELECT v.title, v.status, v.strategy, v.preview_url, v.final_url, v.updated_at,
           v.brand_id, v.source_type, e.title AS episode_title
    FROM video_jobs v
    LEFT JOIN podcast_episodes e ON e.id = v.podcast_episode_id
    WHERE v.brand_id = ANY(${ids}::uuid[]) OR v.brand_id IS NULL
    ORDER BY v.updated_at DESC
    LIMIT 12
  `.catch(() => []) : []) as Array<{
    title: string | null; status: string; strategy: unknown;
    preview_url: string | null; final_url: string | null; updated_at: string;
    brand_id: string | null; source_type?: string; episode_title: string | null;
  }>;

  const bubbles = brands.map((brand) => {
    const theme = themeOf(brand.slug);
    const items = rows
      .filter((r) => r.brand_id === brand.id || (!r.brand_id && brand.id === brands[0]?.id))
      .slice(0, 5);
    const contents = items.length
      ? items.map((r) => {
        const strategy = (r.strategy && typeof r.strategy === 'object') ? r.strategy as { hook?: string; title?: string } : {};
        const title = strategy.title || r.title || r.episode_title || '未命名短影音';
        const hook = strategy.hook ? clip(strategy.hook, 28) : '尚無 hook';
        const row: Record<string, unknown> = {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          margin: '6px',
          paddingAll: '10px',
          backgroundColor: '#F7F9F5',
          cornerRadius: '8px',
          contents: [
            flexText(`${videoJobLabel(r.status, r.source_type)}  ${fmtTime(r.updated_at)}`, { size: 'xxs', color: '#6C6C6C' }),
            flexText(clip(title, 24), { size: 'sm', weight: 'bold', color: '#3A3A3A' }),
            flexText(hook, { size: 'xs', color: '#3A3A3A' }),
          ],
        };
        const url = httpsUrl(r.final_url) ?? httpsUrl(r.preview_url);
        if (url) row.action = { type: 'uri', uri: url };
        return row;
      })
      : [flexText('目前沒有短影音工作。可在這裡交腳本，或從 Podcast 已核准集數切杯。', { size: 'sm', color: '#6C6C6C' })];

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: theme.header,
        paddingAll: '14px',
        contents: [
          flexText(theme.label, { color: '#FFFFFF', size: 'md', weight: 'bold' }),
          flexText('短影音工作與腳本', { color: '#D7E8E2', size: 'xs', margin: '4px' }),
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '14px', contents },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: theme.header,
          action: { type: 'message', label: '交腳本', text: '交腳本' },
        }],
      },
    };
  });
  return [carousel('短影音工作', bubbles)];
}

async function messagesForIntent(env: Env, intent: OpsIntent, brands: BrandRow[]): Promise<unknown[]> {
  switch (intent) {
    case 'failed': return failedMessages(env, brands);
    case 'pending': return pendingMessages(env, brands);
    case 'today': return todayMessages(env, brands);
    case 'schedule': return scheduleMessages(env, brands);
    case 'press': return pressMessages(env, brands);
    case 'voice': return voiceMessages(brands);
    case 'assets': return assetMessages(env, brands);
    case 'shorts': return shortsMessages(env, brands);
    case 'upload_script': return shortsMessages(env, brands);
    case 'kpi': return performanceMessages(env, brands);
    case 'help': return commandMenuMessages(brands);
    default: return commandMenuMessages(brands, MENU_UNKNOWN);
  }
}

function mentionsForeignBrand(text: string, allowed: BrandRow, all: BrandRow[]): boolean {
  if (/三品牌|全部品牌|所有品牌/.test(text)) return true;
  const hit = all.find((b) => {
    if (b.slug === allowed.slug) return false;
    const lower = text.toLowerCase();
    if (lower.includes(b.slug) || text.includes(b.name)) return true;
    if (b.slug === 'homigo' && /小咪/.test(text)) return true;
    if (b.slug === 'taskgo' && /阿豪|匠管/.test(text)) return true;
    if (b.slug === 'washgo' && /阿樂/.test(text)) return true;
    return false;
  });
  return Boolean(hit);
}

async function handleSpaceBindMessage(
  env: Env,
  params: {
    text: string;
    conversationId: string;
    lineUserId: string | undefined;
    brands: BrandRow[];
    replyToken: string;
  },
): Promise<boolean> {
  const parsed = parseSpaceBindCommand(params.text);
  if (!parsed) return false;
  if (!params.lineUserId) {
    await replyOps(env, params.replyToken, '請先加 GO 行銷機器人好友，再綁這個群。');
    return true;
  }
  const actor = await findOpsUserByLineId(env, params.lineUserId);
  if (!actor) {
    await replyOps(env, params.replyToken, '請管理員先到設定頁綁定 LINE，再回「這個群綁定 Homigo」。');
    return true;
  }
  if (parsed.action === 'unbind') {
    const next = await bindLineSpace(env, {
      conversationId: params.conversationId,
      brandId: null,
      actor,
      lineUserId: params.lineUserId,
    });
    await replyOpsMessages(env, params.replyToken, [textMsg(`已解除 ${next.displayName || '這個群'} 的品牌綁定。指定前我不會在這裡查資料。`)], []);
    return true;
  }
  const slug = parsed.brandKey ? brandKeyToSlug(parsed.brandKey, params.brands) : null;
  const brand = slug ? params.brands.find((b) => b.slug === slug) : null;
  if (!brand) {
    await replyOps(env, params.replyToken, '請寫「這個群綁定 Homigo」或 TaskGo、Washgo。');
    return true;
  }
  const next = await bindLineSpace(env, {
    conversationId: params.conversationId,
    brandId: brand.id,
    actor,
    lineUserId: params.lineUserId,
  });
  const label = next.displayName ? `「${next.displayName}」` : '這個群';
  await replyOpsMessages(
    env,
    params.replyToken,
    await performanceMessages(env, [brand], `${label} 已綁 ${brand.name}。之後這個群只看這個品牌，交腳本也會存到這裡。`),
    [brand],
  );
  return true;
}

export async function handleLineOpsEvents(
  env: Env,
  body: { events?: LineOpsEvent[] },
): Promise<void> {
  if (!lineOpsConfigured(env)) return;
  await ensurePostingOpsTables(env);
  await seedHomigoGhostStoryScripts(env).catch((e) => console.error('[line-ops] seed scripts', e));
  const brands = await opsBrands(env);
  for (const event of body.events ?? []) {
    const inGroup = isGroupSource(event.source);
    const conversationId = event.source?.groupId || event.source?.roomId || null;
    const lineUserId = event.source?.userId;
    if (inGroup) {
      await recordLineSpaceEvent(env, event.source, event.type || 'message').catch((e) => {
        console.error('[line-ops] 記錄群組失敗', e);
      });
    }

    const replyToken = event.replyToken;
    if (event.type === 'leave' || event.type === 'unfollow') continue;
    if (!replyToken) continue;

    try {
      if (event.type === 'join') {
        await replyOpsMessages(env, replyToken, [textMsg(MENU_JOIN)], []);
        continue;
      }
      if (event.type === 'follow') {
        await replyOpsMessages(env, replyToken, commandMenuMessages(brands, MENU_FOLLOW), []);
        continue;
      }
      if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) continue;

      const raw = event.message.text;
      const mentioned = botWasMentioned(raw, event.message.mention)
        || /[@＠]/.test(raw);
      const text = stripLineMention(raw, event.message.mention);
      const quoted = Boolean(event.message.quotedMessageId);
      const sessionOpen = conversationId && lineUserId
        ? await hasOpenScriptSession(env, conversationId, lineUserId)
        : false;
      const addressing = !inGroup || mentioned || quoted || isBareOpsCommand(text)
        || Boolean(parseSpaceBindCommand(text))
        || isScriptUploadCommand(text) || looksLikeScript(text)
        || (sessionOpen && (isScriptConfirm(text) || isScriptCancel(text) || text.length > 20));
      if (inGroup && !addressing) continue;

      if (inGroup && conversationId) {
        const handledBind = await handleSpaceBindMessage(env, {
          text, conversationId, lineUserId, brands, replyToken,
        });
        if (handledBind) continue;
      }

      const bind = text.match(/^綁定\s*(\d{6})$/);
      if (bind) {
        if (!lineUserId) {
          await replyOps(env, replyToken, '請先加 GO 行銷機器人好友，再傳綁定碼。');
          continue;
        }
        const result = await bindLineUser(env, lineUserId, bind[1]);
        if (result.startsWith('已綁定')) {
          await replyOpsMessages(env, replyToken, await performanceMessages(env, brands, result), brands);
        } else {
          await replyOps(env, replyToken, result);
        }
        continue;
      }

      let space: LineOpsSpace | null = null;
      if (inGroup && conversationId) space = await getLineSpace(env, conversationId);

      if (inGroup && !space?.brandId) {
        const intake = await handleLineScriptIntake(env, {
          text,
          conversationId: conversationId || 'unknown',
          lineUserId: lineUserId ?? null,
          brand: null,
          needGroupBind: true,
        });
        if (intake) {
          await replyOpsMessages(env, replyToken, intake, []);
          continue;
        }
        await replyOpsMessages(env, replyToken, [textMsg(MENU_NEED_GROUP_BIND)], []);
        continue;
      }

      let scoped: BrandRow[] = brands;
      if (inGroup && space?.brandId) {
        const locked = brands.find((b) => b.id === space!.brandId);
        if (!locked) {
          await replyOpsMessages(env, replyToken, [textMsg(MENU_NEED_GROUP_BIND)], []);
          continue;
        }
        if (mentionsForeignBrand(text, locked, brands)) {
          await replyOpsMessages(env, replyToken, [textMsg(MENU_FOREIGN(locked.name))], [locked]);
          continue;
        }
        scoped = [locked];
      } else if (!inGroup) {
        const opsUser = lineUserId ? await findOpsUserByLineId(env, lineUserId) : null;
        if (!opsUser) {
          if (parseOpsIntent(text) === 'help') {
            await replyOpsMessages(env, replyToken, commandMenuMessages([], MENU_NEED_USER_BIND), []);
          } else {
            await replyOps(env, replyToken, MENU_NEED_USER_BIND);
          }
          continue;
        }
        if (opsUser.role !== 'super_admin') {
          scoped = brands.filter((b) => opsUser.brandIds.includes(b.id));
          if (!scoped.length) {
            await replyOps(env, replyToken, MENU_NEED_USER_BIND);
            continue;
          }
        }
        scoped = scopeBrands(scoped, text);
      }

      const inferred = inferBrandSlug(text);
      const intakeBrand = scoped.length === 1
        ? scoped[0]
        : (inferred ? scoped.find((b) => b.slug === inferred) ?? null : null);

      const intake = await handleLineScriptIntake(env, {
        text,
        conversationId: conversationId || (lineUserId ? `dm:${lineUserId}` : 'unknown'),
        lineUserId: lineUserId ?? null,
        brand: intakeBrand,
        needGroupBind: false,
      });
      if (intake) {
        await replyOpsMessages(env, replyToken, intake, scoped);
        continue;
      }

      const intent = parseOpsIntent(text);
      await replyOpsMessages(env, replyToken, await messagesForIntent(env, intent, scoped), scoped);
    } catch (e) {
      console.error('[line-ops] 處理訊息失敗', e);
      await replyOps(env, replyToken, '查詢暫時失敗，請稍後再試。').catch(() => undefined);
    }
  }
}

/** 改為問答模式後不再主動推發文失敗。保留函式以免 scheduler 編譯失敗。 */
export async function notifyPublishFailed(
  _env: Env,
  _params: { brandId: string | null; brandSlug: string | null; platform: string; title?: string | null; error: string },
): Promise<void> {
  return;
}

/** 改為問答模式後不再主動推待審匯總。 */
export async function notifyPendingReviewDigest(_env: Env): Promise<void> {
  return;
}
