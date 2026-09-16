import type { Env } from './env';
import type { AuthUser } from './auth';
import { getSql } from './db';
import { rowToCamel } from './case';
import { chatCompleteJson } from './openai';
import { ANTI_AI_RULES, SHARED_BRAND_CTA_RULE, getBrandVoice, type BrandContext } from './prompts';
import {
  generatePlatformPost, saveGeneratedContent,
  SUPPORTED_PLATFORMS, type SocialPlatform,
} from './generate';
import { toPressCoverage, coverageTopicSummary, loadPublishedPrimaryCoverages, publishedCoveragePrompt } from './press';
import { toBrandDocument } from './documents';
import { THREADS_DESK_HOURS_TW, slotAtToday } from './threads-slots';
import { withEditorTables } from './editor-migrate';

export const EDITOR_FALLBACK_AVATAR: Record<string, string> = {
  washgo: '/brands/washgo-ale.png',
  homigo: '/brands/homigo-xiaomi.png',
  taskgo: '/brands/taskgo-ahao.png',
};

function toDayLabel(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const EDITOR_COLOR: Record<string, string> = {
  washgo: '#A87C64',
  homigo: '#2F5D50',
  taskgo: '#0B2D5C',
};

export type EditorToolName = 'list_context' | 'draft_post' | 'schedule_post' | 'list_schedule';
export type ScheduleMode = 'review' | 'publish';

export interface EditorPersona {
  agentId: string | null;
  nickname: string;
  characterTitle: string;
  avatarUrl: string | null;
  temperament: string;
  catchphrase: string;
  focus: string;
  voiceId: string | null;
  color: string;
}

export interface EditorDeskContext {
  pressCoverages: Array<{
    id: string; outlet: string; headline: string; publishedOn: string | null;
    status: string; summary: string | null; articleUrl: string | null; keyQuotes: string[];
  }>;
  pressReleases: Array<{ id: string; title: string; status: string; updatedAt?: string }>;
  documents: Array<{ id: string; title: string; sourceType: string }>;
  assets: Array<{ id: string; caption: string | null; fileUrl: string | null }>;
  schedule: Array<{
    id: string; title: string | null; platform: string; status: string;
    scheduledAt: string | null; body: string | null; imageUrl: string | null;
  }>;
  queue: Array<{
    id: string; title: string; status: string; targetPlatform: string;
    body: string | null; imageUrl: string | null;
  }>;
}

export interface EditorToolArgs {
  name: EditorToolName;
  platform?: string;
  topic?: string;
  coverageId?: string;
  releaseId?: string;
  contentId?: string;
  contentVersionId?: string;
  scheduledAt?: string;
  mode?: ScheduleMode;
  instruction?: string;
}

export interface EditorDraftCard {
  contentId: string;
  contentVersionId: string;
  platform: SocialPlatform;
  title: string;
  body: string;
  hashtags: string[];
  imageUrl: string | null;
  status: string;
  scheduledAt?: string | null;
}

export interface EditorToolResult {
  ok: boolean;
  tool: EditorToolName;
  summary: string;
  context?: EditorDeskContext;
  draft?: EditorDraftCard;
  drafts?: EditorDraftCard[];
}

export function convaiAgentIdForSlug(env: Env, slug: string): string | null {
  if (slug === 'washgo') return env.ELEVENLABS_WASHGO_AGENT_ID ?? null;
  if (slug === 'homigo') return env.ELEVENLABS_HOMIGO_AGENT_ID ?? null;
  if (slug === 'taskgo') return env.ELEVENLABS_TASKGO_AGENT_ID ?? null;
  return null;
}

export async function loadBrandEditor(env: Env, brandId: string, slug: string): Promise<EditorPersona> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.persona FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.brand_id = ${brandId}::uuid AND a.is_active = true AND r.code = 'brand_ai'
    LIMIT 1
  `;
  const persona = (rows[0] as { persona?: Record<string, unknown> } | undefined)?.persona ?? {};
  const nickname = String(persona.nickname ?? (slug === 'washgo' ? '阿樂' : slug === 'homigo' ? '小咪' : '阿豪'));
  return {
    agentId: (rows[0] as { id?: string } | undefined)?.id ?? null,
    nickname,
    characterTitle: String(persona.characterTitle ?? ''),
    avatarUrl: (persona.avatarUrl as string | null | undefined) ?? EDITOR_FALLBACK_AVATAR[slug] ?? null,
    temperament: String(persona.temperament ?? ''),
    catchphrase: String(persona.catchphrase ?? ''),
    focus: String(persona.focus ?? ''),
    voiceId: (persona.voiceId as string | null | undefined) ?? null,
    color: EDITOR_COLOR[slug] ?? '#6C6C6C',
  };
}

export function editorGroundingRules(brandName: string, slug: string): string {
  const voice = getBrandVoice(slug);
  const frame = slug === 'washgo'
    ? 'Washgo 只能講:洗衣／乾洗日常、LINE 送洗與履歷、門市調撥、換季汙漬羽絨、已核准的媒體露出。Threads 三大主軸 A 系統服務／B 洗滌知識／C 流行洗法。'
    : slug === 'homigo'
      ? 'Homigo 只能講:租屋關係、收租報修、合約信任、已核准露出。不要變成房仲廣告。'
      : slug === 'taskgo'
        ? 'TaskGo 只能講:工班派工、現場回報、案場日常、已核准露出。不要變成裝潢估價業務。'
        : `只講 ${brandName} 品牌知識裡有的事。`;
  return [
    '品牌錨點(對方再天馬行空也必須遵守):',
    `- 你只代表 ${brandName}。回覆、建議、產稿都只能用品牌知識、品牌規則、已核准媒體露出、官方素材。沒寫進去的事實、優惠、數字、媒體名不准發明。`,
    `- 內容框架:${frame}`,
    voice.dailyConcerns ? `- 行業日常範圍:${voice.dailyConcerns}` : '',
    '- 對方問政治、八卦、星座、別的品牌產品、或完全無關的閒聊:用一句接住,立刻拉回本品牌能做的事(露出、檔期、可講的切角)。不要跟著編故事、不要展開無關情節。',
    '- 不知道或不在框架裡,就直說「這不在我們能對外講的範圍」,改提一個品牌框架內的替代切角。',
    '- 產稿 topic 必須先改寫成品牌框架內的切角,再呼叫 draft_post;禁止把亂聊原話當主題。',
    '- 不討論其他品牌的產品細節,除非對方明確要生態系合作,且只提一句公開可說的。',
  ].filter(Boolean).join('\n');
}

export function buildEditorSystemPrompt(editor: EditorPersona, brandName: string, slug: string): string {
  const voice = getBrandVoice(slug);
  return [
    `你是「${editor.nickname}」${editor.characterTitle ? `(${editor.characterTitle})` : ''}，${brandName} 的品牌小編。`,
    '你正在跟公司行銷一對一聊天。像真人同事，不要客套開場白。',
    '性格可以輕鬆,內容不能亂跑。對方問得再跳,你也只准用品牌知識與框架回答。',
    editor.temperament ? `你的性格:${editor.temperament}` : '',
    editor.catchphrase ? `你的口頭禪是「${editor.catchphrase}」(偶爾自然地用,不要每句都講)。` : '',
    editor.focus ? `你在意的立場:${editor.focus}` : '',
    voice.frontlinePersona,
    voice.dailyConcerns ? `你的行業日常話題:${voice.dailyConcerns}` : '',
    '',
    editorGroundingRules(brandName, slug),
    '',
    '對談規則:',
    '- 用台灣口語,一次 80-160 字。先給具體建議(哪則新聞、哪個平台、切角、時段),再問「要我主動發文嗎？」',
    '- 對方說可以、幫我發、幫我排程、注意時間 → 呼叫 schedule_post,mode=publish,選下一個合適時段(9/12/18/21,避開凌晨 2-6 點)',
    '- 對方說先放著、給我看、先不要發 → 呼叫 draft_post 或 schedule_post 的 mode=review,不要建發布 job',
    '- 沒有確認前,不要呼叫 schedule_post',
    '- 只處理自己品牌。不要假裝已經發出去。',
    '- 產稿後用一句口語覆誦重點,再問要不要發。',
    '- 對方只是要發文或排程時,不要呼叫 list_context / list_schedule。',
    '- 對話裡已有草稿就直接 schedule_post,帶上 contentId 與 contentVersionId,不要重產。',
    ANTI_AI_RULES,
  ].filter(Boolean).join('\n');
}

export function brandFrameVariable(brandName: string, slug: string): string {
  return editorGroundingRules(brandName, slug);
}

export function firstMessageFor(editor: EditorPersona, brandName: string): string {
  return `嗨～我是${editor.nickname}!今天要看${brandName}的媒體露出,還是想發文?`;
}

/** 對談輪只用 1 次查詢,避免跟產稿疊在同一次 Worker 打爆 subrequest */
export async function loadEditorChatBrief(env: Env, brandId: string): Promise<string> {
  const sql = getSql(env);
  const coverages = await sql`
    SELECT id, outlet, headline, published_on, status
    FROM press_coverages
    WHERE brand_id = ${brandId}::uuid
    ORDER BY published_on DESC NULLS LAST
    LIMIT 6
  `.catch(() => []);
  const press = (coverages as Record<string, unknown>[]).map((r) => {
    const day = toDayLabel(r.published_on) ?? '日期未定';
    return `- [${r.id}] ${day} ${r.outlet}「${r.headline}」(${r.status})`;
  });
  return press.length ? `最近媒體露出:\n${press.join('\n')}` : '最近沒有媒體露出。';
}

/** 工作台產稿用精簡品牌知識,比完整 buildBrandContext 少約 7 次 Neon 查詢 */
async function buildEditorBrandContext(
  env: Env,
  brandId: string,
  slug: string,
  brandName: string,
): Promise<BrandContext> {
  const sql = getSql(env);
  const [ruleRows, coverages] = await Promise.all([
    sql`
      SELECT rule_type, statement, condition_note FROM brand_rules
      WHERE brand_id = ${brandId}::uuid
      ORDER BY sort_order LIMIT 20
    `.catch(() => []),
    loadPublishedPrimaryCoverages(env, brandId, 4),
  ]);
  const voice = getBrandVoice(slug);
  const rules = (ruleRows as { rule_type: string; statement: string; condition_note: string | null }[])
    .map((r) => `- [${r.rule_type}] ${r.statement}${r.condition_note ? `(條件:${r.condition_note})` : ''}`)
    .join('\n');
  const systemPrompt = [
    `品牌:${brandName}`,
    voice.frontlinePersona,
    voice.dailyConcerns ? `這個行業每天在聊的話題:${voice.dailyConcerns}` : '',
    voice.contentCraft ?? '',
    editorGroundingRules(brandName, slug),
    rules ? `品牌規則:\n${rules}` : '',
    publishedCoveragePrompt(coverages),
    SHARED_BRAND_CTA_RULE,
    ANTI_AI_RULES,
  ].filter(Boolean).join('\n');
  return { brandId, slug, name: brandName, systemPrompt };
}

export async function loadEditorContext(env: Env, brandId: string): Promise<EditorDeskContext> {
  const sql = getSql(env);
  const [coverages, releases, documents] = await Promise.all([
    sql`
      SELECT id, outlet, headline, published_on, status, summary, article_url, key_quotes
      FROM press_coverages
      WHERE brand_id = ${brandId}::uuid
      ORDER BY CASE status WHEN 'inbox' THEN 0 WHEN 'published' THEN 1 WHEN 'syndicated' THEN 2 ELSE 3 END,
               published_on DESC NULLS LAST
      LIMIT 12
    `.catch(() => []),
    sql`
      SELECT id, title, status, updated_at FROM press_releases
      WHERE brand_id = ${brandId}::uuid
      ORDER BY updated_at DESC LIMIT 8
    `.catch(() => []),
    sql`
      SELECT id, title, source_type FROM brand_documents
      WHERE brand_id = ${brandId}::uuid
      ORDER BY created_at DESC LIMIT 8
    `.catch(() => []),
  ]);
  const [assets, schedule, queue] = await Promise.all([
    sql`
      SELECT id, caption, file_url FROM brand_assets
      WHERE brand_id = ${brandId}::uuid AND asset_type = 'image'
      ORDER BY created_at DESC LIMIT 8
    `.catch(() => []),
    sql`
      SELECT pj.id, c.title, pj.platform, pj.status, pj.scheduled_at, v.body, a.file_url AS image_url
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN content_versions v ON v.id = pj.content_version_id
      LEFT JOIN LATERAL (
        SELECT file_url FROM content_assets
        WHERE content_version_id = v.id AND asset_type = 'image' LIMIT 1
      ) a ON true
      WHERE c.brand_id = ${brandId}::uuid
        AND coalesce(pj.scheduled_at, pj.published_at, pj.created_at) >= now() - interval '3 days'
        AND coalesce(pj.scheduled_at, pj.published_at, pj.created_at) < now() + interval '5 days'
      ORDER BY coalesce(pj.scheduled_at, pj.published_at, pj.created_at) ASC
      LIMIT 16
    `.catch(() => []),
    sql`
      SELECT c.id, c.title, c.status, c.target_platform, v.body, a.file_url AS image_url
      FROM contents c
      LEFT JOIN LATERAL (
        SELECT body FROM content_versions WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT file_url FROM content_assets ca
        JOIN content_versions cv ON cv.id = ca.content_version_id
        WHERE cv.content_id = c.id AND ca.asset_type = 'image'
        ORDER BY cv.version_number DESC LIMIT 1
      ) a ON true
      WHERE c.brand_id = ${brandId}::uuid
        AND c.status IN ('draft', 'pending_review', 'approved', 'needs_revision', 'scheduled')
      ORDER BY c.updated_at DESC
      LIMIT 10
    `.catch(() => []),
  ]);

  return {
    pressCoverages: (coverages as Record<string, unknown>[]).map((r) => {
      const c = toPressCoverage(r);
      return {
        id: c.id, outlet: c.outlet, headline: c.headline,
        publishedOn: toDayLabel(c.publishedOn),
        status: c.status, summary: c.summary, articleUrl: c.articleUrl, keyQuotes: c.keyQuotes,
      };
    }),
    pressReleases: (releases as Record<string, unknown>[]).map((r) => {
      const row = rowToCamel<{ id: string; title: string; status: string; updatedAt?: string }>(r);
      return { id: row.id, title: row.title, status: row.status, updatedAt: row.updatedAt };
    }),
    documents: (documents as Record<string, unknown>[]).map((r) => {
      const d = toBrandDocument(r);
      return { id: d.id, title: d.title, sourceType: d.sourceType };
    }),
    assets: (assets as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      caption: (r.caption as string | null) ?? null,
      fileUrl: (r.file_url as string | null) ?? null,
    })),
    schedule: (schedule as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      platform: r.platform as string,
      status: r.status as string,
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      body: (r.body as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
    })),
    queue: (queue as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      targetPlatform: r.target_platform as string,
      body: (r.body as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
    })),
  };
}

export function contextDigest(ctx: EditorDeskContext): string {
  const press = ctx.pressCoverages.slice(0, 6).map((c) => {
    const day = toDayLabel(c.publishedOn) ?? '日期未定';
    return `- [${c.id}] ${day} ${c.outlet}「${c.headline}」(${c.status})`;
  });
  const upcoming = ctx.schedule
    .filter((s) => s.status === 'scheduled' || s.status === 'queued')
    .slice(0, 6)
    .map((s) => `- ${s.scheduledAt ?? '未排'} ${s.platform} ${s.title ?? ''}`);
  const pending = ctx.queue.slice(0, 5).map((q) => `- ${q.status} ${q.targetPlatform} ${q.title}`);
  return [
    press.length ? `最近媒體露出:\n${press.join('\n')}` : '最近沒有媒體露出。',
    upcoming.length ? `已排行程:\n${upcoming.join('\n')}` : '未來五天沒有已排行程。',
    pending.length ? `待審／草稿:\n${pending.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function suggestScheduleAt(now = new Date()): Date {
  const hours = THREADS_DESK_HOURS_TW.filter((h) => h >= 9 && h <= 21);
  for (let day = 0; day < 3; day += 1) {
    for (const hour of hours) {
      const slot = new Date(slotAtToday(hour, now).getTime() + day * 24 * 60 * 60 * 1000);
      if (slot.getTime() > now.getTime() + 20 * 60 * 1000) return slot;
    }
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function parsePlatform(value: string | undefined): SocialPlatform {
  if (value && (SUPPORTED_PLATFORMS as string[]).includes(value)) return value as SocialPlatform;
  return 'threads';
}

export async function appendEditorMessage(
  env: Env,
  sessionId: string,
  row: { role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string; toolPayload?: unknown },
): Promise<void> {
  await withEditorTables(env, async () => {
    const sql = getSql(env);
    await sql`
      INSERT INTO editor_messages (session_id, role, content, tool_name, tool_payload)
      VALUES (
        ${sessionId}::uuid, ${row.role}, ${row.content},
        ${row.toolName ?? null},
        ${row.toolPayload ? JSON.stringify(row.toolPayload) : null}
      )
    `;
    if (row.role !== 'user') {
      await sql`UPDATE editor_sessions SET updated_at = now() WHERE id = ${sessionId}::uuid`;
    }
  });
}

export interface EditorMessageRow {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  toolPayload: EditorToolResult | null;
  createdAt: string;
}

function draftFromPayload(payload: unknown): EditorDraftCard | null {
  const result = payload as EditorToolResult | null | undefined;
  if (result?.draft?.contentId && result.draft.contentVersionId) return result.draft;
  const first = result?.drafts?.[0];
  if (first?.contentId && first.contentVersionId) return first;
  return null;
}

export function findLatestDraft(messages: Array<{ toolPayload?: unknown }>): EditorDraftCard | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const draft = draftFromPayload(messages[i].toolPayload);
    if (draft) return draft;
  }
  return null;
}

async function findLatestSessionDraft(env: Env, sessionId: string): Promise<EditorDraftCard | null> {
  return withEditorTables(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT tool_payload FROM editor_messages
      WHERE session_id = ${sessionId}::uuid AND tool_payload IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 8
    `;
    for (const r of rows as { tool_payload: unknown }[]) {
      const draft = draftFromPayload(r.tool_payload);
      if (draft) return draft;
    }
    return null;
  });
}

export async function listEditorMessages(env: Env, sessionId: string, limit = 40): Promise<EditorMessageRow[]> {
  return withEditorTables(env, async () => {
    const sql = getSql(env);
    const rows = await sql`
      SELECT id, role, content, tool_name, tool_payload, created_at
      FROM editor_messages
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return (rows as Record<string, unknown>[]).reverse().map((r) => ({
      id: r.id as string,
      role: r.role as string,
      content: r.content as string,
      toolName: (r.tool_name as string | null) ?? null,
      toolPayload: (r.tool_payload as EditorToolResult | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });
}

async function loadCoverageForBrand(env: Env, brandId: string, coverageId: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT * FROM press_coverages WHERE id = ${coverageId}::uuid AND brand_id = ${brandId}::uuid LIMIT 1
  `;
  return rows.length ? toPressCoverage(rows[0] as Record<string, unknown>) : null;
}

export async function executeEditorTool(
  env: Env,
  params: {
    brandId: string;
    slug: string;
    brandName: string;
    auth: AuthUser | null;
    args: EditorToolArgs;
    sessionId?: string;
    recentDraft?: EditorDraftCard | null;
  },
): Promise<EditorToolResult> {
  const { brandId, slug, args } = params;
  const sql = getSql(env);

  if (args.name === 'list_context' || args.name === 'list_schedule') {
    const context = await loadEditorContext(env, brandId);
    return {
      ok: true,
      tool: args.name,
      summary: args.name === 'list_schedule'
        ? `未來行程 ${context.schedule.length} 筆,待審 ${context.queue.length} 筆。`
        : `媒體 ${context.pressCoverages.length} 則,素材 ${context.assets.length} 張,待審 ${context.queue.length} 篇。`,
      context,
    };
  }

  if (args.name === 'draft_post') {
    const platform = parsePlatform(args.platform);
    const brandCtx = await buildEditorBrandContext(env, brandId, slug, params.brandName);
    let topic = args.topic?.trim() || `${params.brandName} 社群貼文`;
    let extra = args.instruction ?? '';
    let topicSummary: string | undefined;
    if (args.coverageId) {
      const coverage = await loadCoverageForBrand(env, brandId, args.coverageId);
      if (coverage) {
        topic = `${coverage.outlet}報導:${coverage.headline}`;
        topicSummary = coverageTopicSummary(coverage);
        extra = [
          `這是「感謝／轉發見報」貼文。只能提 ${coverage.outlet},附原文連結。`,
          extra,
        ].filter(Boolean).join('\n');
      }
    }
    const groundedExtra = [
      `主題必須落在 ${params.brandName} 品牌框架。若原話離題,先改寫成品牌可講的切角,不要跟著亂寫。`,
      extra,
    ].filter(Boolean).join('\n');
    const result = await generatePlatformPost(env, {
      brandCtx, platform, topic, topicSummary, extraInstruction: groundedExtra,
      skipImage: true, skipPrediction: true,
    });
    const saved = await saveGeneratedContent(env, {
      brandCtx, platform, result, generatedByAgentId: null,
      status: 'pending_review',
      promptMeta: {
        source: 'editor_desk',
        coverageId: args.coverageId ?? null,
        editorTool: 'draft_post',
      },
    });
    const draft: EditorDraftCard = {
      contentId: saved.contentId,
      contentVersionId: saved.versionId,
      platform,
      title: result.post.title,
      body: result.post.body,
      hashtags: result.post.hashtags ?? [],
      imageUrl: result.imageUrl,
      status: 'pending_review',
    };
    return {
      ok: true,
      tool: 'draft_post',
      summary: `已產 ${platform} 待審稿「${result.post.title}」。文案好了,配圖可之後在內容中心補。要我主動發文嗎？`,
      draft,
      drafts: [draft],
    };
  }

  if (args.name === 'schedule_post') {
    const mode: ScheduleMode = args.mode === 'review' ? 'review' : 'publish';
    let contentId = args.contentId;
    let contentVersionId = args.contentVersionId;
    let platform = parsePlatform(args.platform);
    let draft: EditorDraftCard | undefined;
    const reused = params.recentDraft
      ?? (params.sessionId && (!contentId || !contentVersionId)
        ? await findLatestSessionDraft(env, params.sessionId)
        : null);

    if ((!contentId || !contentVersionId) && reused) {
      contentId = reused.contentId;
      contentVersionId = reused.contentVersionId;
      platform = parsePlatform(args.platform || reused.platform);
      draft = reused;
    }

    if (!contentId || !contentVersionId) {
      const drafted = await executeEditorTool(env, {
        ...params,
        args: { ...args, name: 'draft_post', platform },
      });
      if (!drafted.draft) return { ok: false, tool: 'schedule_post', summary: drafted.summary };
      contentId = drafted.draft.contentId;
      contentVersionId = drafted.draft.contentVersionId;
      platform = drafted.draft.platform;
      draft = drafted.draft;
    }

    if (mode === 'review') {
      return {
        ok: true,
        tool: 'schedule_post',
        summary: '先放待審,沒有排發布。你想改或要我排進行程再說一聲。',
        draft: draft ? { ...draft, status: 'pending_review' } : undefined,
      };
    }

    let scheduledAt = args.scheduledAt ? new Date(args.scheduledAt) : suggestScheduleAt();
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) {
      scheduledAt = suggestScheduleAt();
    }

    const existing = await sql`
      SELECT id FROM contents WHERE id = ${contentId}::uuid AND brand_id = ${brandId}::uuid LIMIT 1
    `;
    if (!existing.length) return { ok: false, tool: 'schedule_post', summary: '找不到這篇稿' };

    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${contentId}::uuid`;
    await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (
        ${contentId}::uuid, ${contentVersionId}::uuid, ${platform}, 'scheduled', ${scheduledAt.toISOString()}
      )
    `;
    const when = scheduledAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return {
      ok: true,
      tool: 'schedule_post',
      summary: `會注意時段～已排 ${platform} ${when} 發。到點會發出,要改時間跟我說。`,
      draft: draft
        ? { ...draft, status: 'scheduled', scheduledAt: scheduledAt.toISOString() }
        : {
          contentId, contentVersionId, platform, title: '', body: '', hashtags: [],
          imageUrl: null, status: 'scheduled', scheduledAt: scheduledAt.toISOString(),
        },
    };
  }

  return { ok: false, tool: args.name, summary: '未知工具' };
}

interface ChatPlan {
  reply: string;
  tool?: EditorToolArgs | null;
}

export async function runEditorChatTurn(
  env: Env,
  params: {
    brandId: string;
    slug: string;
    brandName: string;
    editor: EditorPersona;
    sessionId: string;
    userMessage: string;
    pinned?: { type?: string; id?: string; label?: string } | null;
    auth: AuthUser;
  },
): Promise<{ reply: string; toolResult?: EditorToolResult; messages: EditorMessageRow[] }> {
  const [history, brief] = await Promise.all([
    listEditorMessages(env, params.sessionId, 16),
    loadEditorChatBrief(env, params.brandId),
  ]);
  const recentDraft = findLatestDraft(history);
  const system = [
    buildEditorSystemPrompt(params.editor, params.brandName, params.slug),
    '',
    '你現在看到的媒體現況(只能引用這裡出現的露出,不要發明媒體名或數字):',
    brief,
    recentDraft
      ? `對話裡已有草稿,排程請用 contentId=${recentDraft.contentId} contentVersionId=${recentDraft.contentVersionId} platform=${recentDraft.platform}`
      : '',
    params.pinned?.label ? `對方剛點選:${params.pinned.label}` : '',
    '',
    '回傳 JSON:{"reply":"口語回覆","tool":null 或 {"name":"list_context|draft_post|schedule_post|list_schedule","platform":"threads|facebook|instagram","topic":"","coverageId":"","contentId":"","contentVersionId":"","scheduledAt":"ISO","mode":"review|publish","instruction":""}}',
    '沒有要動手就 tool=null。reply 一定要有,給語音直接唸。reply 只能講品牌框架內的事。',
  ].filter(Boolean).join('\n');

  const transcript = history
    .map((m) => `${m.role === 'user' ? '行銷' : m.role === 'tool' ? '系統' : params.editor.nickname}:${m.content}`)
    .join('\n');

  const plan = await chatCompleteJson<ChatPlan>(env, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${transcript ? `${transcript}\n` : ''}行銷:${params.userMessage}` },
    ],
    temperature: 0.5,
    maxTokens: 800,
  });

  let toolResult: EditorToolResult | undefined;
  let reply = (plan.reply || '').trim() || '好的,我聽到了。';
  if (plan.tool?.name) {
    const toolArgs = { ...plan.tool };
    if (toolArgs.name === 'schedule_post' && recentDraft && (!toolArgs.contentId || !toolArgs.contentVersionId)) {
      toolArgs.contentId = recentDraft.contentId;
      toolArgs.contentVersionId = recentDraft.contentVersionId;
      toolArgs.platform = toolArgs.platform || recentDraft.platform;
    }
    toolResult = await executeEditorTool(env, {
      brandId: params.brandId,
      slug: params.slug,
      brandName: params.brandName,
      auth: params.auth,
      args: toolArgs,
      sessionId: params.sessionId,
      recentDraft,
    });
    if (toolResult.summary && !/要我主動發文|排/.test(reply)) {
      reply = `${reply.replace(/\s+$/, '')} ${toolResult.summary}`.trim();
    }
  }

  await appendEditorMessage(env, params.sessionId, { role: 'user', content: params.userMessage });
  await appendEditorMessage(env, params.sessionId, {
    role: 'assistant',
    content: reply,
    toolName: toolResult?.tool,
    toolPayload: toolResult,
  });
  const now = new Date().toISOString();
  return {
    reply,
    toolResult,
    messages: [
      ...history,
      {
        id: `local-user-${now}`, role: 'user', content: params.userMessage,
        toolName: null, toolPayload: null, createdAt: now,
      },
      {
        id: `local-asst-${now}`, role: 'assistant', content: reply,
        toolName: toolResult?.tool ?? null, toolPayload: toolResult ?? null, createdAt: now,
      },
    ],
  };
}

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function issueConvaiSession(
  env: Env,
  agentId: string,
): Promise<{ signedUrl?: string; conversationToken?: string }> {
  if (!env.ELEVENLABS_API_KEY) return {};
  const headers = { 'xi-api-key': env.ELEVENLABS_API_KEY };
  const [signedRes, tokenRes] = await Promise.all([
    fetch(`${ELEVENLABS_BASE}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers }),
    fetch(`${ELEVENLABS_BASE}/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, { headers }),
  ]);
  let signedUrl: string | undefined;
  let conversationToken: string | undefined;
  if (signedRes.ok) {
    const body = await signedRes.json() as { signed_url?: string };
    signedUrl = body.signed_url;
  }
  if (tokenRes.ok) {
    const body = await tokenRes.json() as { token?: string };
    conversationToken = body.token;
  }
  return { signedUrl, conversationToken };
}

export function verifyToolSecret(request: Request, env: Env): boolean {
  const secret = env.ELEVENLABS_TOOL_SECRET;
  if (!secret) return false;
  const header = request.headers.get('x-editor-tool-secret') ?? request.headers.get('X-Editor-Tool-Secret');
  return header === secret;
}
