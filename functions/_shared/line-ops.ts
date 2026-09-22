import type { Env } from './env';
import { getSql } from './db';
import { ensurePostingOpsTables } from './posting-slots';

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

const BRAND_THEME: Record<string, { header: string; accent: string; label: string }> = {
  homigo: { header: '#2F6F5E', accent: '#8CAA71', label: 'Homigo 包租管家' },
  taskgo: { header: '#1A2F4B', accent: '#3D7EA6', label: 'TaskGo 匠管' },
  washgo: { header: '#0B6E8A', accent: '#2A9BB5', label: 'Washgo 洗衣店' },
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

async function replyOpsMessages(env: Env, replyToken: string, messages: unknown[]): Promise<void> {
  await linePost(env, '/message/reply', { replyToken, messages: withQuickReply(messages) });
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

function quickReplyItems() {
  return [
    { type: 'action', action: { type: 'message', label: '三品牌成效', text: '成效' } },
    { type: 'action', action: { type: 'message', label: '今日發文', text: '今日發文' } },
    { type: 'action', action: { type: 'message', label: 'Homigo', text: 'Homigo成效' } },
    { type: 'action', action: { type: 'message', label: 'TaskGo', text: 'TaskGo成效' } },
    { type: 'action', action: { type: 'message', label: 'Washgo', text: 'Washgo成效' } },
    { type: 'action', action: { type: 'message', label: '失敗單', text: '失敗' } },
    { type: 'action', action: { type: 'message', label: '待審', text: '待審' } },
    { type: 'action', action: { type: 'message', label: '怎麼問', text: '怎麼問' } },
  ];
}

function withQuickReply(messages: unknown[]): unknown[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || typeof last !== 'object') return messages;
  return [...messages.slice(0, -1), { ...last, quickReply: { items: quickReplyItems() } }];
}

const HELP = `用問的就好，我不會主動推發文通知。

可以直接傳：
・成效／KPI
・今日發文
・Homigo成效、TaskGo成效、Washgo成效
・失敗
・待審
或點下方按鈕。

綁定後台帳號請傳「綁定 123456」。`;

const WELCOME = '已加入 GO 行銷機器人。下面是三個品牌近 7 天發文與成效。之後用按鈕或直接問我，例如「Homigo 成效」「失敗」「待審」。我不會主動推發文通知。';

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
  const hit = brands.find((b) => text.toLowerCase().includes(b.slug) || text.includes(b.name));
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

export async function handleLineOpsEvents(
  env: Env,
  body: { events?: Array<{ type?: string; replyToken?: string; source?: { userId?: string }; message?: { type?: string; text?: string } }> },
): Promise<void> {
  if (!lineOpsConfigured(env)) return;
  await ensurePostingOpsTables(env);
  const brands = await opsBrands(env);
  for (const event of body.events ?? []) {
    const replyToken = event.replyToken;
    const lineUserId = event.source?.userId;
    if (!replyToken || !lineUserId) continue;
    try {
      if (event.type === 'follow') {
        await replyOpsMessages(env, replyToken, await performanceMessages(env, brands, WELCOME));
        continue;
      }
      if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) continue;
      const text = event.message.text.trim();
      const bind = text.match(/^綁定\s*(\d{6})$/);
      if (bind) {
        const result = await bindLineUser(env, lineUserId, bind[1]);
        if (result.startsWith('已綁定')) {
          await replyOpsMessages(env, replyToken, await performanceMessages(env, brands, result));
        } else {
          await replyOps(env, replyToken, result);
        }
        continue;
      }
      const scoped = scopeBrands(brands, text);
      if (/失敗/.test(text)) {
        await replyOpsMessages(env, replyToken, await failedMessages(env, scoped));
      } else if (/待審/.test(text)) {
        await replyOpsMessages(env, replyToken, await pendingMessages(env, scoped));
      } else if (/今日|今天/.test(text) && !/成效|kpi/i.test(text)) {
        await replyOpsMessages(env, replyToken, await todayMessages(env, scoped));
      } else if (/成效|kpi|曝光|數據|怎麼了/i.test(text) || /你好|嗨|hi|hello/i.test(text)) {
        const intro = /你好|嗨|hi|hello/i.test(text) ? WELCOME : undefined;
        await replyOpsMessages(env, replyToken, await performanceMessages(env, scoped, intro));
      } else if (/怎麼問|說明|幫助|help|指令/i.test(text)) {
        await replyOps(env, replyToken, HELP);
      } else {
        await replyOps(env, replyToken, HELP);
      }
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
