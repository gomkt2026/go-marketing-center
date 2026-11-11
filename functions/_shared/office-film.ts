import type { Env } from './env';
import { claudeChatJsonWithUsage } from './claude';
import { getSql } from './db';
import { putMedia } from './media';

const QUEUE_KEY = 'videos/office-meetings/queue.json';
const BRAND_LABEL: Record<string, string> = { taskgo: 'TaskGo', homigo: 'Homigo', washgo: 'Washgo' };

export interface OfficeFilmLine {
  who: string;
  text: string;
  reply?: string;
}

export interface OfficeFilmTheme {
  slug: string;
  theme: string;
}

export interface OfficeFilmScript {
  id: string;
  startedAt: string;
  label: string;
  hook?: string;
  close?: string;
  lines: OfficeFilmLine[];
  themes: OfficeFilmTheme[];
}

const FILM_CAST = new Set(['阿豪', '小咪', '阿樂', '新聞收集', '行銷小編', '發文小編', 'Podcast小編', '圖片小編', '影片小編']);

let columnsReady = false;

export function officeMeetingKey(standupId: string, name: 'script.json' | 'meeting.mp4') {
  return `videos/office-meetings/${standupId}/${name}`;
}

export function taipeiMeetingLabel(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('month')}/${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

export async function ensureOfficeFilmColumns(env: Env) {
  if (columnsReady) return;
  const sql = getSql(env);
  await sql`ALTER TABLE office_standups ADD COLUMN IF NOT EXISTS film_url TEXT`;
  await sql`ALTER TABLE office_standups ADD COLUMN IF NOT EXISTS film_status TEXT`;
  columnsReady = true;
}

function cleanLines(lines: OfficeFilmLine[]) {
  return lines
    .map((line) => ({
      who: line.who.replace(/\s+/g, '').slice(0, 12),
      text: line.text.replace(/\s+/g, ' ').trim().slice(0, 64),
      reply: line.reply?.replace(/\s+/g, '').slice(0, 12) || undefined,
    }))
    .filter((line) => line.who && line.text && !/^正在/.test(line.text))
    .slice(0, 16);
}

/** 把晨會結論改成互相接話，給影片用。失敗就沿用原句。 */
export async function speakOfficeMeeting(
  env: Env,
  plan: {
    brands: { slug: string; theme: string; doMore?: string[]; doLess?: string[] }[];
    bubbles: { who: string; text: string }[];
    podcastTopic?: string;
    imageBrief?: string;
    videoNote?: string;
  },
): Promise<{ hook: string; close: string; lines: OfficeFilmLine[]; inputTokens: number; outputTokens: number } | null> {
  const material = [
    ...plan.brands.map((brand) => [
      `${brand.slug}：${brand.theme}`,
      brand.doMore?.length ? `可寫：${brand.doMore.join('、')}` : '',
      brand.doLess?.length ? `避開：${brand.doLess.join('、')}` : '',
    ].filter(Boolean).join(' ')),
    plan.podcastTopic ? `Podcast：${plan.podcastTopic}` : '',
    plan.imageBrief ? `圖片：${plan.imageBrief}` : '',
    plan.videoNote ? `影片：${plan.videoNote}` : '',
    ...plan.bubbles.map((line) => `${line.who}：${line.text}`),
  ].filter(Boolean).join('\n');
  if (material.trim().length < 8) return null;
  const completion = await claudeChatJsonWithUsage<{ hook?: unknown; close?: unknown; lines?: unknown }>(env, {
    bill: false,
    temperature: 0.85,
    maxTokens: 1600,
    timeoutMs: 20000,
    messages: [
      {
        role: 'system',
        content: [
          '把這一班晨會寫成一支約一分鐘的會議短片。觀眾要聽到他們真的在討論，不是每人報一句結論。',
          '只能展開下面材料裡已經有的題。不准加數字、價格、法律判決、洗法、瀏覽數、媒體名。',
          '阿豪只講工地，句子短，不說私訊，不報價。小咪不站房東或房客，不判誰對誰錯。阿樂不教怎麼洗，不笑客人。',
          '不要寫「正在」。不要每人只報進度。',
          '結構要完整：先把今天的題丟上桌，三個品牌各自搶一個場面並說為什麼；要有人反對硬跟或補一句不能踩的線；再把 Podcast、圖片、影片、發文拆開接走，並說各自拿到的畫面。同一個人可以再講一次。',
          '九個名字裡至少七個要開口。',
          '回 JSON：{"hook":"24字內","close":"24字內","lines":[{"who":"阿豪|小咪|阿樂|新聞收集|行銷小編|發文小編|Podcast小編|圖片小編|影片小編","text":"36到56字，講完一個判斷","reply":"這句在接誰，沒有就空字串"}]}',
          'lines 要 12 到 16 句。',
        ].join('\n'),
      },
      { role: 'user', content: material },
    ],
  });
  const data = completion.data;
  const rawLines = Array.isArray(data.lines) ? data.lines : [];
  const lines = cleanLines(rawLines.map((line) => {
    const row = line && typeof line === 'object' ? line as { who?: unknown; text?: unknown; reply?: unknown } : {};
    const who = String(row.who ?? '');
    return {
      who: FILM_CAST.has(who) ? who : '',
      text: String(row.text ?? ''),
      reply: FILM_CAST.has(String(row.reply ?? '')) ? String(row.reply) : '',
    };
  }));
  const speakers = new Set(lines.map((line) => line.who));
  if (lines.length < 10 || speakers.size < 6) return null;
  const clip = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
  return {
    hook: clip(data.hook) || '沒有人主持，這班自己開了',
    close: clip(data.close) || '人不在，這班也開完了',
    lines,
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
  };
}

/** 晨會結束後把對話腳本放進 R2。真正的 mp4 由排程機畫，這裡不編碼。 */
export async function saveOfficeFilmScript(env: Env, script: Omit<OfficeFilmScript, 'label'> & { label?: string; hook?: string; close?: string }) {
  if (!env.MEDIA) return;
  if (!/^[0-9a-f-]{36}$/i.test(script.id)) return;
  const lines = cleanLines(script.lines);
  if (!lines.length) return;
  await ensureOfficeFilmColumns(env);
  const payload: OfficeFilmScript = {
    id: script.id,
    startedAt: script.startedAt,
    label: script.label || taipeiMeetingLabel(script.startedAt),
    hook: script.hook?.replace(/\s+/g, ' ').trim().slice(0, 28) || undefined,
    close: script.close?.replace(/\s+/g, ' ').trim().slice(0, 28) || undefined,
    lines,
    themes: script.themes
      .map((theme) => ({ slug: theme.slug, theme: theme.theme.replace(/\s+/g, ' ').trim().slice(0, 42) }))
      .filter((theme) => theme.slug && theme.theme)
      .slice(0, 3),
  };
  await putMedia(env, officeMeetingKey(payload.id, 'script.json'), new TextEncoder().encode(JSON.stringify(payload)), 'application/json');

  let ids: string[] = [];
  const current = await env.MEDIA.get(QUEUE_KEY);
  if (current) {
    const parsed = await current.json().catch(() => null) as { ids?: unknown } | null;
    if (parsed && Array.isArray(parsed.ids)) ids = parsed.ids.filter((id): id is string => typeof id === 'string');
  }
  ids = [...ids.filter((id) => id !== payload.id), payload.id].slice(-12);
  await putMedia(env, QUEUE_KEY, new TextEncoder().encode(JSON.stringify({ ids })), 'application/json');

  const sql = getSql(env);
  await sql`
    UPDATE office_standups
    SET film_status = 'script'
    WHERE id = ${payload.id}::uuid AND film_url IS NULL
  `;
}

function themeCaption(directive: unknown) {
  const brands = directive && typeof directive === 'object' && Array.isArray((directive as { brands?: unknown }).brands)
    ? (directive as { brands: { slug?: string; theme?: string }[] }).brands
    : [];
  const text = brands
    .map((brand) => {
      const theme = brand.theme?.replace(/\s+/g, ' ').trim();
      if (!theme) return '';
      return `${BRAND_LABEL[brand.slug ?? ''] ?? brand.slug ?? ''}：${theme}`;
    })
    .filter(Boolean)
    .join('　');
  return text.slice(0, 180) || '這一班的會議紀錄';
}

/** 影片已經在 R2 時，把網址記到這一班，並放進三個品牌的素材庫。不另外排程發文。 */
export async function attachReadyOfficeFilms(env: Env) {
  if (!env.MEDIA) return;
  await ensureOfficeFilmColumns(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, started_at, directive
    FROM office_standups
    WHERE status = 'completed'
      AND film_url IS NULL
      AND film_status = 'script'
      AND started_at > now() - interval '3 days'
    ORDER BY started_at DESC
    LIMIT 4
  `;
  const brands = await sql`
    SELECT id, slug FROM brands WHERE slug IN ('taskgo', 'homigo', 'washgo')
  `;
  for (const row of rows as { id: string; started_at: string; directive: unknown }[]) {
    const key = officeMeetingKey(row.id, 'meeting.mp4');
    const head = await env.MEDIA.head(key);
    if (!head || head.size < 1000) continue;
    const fileUrl = `/api/media/${key}`;
    const label = taipeiMeetingLabel(row.started_at);
    const name = `晨會 ${label}`;
    const caption = themeCaption(row.directive);
    const filmKey = `office-meeting:${row.id}`;
    const meta = JSON.stringify({ filmKey, source: 'office-meeting' });
    for (const brand of brands as { id: string; slug: string }[]) {
      const existing = await sql`
        SELECT id FROM brand_assets
        WHERE brand_id = ${brand.id}::uuid AND metadata->>'filmKey' = ${filmKey}
        LIMIT 1
      `;
      const assetId = (existing[0] as { id?: string } | undefined)?.id;
      if (assetId) {
        await sql`
          UPDATE brand_assets
          SET asset_type = 'video'::asset_type, name = ${name}, file_url = ${fileUrl}, caption = ${caption},
              asset_role = 'brand', feature = '晨會紀錄', usage_context = '發文影片素材',
              asset_status = 'active', metadata = ${meta}::jsonb
          WHERE id = ${assetId}::uuid
        `;
      } else {
        await sql`
          INSERT INTO brand_assets (
            brand_id, asset_type, name, file_url, caption, asset_role, feature, usage_context, asset_status, metadata
          ) VALUES (
            ${brand.id}::uuid, 'video'::asset_type, ${name}, ${fileUrl}, ${caption},
            'brand', '晨會紀錄', '發文影片素材', 'active', ${meta}::jsonb
          )
        `;
      }
    }
    await sql`
      UPDATE office_standups
      SET film_url = ${fileUrl}, film_status = 'ready'
      WHERE id = ${row.id}::uuid
    `;
    console.log(`[office-film] ${label} 已放進三個品牌的素材庫`);
  }
}
