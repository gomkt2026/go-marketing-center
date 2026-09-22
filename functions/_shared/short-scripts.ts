import type { Env } from './env';
import { getSql } from './db';
import { logActivity } from './activity';
import {
  mapVideoJob,
  type ClipCandidate,
  type VideoJobRow,
  type VideoStrategy,
} from './video-jobs';

export interface ShortScriptScene {
  order: number;
  speaker: string;
  line: string;
  visual?: string;
  sfx?: string;
}

export interface ShortScriptDoc {
  kind: 'short_script';
  title: string;
  series?: string;
  hook: string;
  cta: string;
  scenes: ShortScriptScene[];
  rawText: string;
  source: 'web' | 'line' | 'seed';
}

const HOMIGO_CTA = '去下載 Homigo，租屋要問的問題上面都有答案。';
const CHARS_PER_SEC = 4.2;

const HOMIGO_GHOST_SCRIPTS: Array<{
  title: string;
  hook: string;
  cta: string;
  series: string;
  rawText: string;
  scenes: ShortScriptScene[];
}> = [
  {
    title: '房東鬼故事：有了一棟房子多了十份工作',
    series: '房東鬼故事',
    hook: '很多人以為當房東就是——躺在沙發，坐等每個月收租。',
    cta: HOMIGO_CTA,
    rawText: [
      '《房東鬼故事：有了一棟房子多了十份工作》',
      '開頭房東：「很多人以為當房東就是——躺在沙發，坐等每個月收租。」',
      '下一秒：',
      '📱「房東先生冷氣壞了」（準備刷牙',
      '📱「房東先生熱水器不熱」（準備吃早餐',
      '📱「房東先生我忘記帶鑰匙」（準備開車',
      '📱「房東先生這個月電費多少？」（準備上廁所',
      '📱「房東先生隔壁租客晚上太吵了！」（準備喝口水',
      '📱「房東先生合約什麼時候到？我想先退租」（準備睡覺',
      '房東坐在沙發上逐漸崩潰...',
    ].join('\n'),
    scenes: [
      { order: 1, speaker: '房東', line: '很多人以為當房東就是——躺在沙發，坐等每個月收租。', visual: '躺在沙發上' },
      { order: 2, speaker: '租客（LINE）', line: '房東先生冷氣壞了', visual: '準備刷牙', sfx: '訊息聲' },
      { order: 3, speaker: '租客（LINE）', line: '房東先生熱水器不熱', visual: '準備吃早餐', sfx: '訊息聲' },
      { order: 4, speaker: '租客（LINE）', line: '房東先生我忘記帶鑰匙', visual: '準備開車', sfx: '訊息聲' },
      { order: 5, speaker: '租客（LINE）', line: '房東先生這個月電費多少？', visual: '準備上廁所', sfx: '訊息聲' },
      { order: 6, speaker: '租客（LINE）', line: '房東先生隔壁租客晚上太吵了！', visual: '準備喝口水', sfx: '訊息聲' },
      { order: 7, speaker: '租客（LINE）', line: '房東先生合約什麼時候到？我想先退租', visual: '準備睡覺', sfx: '訊息聲' },
      { order: 8, speaker: '畫面', line: '房東坐在沙發上逐漸崩潰...', visual: '沙發上崩潰' },
    ],
  },
  {
    title: '房東鬼故事：租客退租的那一天',
    series: '房東鬼故事',
    hook: '租客說要退租的那一天，真正的驚嚇才開始。',
    cta: HOMIGO_CTA,
    rawText: [
      '《房東鬼故事：租客退租的那一天》',
      '租客：「房東先生～我要退租了！」',
      '房東：「好啊，祝你找到更適合的地方😊」',
      '租客：「謝謝房東先生！」',
      '房東：「沒事～～」',
      '租客走後。房東去檢查房間：',
      '牆壁很髒（ai圖，爆炸聲',
      '地板很髒（ai圖，爆炸聲',
      '床墊很髒（ai圖，爆炸聲',
      '最後打開冰箱。非常雜亂的阿嬤冰箱（ai圖，爆炸聲',
      '房東沉默畫面',
      '「有時我們害怕的不是人離開，而是他留下了什麼...」',
    ].join('\n'),
    scenes: [
      { order: 1, speaker: '租客', line: '房東先生～我要退租了！' },
      { order: 2, speaker: '房東', line: '好啊，祝你找到更適合的地方😊' },
      { order: 3, speaker: '租客', line: '謝謝房東先生！' },
      { order: 4, speaker: '房東', line: '沒事～～' },
      { order: 5, speaker: '畫面', line: '租客走後。房東去檢查房間。' },
      { order: 6, speaker: '畫面', line: '牆壁很髒', visual: 'AI 圖：髒牆壁', sfx: '爆炸聲' },
      { order: 7, speaker: '畫面', line: '地板很髒', visual: 'AI 圖：髒地板', sfx: '爆炸聲' },
      { order: 8, speaker: '畫面', line: '床墊很髒', visual: 'AI 圖：髒床墊', sfx: '爆炸聲' },
      { order: 9, speaker: '畫面', line: '打開冰箱。非常雜亂的阿嬤冰箱', visual: 'AI 圖：雜亂冰箱', sfx: '爆炸聲' },
      { order: 10, speaker: '畫面', line: '房東沉默', visual: '沉默特寫' },
      { order: 11, speaker: '旁白', line: '有時我們害怕的不是人離開，而是他留下了什麼...' },
    ],
  },
  {
    title: '房東鬼故事：半夜三點的訊息',
    series: '房東鬼故事',
    hook: '半夜三點，租客傳訊：房東你睡了嗎？',
    cta: '別再問了！去下載 Homigo，你要問的所有問題上面都有答案，晚安。',
    rawText: [
      '《房東鬼故事：半夜三點的訊息》',
      '房東睡覺畫面',
      '📱租客：「房東你睡了嗎？」',
      '房東睡眼惺忪傳訊息：「……怎麼了？」',
      '📱「不好意思打擾，我想問明天垃圾車幾點來？」',
      '房東：「下午5:50」',
      '房東繼續睡覺畫面',
      '📱「不好意思，那繳租金的時間是什麼時候？」',
      '房東：「每個月15號」',
      '房東繼續睡覺畫面',
      '📱「再一個問題，房子可以申請租屋補助嗎？」',
      '房東：「可以，但你要自己去看有沒有符合資格」',
      '📱「最後一個問題」',
      '房東：「別再問了！去下載homigo，你要問的所有問題上面都有答案，晚安」',
    ].join('\n'),
    scenes: [
      { order: 1, speaker: '畫面', line: '房東睡覺', visual: '半夜睡覺' },
      { order: 2, speaker: '租客（LINE）', line: '房東你睡了嗎？', sfx: '訊息聲' },
      { order: 3, speaker: '房東', line: '……怎麼了？', visual: '睡眼惺忪回訊' },
      { order: 4, speaker: '租客（LINE）', line: '不好意思打擾，我想問明天垃圾車幾點來？' },
      { order: 5, speaker: '房東', line: '下午5:50' },
      { order: 6, speaker: '畫面', line: '房東繼續睡覺' },
      { order: 7, speaker: '租客（LINE）', line: '不好意思，那繳租金的時間是什麼時候？' },
      { order: 8, speaker: '房東', line: '每個月15號' },
      { order: 9, speaker: '畫面', line: '房東繼續睡覺' },
      { order: 10, speaker: '租客（LINE）', line: '再一個問題，房子可以申請租屋補助嗎？' },
      { order: 11, speaker: '房東', line: '可以，但你要自己去看有沒有符合資格' },
      { order: 12, speaker: '租客（LINE）', line: '最後一個問題' },
      { order: 13, speaker: '房東', line: '別再問了！去下載homigo，你要問的所有問題上面都有答案，晚安' },
    ],
  },
];

let scriptTypeEnsured = false;
let scriptSessionsEnsured = false;
let ghostScriptsSeeded = false;

export async function ensureVideoScriptType(env: Env): Promise<void> {
  if (scriptTypeEnsured) return;
  const sql = getSql(env);
  try {
    await sql`ALTER TYPE video_source_type ADD VALUE IF NOT EXISTS 'script'`;
  } catch {
    // 型別尚未建立或這個連線已看過新值
  }
  scriptTypeEnsured = true;
}

export async function ensureScriptSessions(env: Env): Promise<void> {
  if (scriptSessionsEnsured) return;
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS line_script_sessions (
      conversation_id  TEXT NOT NULL,
      line_user_id     TEXT NOT NULL,
      step             TEXT NOT NULL,
      brand_slug       TEXT,
      title            TEXT,
      body             TEXT,
      parsed           JSONB,
      expires_at       TIMESTAMPTZ NOT NULL,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (conversation_id, line_user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_script_sessions_exp ON line_script_sessions(expires_at)`;
  scriptSessionsEnsured = true;
}

function estimateSeconds(scenes: ShortScriptScene[]): number {
  const chars = scenes.reduce((n, s) => n + (s.line?.length ?? 0), 0);
  return Math.max(24, Math.min(40, Math.round(chars / CHARS_PER_SEC) || 30));
}

function defaultCta(brandSlug: string | null): string {
  if (brandSlug === 'homigo') return HOMIGO_CTA;
  if (brandSlug === 'taskgo') return '案場的事收在匠管，不用再追 LINE。';
  if (brandSlug === 'washgo') return '洗衣進度在 Washgo，不用再追訊息。';
  return '追蹤我們看下一支。';
}

function toCandidate(script: ShortScriptDoc, brandSlug: string | null): ClipCandidate {
  const seconds = estimateSeconds(script.scenes);
  return {
    id: 'c1',
    hook: script.hook,
    title: script.title,
    summary: script.scenes.slice(0, 3).map((s) => s.line).join('／'),
    strategy: script.scenes.map((s) => {
      const bits = [`${s.order}. ${s.speaker}：${s.line}`];
      if (s.visual) bits.push(`（畫面：${s.visual}）`);
      if (s.sfx) bits.push(`（${s.sfx}）`);
      return bits.join('');
    }).join('\n'),
    estimatedSeconds: seconds,
    startLineOrder: 1,
    endLineOrder: script.scenes.length,
    speakers: [...new Set(script.scenes.map((s) => s.speaker))],
    cta: script.cta || defaultCta(brandSlug),
    brandSlug,
  };
}

function toStrategy(candidate: ClipCandidate): VideoStrategy {
  return {
    candidateId: candidate.id,
    title: candidate.title,
    hook: candidate.hook,
    narrative: candidate.strategy,
    estimatedSeconds: candidate.estimatedSeconds,
    subtitleStyle: 'large',
    cta: candidate.cta,
    brandSlug: candidate.brandSlug,
  };
}

export function looksLikeScript(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  if (/^綁定\s*\d{6}$/.test(t)) return false;
  if (/這個群(綁|解綁)|綁這個群/.test(t)) return false;
  const hits = [
    /《[^》]{4,}》/,
    /開頭/,
    /：「/,
    /📱/,
    /下一秒/,
    /房東.{0,8}租客|租客.{0,8}房東/,
    /(畫面|旁白|鏡頭|sfx|爆炸聲)/i,
  ].filter((re) => re.test(t)).length;
  return hits >= 2 || (/《[^》]+》/.test(t) && t.includes('\n') && t.length > 80);
}

export function isScriptUploadCommand(text: string): boolean {
  return /交腳本|上傳腳本|存腳本|貼腳本|給你腳本|給腳本|交一支/.test(text);
}

export function isScriptConfirm(text: string): boolean {
  return /^(好|好啊|好的|對|要|嗯|可以|ok|OK|Okay|存|存進去|確定|沒錯|就這樣)$/i.test(text.trim());
}

export function isScriptCancel(text: string): boolean {
  return /^(取消|算了|先不要|不要了|停|算了吧)$/.test(text.trim());
}

export function splitScriptBlocks(text: string): string[] {
  const trimmed = text.trim();
  const numbered = trimmed
    .split(/(?=^\s*\d+\s*[.．、)]\s*《)/m)
    .map((s) => s.replace(/^\s*\d+\s*[.．、)]\s*/, '').trim())
    .filter(Boolean);
  if (numbered.length > 1 && numbered.every((p) => p.startsWith('《') || p.length > 50)) {
    return numbered;
  }
  const titles = trimmed
    .split(/(?=《[^》]{4,}》)/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('《') && s.length > 50);
  if (titles.length > 1) return titles;
  return trimmed ? [trimmed] : [];
}

export function inferBrandSlug(text: string): string | null {
  const lower = text.toLowerCase();
  if (/taskgo|阿豪|匠管|工班|案場/.test(text) || lower.includes('taskgo')) return 'taskgo';
  if (/washgo|阿樂|洗衣/.test(text) || lower.includes('washgo')) return 'washgo';
  if (/homigo|小咪|房東|房客|租屋|退租/.test(text) || lower.includes('homigo')) return 'homigo';
  return null;
}

export function parseShortScript(raw: string, fallbackBrand: string | null): ShortScriptDoc | null {
  const text = raw.replace(/^\s*\d+\s*[.．、)]\s*/, '').trim();
  if (!text) return null;
  const titleMatch = text.match(/《([^》]+)》/);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let title = titleMatch?.[1]?.trim() || '';
  if (!title && lines[0] && lines[0].length <= 40 && lines.length > 1) {
    title = lines[0].replace(/^[《」『』"]+|[《」『』"]+$/g, '').trim();
  }
  if (!title) title = (lines[0] || '未命名短影音').slice(0, 40);

  const scenes: ShortScriptScene[] = [];
  for (const line of lines) {
    if (/^《/.test(line) && line.includes('》') && line.length < 50) continue;
    const phone = line.match(/^📱\s*(?:([^「：:]+)[：:])?\s*[「"]?([^」"]+)[」"]?(?:（([^）]+))?/);
    if (phone) {
      scenes.push({
        order: scenes.length + 1,
        speaker: (phone[1] || 'LINE').trim() || 'LINE',
        line: phone[2].trim(),
        visual: phone[3]?.replace(/[）)]$/, '').trim(),
        sfx: '訊息聲',
      });
      continue;
    }
    const dialogue = line.match(/^(?:開頭)?\s*([^：「]{1,12})[：:]\s*[「"]([^」"]+)[」"]?/);
    if (dialogue) {
      scenes.push({
        order: scenes.length + 1,
        speaker: dialogue[1].trim(),
        line: dialogue[2].trim(),
      });
      continue;
    }
    const dirty = line.match(/^(牆壁很髒|地板很髒|床墊很髒|最後打開冰箱[。.]*.+)$/);
    if (dirty) {
      const sfx = /爆炸/.test(line) ? '爆炸聲' : undefined;
      scenes.push({
        order: scenes.length + 1,
        speaker: '畫面',
        line: dirty[1].replace(/（.*$/, '').trim(),
        visual: /ai圖/i.test(line) ? 'AI 圖' : undefined,
        sfx,
      });
      continue;
    }
    if (/^下一秒/.test(line)) continue;
    scenes.push({
      order: scenes.length + 1,
      speaker: /畫面|沉默/.test(line) ? '畫面' : '旁白',
      line: line.replace(/^[「"]|[」"]$/g, ''),
    });
  }

  const hook = scenes[0]?.line || title;
  const last = scenes[scenes.length - 1]?.line || '';
  const cta = /homigo|下載/i.test(last) ? last : defaultCta(fallbackBrand);
  return {
    kind: 'short_script',
    title,
    series: title.includes('房東鬼故事') ? '房東鬼故事' : undefined,
    hook,
    cta,
    scenes: scenes.length ? scenes : [{ order: 1, speaker: '旁白', line: text.slice(0, 200) }],
    rawText: text,
    source: 'line',
  };
}

export async function createScriptJob(env: Env, params: {
  brandId: string;
  brandSlug: string;
  script: ShortScriptDoc;
  createdBy?: string | null;
  replace?: boolean;
}): Promise<{ job: VideoJobRow; created: boolean }> {
  await ensureVideoScriptType(env);
  const sql = getSql(env);
  const existing = await sql`
    SELECT * FROM video_jobs
    WHERE brand_id = ${params.brandId}::uuid
      AND source_type = 'script'
      AND title = ${params.script.title}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const candidate = toCandidate(params.script, params.brandSlug);
  const strategy = toStrategy(candidate);
  const doc: ShortScriptDoc = { ...params.script, source: params.script.source };

  if (existing.length && !params.replace) {
    return { job: mapVideoJob(existing[0] as Record<string, unknown>), created: false };
  }
  if (existing.length && params.replace) {
    const id = (existing[0] as { id: string }).id;
    const updated = await sql`
      UPDATE video_jobs SET
        status = 'strategy_review',
        candidates = ${JSON.stringify([candidate])}::jsonb,
        selected_candidate_id = 'c1',
        strategy = ${JSON.stringify(strategy)}::jsonb,
        transcript = ${JSON.stringify(doc)}::jsonb,
        error_message = NULL,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return { job: mapVideoJob(updated[0] as Record<string, unknown>), created: false };
  }

  const inserted = await sql`
    INSERT INTO video_jobs (
      source_type, status, brand_id, title,
      candidates, selected_candidate_id, strategy, transcript, created_by
    ) VALUES (
      'script', 'strategy_review', ${params.brandId}::uuid, ${params.script.title},
      ${JSON.stringify([candidate])}::jsonb, 'c1',
      ${JSON.stringify(strategy)}::jsonb, ${JSON.stringify(doc)}::jsonb,
      ${params.createdBy ?? null}::uuid
    )
    RETURNING *
  `;
  const job = mapVideoJob(inserted[0] as Record<string, unknown>);
  if (params.createdBy) {
    await logActivity(env, {
      brandId: params.brandId,
      actorType: 'user',
      actorUserId: params.createdBy,
      action: 'video_job.created',
      entityType: 'video_job',
      entityId: job.id,
      afterState: { sourceType: 'script', title: params.script.title, source: params.script.source },
    }).catch(() => undefined);
  }
  return { job, created: true };
}

export async function seedHomigoGhostStoryScripts(env: Env): Promise<number> {
  if (ghostScriptsSeeded) return 0;
  await ensureVideoScriptType(env);
  const sql = getSql(env);
  const rows = await sql`SELECT id, slug FROM brands WHERE slug = 'homigo' AND is_active = true LIMIT 1`;
  if (!rows.length) return 0;
  const brand = rows[0] as { id: string; slug: string };
  let created = 0;
  for (const item of HOMIGO_GHOST_SCRIPTS) {
    const script: ShortScriptDoc = {
      kind: 'short_script',
      title: item.title,
      series: item.series,
      hook: item.hook,
      cta: item.cta,
      scenes: item.scenes,
      rawText: item.rawText,
      source: 'seed',
    };
    const result = await createScriptJob(env, {
      brandId: brand.id,
      brandSlug: brand.slug,
      script,
      replace: false,
    });
    if (result.created) created += 1;
  }
  ghostScriptsSeeded = true;
  return created;
}

type ScriptSessionRow = {
  conversation_id: string;
  line_user_id: string;
  step: string;
  brand_slug: string | null;
  title: string | null;
  body: string | null;
  parsed: unknown;
  expires_at: string;
};

export async function hasOpenScriptSession(env: Env, conversationId: string, lineUserId: string): Promise<boolean> {
  return Boolean(await getScriptSession(env, conversationId, lineUserId));
}

async function getScriptSession(env: Env, conversationId: string, lineUserId: string): Promise<ScriptSessionRow | null> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT conversation_id, line_user_id, step, brand_slug, title, body, parsed, expires_at
      FROM line_script_sessions
      WHERE conversation_id = ${conversationId} AND line_user_id = ${lineUserId}
        AND expires_at > now()
      LIMIT 1
    `;
    return (rows[0] as ScriptSessionRow | undefined) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/does not exist/i.test(msg)) throw e;
    await ensureScriptSessions(env);
    return null;
  }
}

async function saveScriptSession(env: Env, row: {
  conversationId: string;
  lineUserId: string;
  step: string;
  brandSlug?: string | null;
  title?: string | null;
  body?: string | null;
  parsed?: unknown;
}): Promise<void> {
  await ensureScriptSessions(env);
  const sql = getSql(env);
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await sql`
    INSERT INTO line_script_sessions (
      conversation_id, line_user_id, step, brand_slug, title, body, parsed, expires_at, updated_at
    ) VALUES (
      ${row.conversationId}, ${row.lineUserId}, ${row.step}, ${row.brandSlug ?? null},
      ${row.title ?? null}, ${row.body ?? null}, ${JSON.stringify(row.parsed ?? null)}::jsonb,
      ${expires}::timestamptz, now()
    )
    ON CONFLICT (conversation_id, line_user_id) DO UPDATE SET
      step = EXCLUDED.step,
      brand_slug = EXCLUDED.brand_slug,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      parsed = EXCLUDED.parsed,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
  `;
}

async function clearScriptSession(env: Env, conversationId: string, lineUserId: string): Promise<void> {
  const sql = getSql(env);
  await sql`
    DELETE FROM line_script_sessions
    WHERE conversation_id = ${conversationId} AND line_user_id = ${lineUserId}
  `;
}

function textMsg(text: string) {
  return { type: 'text', text };
}

function scriptQuickReply(extra: Array<{ label: string; text: string }> = []) {
  const items = [
    ...extra.map((x) => ({ type: 'action', action: { type: 'message', label: x.label, text: x.text } })),
    { type: 'action', action: { type: 'message', label: '短影音', text: '短影音' } },
    { type: 'action', action: { type: 'message', label: '取消', text: '取消' } },
  ];
  return { items: items.slice(0, 13) };
}

function confirmCard(scripts: ShortScriptDoc[], brandName: string) {
  const titles = scripts.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const first = scripts[0];
  const more = scripts.length > 1 ? `\n一共 ${scripts.length} 支。` : '';
  return `${brandName} 收到：\n${titles}\n\n開頭：${first.hook}${more}\n\n要存進短影音工作台嗎？回「好」就存。`;
}

export async function ingestScriptText(env: Env, params: {
  brandId: string;
  brandSlug: string;
  text: string;
  createdBy?: string | null;
  source: 'web' | 'line';
  replace?: boolean;
}): Promise<{ jobs: VideoJobRow[]; titles: string[]; created: number; updated: number }> {
  const blocks = splitScriptBlocks(params.text);
  const jobs: VideoJobRow[] = [];
  let created = 0;
  let updated = 0;
  for (const block of blocks) {
    const parsed = parseShortScript(block, params.brandSlug);
    if (!parsed) continue;
    parsed.source = params.source;
    const result = await createScriptJob(env, {
      brandId: params.brandId,
      brandSlug: params.brandSlug,
      script: parsed,
      createdBy: params.createdBy,
      replace: params.replace ?? true,
    });
    jobs.push(result.job);
    if (result.created) created += 1;
    else updated += 1;
  }
  if (!jobs.length) throw new Error('我看不太出來這是腳本，請連標題一起貼。');
  return { jobs, titles: jobs.map((j) => j.title || '未命名'), created, updated };
}

export async function handleLineScriptIntake(env: Env, params: {
  text: string;
  conversationId: string;
  lineUserId: string | null;
  brand: { id: string; slug: string; name: string } | null;
  needGroupBind: boolean;
}): Promise<unknown[] | null> {
  const lineUserId = params.lineUserId || 'unknown';
  const session = await getScriptSession(env, params.conversationId, lineUserId);
  const uploadCmd = isScriptUploadCommand(params.text);
  const looks = looksLikeScript(params.text);

  if (params.needGroupBind && (uploadCmd || looks || session)) {
    return [textMsg('這個群還沒指定品牌，管理員先回「這個群綁定 Homigo」，我才會把腳本存進去。')];
  }
  if (!params.brand && (uploadCmd || looks || session)) {
    return [textMsg('這支要存到哪個品牌？請先在工作群綁品牌，或私訊時寫 Homigo／TaskGo／Washgo。')];
  }
  if (!params.brand) return null;

  if (isScriptCancel(params.text) && session) {
    await clearScriptSession(env, params.conversationId, lineUserId);
    return [textMsg('好，這次先不存。之後直接貼腳本過來就行。')];
  }

  if (uploadCmd && !looks) {
    await saveScriptSession(env, {
      conversationId: params.conversationId,
      lineUserId,
      step: 'awaiting_script',
      brandSlug: params.brand.slug,
    });
    return [{
      type: 'text',
      text: `好，把 ${params.brand.name} 的腳本貼過來就行。標題用《》包起來最好，一次貼多支也可以。`,
      quickReply: scriptQuickReply([{ label: '取消', text: '取消' }]),
    }];
  }

  if (looks) {
    const blocks = splitScriptBlocks(params.text);
    const parsed = blocks.map((b) => parseShortScript(b, params.brand!.slug)).filter(Boolean) as ShortScriptDoc[];
    if (!parsed.length) return null;
    await saveScriptSession(env, {
      conversationId: params.conversationId,
      lineUserId,
      step: 'awaiting_confirm',
      brandSlug: params.brand.slug,
      title: parsed[0].title,
      body: params.text,
      parsed,
    });
    return [{
      type: 'text',
      text: confirmCard(parsed, params.brand.name),
      quickReply: scriptQuickReply([{ label: '存進去', text: '好' }]),
    }];
  }

  if (session?.step === 'awaiting_script' && params.text.trim().length > 20) {
    const parsed = parseShortScript(params.text, params.brand.slug);
    if (!parsed) {
      return [textMsg('再貼完整一點，至少要有標題和對白。')];
    }
    await saveScriptSession(env, {
      conversationId: params.conversationId,
      lineUserId,
      step: 'awaiting_confirm',
      brandSlug: params.brand.slug,
      title: parsed.title,
      body: params.text,
      parsed: [parsed],
    });
    return [{
      type: 'text',
      text: confirmCard([parsed], params.brand.name),
      quickReply: scriptQuickReply([{ label: '存進去', text: '好' }]),
    }];
  }

  if (session?.step === 'awaiting_confirm' && isScriptConfirm(params.text)) {
    const parsed = Array.isArray(session.parsed) ? session.parsed as ShortScriptDoc[] : [];
    const body = session.body || '';
    const scripts = parsed.length ? parsed : [parseShortScript(body, params.brand.slug)].filter(Boolean) as ShortScriptDoc[];
    if (!scripts.length) {
      await clearScriptSession(env, params.conversationId, lineUserId);
      return [textMsg('腳本不見了，請再貼一次。')];
    }
    const saved: string[] = [];
    for (const script of scripts) {
      script.source = 'line';
      const result = await createScriptJob(env, {
        brandId: params.brand.id,
        brandSlug: params.brand.slug,
        script,
        replace: true,
      });
      saved.push(`《${result.job.title}》`);
    }
    await clearScriptSession(env, params.conversationId, lineUserId);
    return [textMsg(`存好了，${params.brand.name} 短影音工作台已有 ${saved.join('、')}，狀態是腳本待拍。`)]
      .map((m) => ({ ...m, quickReply: scriptQuickReply([{ label: '短影音工作', text: '短影音' }]) }));
  }

  if (session) {
    return [textMsg(session.step === 'awaiting_confirm'
      ? '要存的話回「好」，不要就回「取消」。'
      : '把腳本貼過來就行，或回「取消」。')];
  }

  return null;
}

export function isShortScriptDoc(value: unknown): value is ShortScriptDoc {
  return !!value && typeof value === 'object' && (value as { kind?: string }).kind === 'short_script';
}
