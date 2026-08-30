import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { rowToCamel } from './case';
import { buildVideoJobKey, mediaUrlToKey, putMedia, getMediaBytes, toPublicMediaUrl } from './media';
import { transcribeWithScribe, type ScribeTranscript } from './scribe';
import type { ScriptLine } from './podcast';

// ============================================================================
// 短影音編輯腦:候選 Hook、策略、EDL、edit pack、寫入 contents
// 渲染(FFmpeg)不在這裡做。
// ============================================================================

export const BRAND_SHORT_COLORS: Record<string, { name: string; color: string; nickname: string }> = {
  homigo: { name: 'Homigo', color: '#A7C18D', nickname: '小咪' },
  taskgo: { name: 'TaskGo', color: '#ED9121', nickname: '阿豪' },
  washgo: { name: 'Washgo', color: '#A87C64', nickname: '阿樂' },
};

export type VideoSourceType = 'podcast_clip' | 'upload';
export type VideoJobStatus =
  | 'analyzing' | 'strategy_review' | 'rendering_preview'
  | 'preview_review' | 'rendering_final' | 'ready' | 'rejected';

export interface ClipCandidate {
  id: string;
  hook: string;
  title: string;
  summary: string;
  strategy: string;
  estimatedSeconds: number;
  startLineOrder: number;
  endLineOrder: number;
  speakers: string[];
  cta: string;
  brandSlug: string | null;
}

export interface VideoStrategy {
  candidateId: string;
  title: string;
  hook: string;
  narrative: string;
  estimatedSeconds: number;
  subtitleStyle: 'large' | 'standard';
  cta: string;
  brandSlug: string | null;
}

export interface EdlChunkLine {
  order: number;
  text: string;
}

export interface EdlSegment {
  id: string;
  sourceKey: string | null;
  sourceUrl: string | null;
  startMs: number;
  endMs: number;
  speaker: string;
  brandSlug: string | null;
  text: string;
  fadeInMs: number;
  fadeOutMs: number;
  /** 同一支來源音檔裡的全部台詞,渲染時用來依字數比例對齊真實音檔 */
  chunkLines?: EdlChunkLine[];
}

export interface EditPack {
  version: 1;
  jobId: string;
  sourceType: VideoSourceType;
  title: string;
  cta: string;
  aspect: '9:16';
  preview: { width: 720; height: 1280 };
  final: { width: 1080; height: 1920 };
  fonts: { regular: string; bold: string };
  brands: Record<string, { color: string; name: string }>;
  hosts: { nickname: string; brandSlug: string; avatarUrl: string | null; color: string }[];
  coverUrl: string | null;
  edl: EdlSegment[];
  srt: string;
  strategy: VideoStrategy;
}

export interface VideoJobRow {
  id: string;
  sourceType: VideoSourceType;
  status: VideoJobStatus;
  brandId: string | null;
  podcastEpisodeId: string | null;
  contentId: string | null;
  title: string | null;
  sourceMediaKey: string | null;
  sourceMediaUrl: string | null;
  consentScribe: boolean;
  candidates: ClipCandidate[];
  selectedCandidateId: string | null;
  strategy: VideoStrategy | null;
  transcript: unknown;
  edl: EdlSegment[] | null;
  srt: string | null;
  editPack: EditPack | null;
  previewUrl: string | null;
  finalUrl: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  episodeTitle?: string | null;
  brandSlug?: string | null;
}

const CHARS_PER_SEC = 4.2;
const TARGET_SECONDS = 30;
const FADE_MS = 30;

/** 模型有時把 speakers 回成「阿豪、小咪」字串,統一收成字串陣列 */
export function normalizeSpeakers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((s) => String(s ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCandidate(c: Partial<ClipCandidate> & { speakers?: unknown }, index: number): ClipCandidate {
  const speakers = normalizeSpeakers(c.speakers);
  return {
    id: c.id || `c${index + 1}`,
    hook: String(c.hook ?? ''),
    title: String(c.title ?? ''),
    summary: String(c.summary ?? ''),
    strategy: String(c.strategy ?? ''),
    estimatedSeconds: Math.max(20, Math.min(40, Math.round(Number(c.estimatedSeconds) || TARGET_SECONDS))),
    startLineOrder: Number(c.startLineOrder) || 0,
    endLineOrder: Number(c.endLineOrder) || 0,
    speakers,
    cta: String(c.cta || '聽完整集《三小編熱聊》'),
    brandSlug: c.brandSlug ?? null,
  };
}

export function mapVideoJob(row: Record<string, unknown>): VideoJobRow {
  const job = rowToCamel<VideoJobRow>(row);
  const rawCandidates = Array.isArray(job.candidates) ? job.candidates : [];
  return {
    ...job,
    candidates: rawCandidates.map((c, i) => normalizeCandidate(c, i)),
    strategy: (job.strategy ?? null) as VideoStrategy | null,
    edl: (job.edl ?? null) as EdlSegment[] | null,
    editPack: (job.editPack ?? null) as EditPack | null,
  };
}

export async function getVideoJob(env: Env, id: string): Promise<VideoJobRow | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT v.*, e.title AS episode_title, b.slug AS brand_slug
    FROM video_jobs v
    LEFT JOIN podcast_episodes e ON e.id = v.podcast_episode_id
    LEFT JOIN brands b ON b.id = v.brand_id
    WHERE v.id = ${id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapVideoJob(rows[0] as Record<string, unknown>);
}

export async function listVideoJobs(
  env: Env,
  params: { brandId?: string; episodeId?: string; limit?: number },
): Promise<VideoJobRow[]> {
  const sql = getSql(env);
  const limit = params.limit ?? 40;
  const rows = params.episodeId
    ? await sql`
        SELECT v.*, e.title AS episode_title, b.slug AS brand_slug
        FROM video_jobs v
        LEFT JOIN podcast_episodes e ON e.id = v.podcast_episode_id
        LEFT JOIN brands b ON b.id = v.brand_id
        WHERE v.podcast_episode_id = ${params.episodeId}::uuid
        ORDER BY v.created_at DESC LIMIT ${limit}
      `
    : params.brandId
      ? await sql`
          SELECT v.*, e.title AS episode_title, b.slug AS brand_slug
          FROM video_jobs v
          LEFT JOIN podcast_episodes e ON e.id = v.podcast_episode_id
          LEFT JOIN brands b ON b.id = v.brand_id
          WHERE v.brand_id = ${params.brandId}::uuid
          ORDER BY v.created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT v.*, e.title AS episode_title, b.slug AS brand_slug
          FROM video_jobs v
          LEFT JOIN podcast_episodes e ON e.id = v.podcast_episode_id
          LEFT JOIN brands b ON b.id = v.brand_id
          ORDER BY v.created_at DESC LIMIT ${limit}
        `;
  return (rows as Record<string, unknown>[]).map(mapVideoJob);
}

interface HostInfo {
  agentId: string;
  nickname: string;
  brandSlug: string;
  avatarUrl: string | null;
  color: string;
}

async function loadHosts(env: Env): Promise<HostInfo[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.persona->>'nickname' AS nickname, a.persona->>'avatarUrl' AS avatar_url,
           a.avatar_color, b.slug AS brand_slug
    FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    JOIN brands b ON b.id = a.brand_id
    WHERE r.code = 'brand_ai' AND a.is_active = true
  `;
  return (rows as {
    id: string; nickname: string | null; avatar_url: string | null;
    avatar_color: string | null; brand_slug: string;
  }[]).map((r) => ({
    agentId: r.id,
    nickname: r.nickname ?? BRAND_SHORT_COLORS[r.brand_slug]?.nickname ?? r.brand_slug,
    brandSlug: r.brand_slug,
    avatarUrl: r.avatar_url,
    color: r.avatar_color ?? BRAND_SHORT_COLORS[r.brand_slug]?.color ?? '#888888',
  }));
}

function estimateLineDurationMs(text: string): number {
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1200, Math.round((chars / CHARS_PER_SEC) * 1000));
}

function pickBrandFromSpeakers(speakers: string[], hosts: HostInfo[]): string | null {
  const counts = new Map<string, number>();
  for (const name of speakers) {
    const host = hosts.find((h) => h.nickname === name);
    if (host) counts.set(host.brandSlug, (counts.get(host.brandSlug) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [slug, c] of counts) {
    if (c > n) { best = slug; n = c; }
  }
  return best;
}

export async function proposePodcastClips(
  env: Env,
  params: { episodeId: string; consentScribe: boolean; createdBy: string },
): Promise<VideoJobRow> {
  const sql = getSql(env);
  const epRows = await sql`
    SELECT id, title, topic_summary, status, script
    FROM podcast_episodes WHERE id = ${params.episodeId}::uuid LIMIT 1
  `;
  if (!epRows.length) throw new Error('找不到這集節目');
  const episode = epRows[0] as {
    id: string; title: string | null; topic_summary: string | null;
    status: string; script: ScriptLine[];
  };
  if (episode.status !== 'approved') {
    throw new Error('只有已核准的集數才能切短影音');
  }
  const script = episode.script ?? [];
  if (script.length < 4) throw new Error('逐字稿太短,無法切 30 秒');

  const hosts = await loadHosts(env);
  const linesForLlm = script.map((l) => ({
    order: l.order,
    speaker: l.nickname,
    text: l.text,
    segment: l.segmentLabel,
  }));

  const proposed = await chatCompleteJson<{ candidates: Omit<ClipCandidate, 'id' | 'brandSlug'>[] }>(env, {
    messages: [
      {
        role: 'system',
        content:
          '你是《三小編熱聊》短影音編輯。從完整逐字稿找出 2–4 段可獨立成立的 30 秒精華。' +
          '每段要有 Hook(前 3 秒)、主線、可刪的開場/客套不要。繁體中文。' +
          'strategy 寫 4–8 句白話:受眾、為什麼這段能停滑、節奏、字幕方向、結尾 CTA。' +
          'startLineOrder / endLineOrder 必須是稿上的 order,且估時 26–32 秒。' +
          'cta 用「聽完整集《三小編熱聊》」或跟最相關品牌的一句話。' +
          'speakers 必須是字串陣列,例如 ["阿豪","小咪"],不要回傳單一字串。',
      },
      {
        role: 'user',
        content:
          `節目:${episode.title ?? '未命名'}\n摘要:${episode.topic_summary ?? ''}\n\n` +
          `逐字稿 JSON:\n${JSON.stringify(linesForLlm)}\n\n` +
          '回傳 JSON:{"candidates":[{hook,title,summary,strategy,estimatedSeconds,startLineOrder,endLineOrder,speakers,cta}]}',
      },
    ],
    temperature: 0.6,
    maxTokens: 2500,
  });

  const candidates: ClipCandidate[] = (proposed.candidates ?? []).slice(0, 4).map((c, i) => {
    const next = normalizeCandidate(c, i);
    return { ...next, brandSlug: pickBrandFromSpeakers(next.speakers, hosts) };
  });
  if (!candidates.length) throw new Error('模型沒有產出可用的短影音候選');

  let transcript: ScribeTranscript | null = null;
  if (params.consentScribe) {
    transcript = await maybeScribeEpisode(env, params.episodeId);
  }

  const brandSlug = candidates[0].brandSlug;
  const brandRows = brandSlug
    ? await sql`SELECT id FROM brands WHERE slug = ${brandSlug} LIMIT 1`
    : [];
  const brandId = brandRows.length ? (brandRows[0] as { id: string }).id : null;

  const inserted = await sql`
    INSERT INTO video_jobs (
      source_type, status, brand_id, podcast_episode_id, title,
      consent_scribe, candidates, transcript, created_by
    ) VALUES (
      'podcast_clip', 'strategy_review', ${brandId}, ${params.episodeId}::uuid,
      ${episode.title ?? 'Podcast 短影音'},
      ${params.consentScribe}, ${JSON.stringify(candidates)}::jsonb,
      ${transcript ? JSON.stringify(transcript) : null}::jsonb,
      ${params.createdBy}::uuid
    )
    RETURNING *
  `;
  return mapVideoJob(inserted[0] as Record<string, unknown>);
}

async function maybeScribeEpisode(env: Env, episodeId: string): Promise<ScribeTranscript | null> {
  const sql = getSql(env);
  const segs = await sql`
    SELECT audio_url, segment_order FROM podcast_segments
    WHERE episode_id = ${episodeId}::uuid AND audio_url IS NOT NULL
    ORDER BY segment_order
    LIMIT 3
  `;
  if (!segs.length) return null;
  const first = segs[0] as { audio_url: string };
  const key = mediaUrlToKey(first.audio_url);
  if (!key) return null;
  const bytes = await getMediaBytes(env, key);
  if (!bytes) return null;
  return transcribeWithScribe(env, {
    fileBytes: bytes,
    fileName: `${episodeId}-seg.mp3`,
    mimeType: 'audio/mpeg',
    languageCode: 'zho',
  });
}

export async function approveStrategy(
  env: Env,
  params: {
    jobId: string;
    candidateId: string;
    title?: string;
    cta?: string;
    subtitleStyle?: 'large' | 'standard';
  },
): Promise<VideoJobRow> {
  const job = await getVideoJob(env, params.jobId);
  if (!job) throw new Error('找不到短影音工作');
  if (job.status !== 'strategy_review' && job.status !== 'preview_review') {
    throw new Error('目前狀態不能核准策略');
  }
  const candidate = job.candidates.find((c) => c.id === params.candidateId);
  if (!candidate) throw new Error('找不到這個候選');

  const strategy: VideoStrategy = {
    candidateId: candidate.id,
    title: (params.title ?? candidate.title).trim(),
    hook: candidate.hook,
    narrative: candidate.strategy,
    estimatedSeconds: candidate.estimatedSeconds,
    subtitleStyle: params.subtitleStyle ?? 'large',
    cta: (params.cta ?? candidate.cta).trim(),
    brandSlug: candidate.brandSlug,
  };

  const { edl, srt, pack } = await buildEditArtifacts(env, job, strategy, candidate);

  const packKey = buildVideoJobKey(job.id, 'edit/pack.json');
  const packUrl = await putMedia(
    env,
    packKey,
    new TextEncoder().encode(JSON.stringify(pack, null, 2)),
    'application/json',
  );
  const srtKey = buildVideoJobKey(job.id, 'edit/master.srt');
  await putMedia(env, srtKey, new TextEncoder().encode(srt), 'text/plain; charset=utf-8');
  const edlKey = buildVideoJobKey(job.id, 'edit/edl.json');
  await putMedia(env, edlKey, new TextEncoder().encode(JSON.stringify(edl, null, 2)), 'application/json');
  const projectMd = [
    `# ${strategy.title}`,
    '',
    `job: ${job.id}`,
    `source: ${job.sourceType}`,
    '',
    '## 策略',
    strategy.narrative,
    '',
    `CTA: ${strategy.cta}`,
    `預估: ${strategy.estimatedSeconds}s`,
    '',
    `edit pack: ${packUrl}`,
  ].join('\n');
  await putMedia(env, buildVideoJobKey(job.id, 'edit/project.md'), new TextEncoder().encode(projectMd), 'text/markdown');

  const sql = getSql(env);
  const brandRows = strategy.brandSlug
    ? await sql`SELECT id FROM brands WHERE slug = ${strategy.brandSlug} LIMIT 1`
    : [];
  const brandId = brandRows.length ? (brandRows[0] as { id: string }).id : job.brandId;

  const updated = await sql`
    UPDATE video_jobs SET
      status = 'rendering_preview',
      selected_candidate_id = ${candidate.id},
      strategy = ${JSON.stringify(strategy)}::jsonb,
      edl = ${JSON.stringify(edl)}::jsonb,
      srt = ${srt},
      edit_pack = ${JSON.stringify(pack)}::jsonb,
      title = ${strategy.title},
      brand_id = ${brandId},
      error_message = NULL,
      updated_at = now()
    WHERE id = ${job.id}::uuid
    RETURNING *
  `;
  return mapVideoJob(updated[0] as Record<string, unknown>);
}

async function buildEditArtifacts(
  env: Env,
  job: VideoJobRow,
  strategy: VideoStrategy,
  candidate: ClipCandidate,
): Promise<{ edl: EdlSegment[]; srt: string; pack: EditPack }> {
  const hosts = await loadHosts(env);
  const sql = getSql(env);

  let edl: EdlSegment[];
  if (job.sourceType === 'podcast_clip' && job.podcastEpisodeId) {
    const epRows = await sql`
      SELECT script FROM podcast_episodes WHERE id = ${job.podcastEpisodeId}::uuid LIMIT 1
    `;
    const script = (epRows[0] as { script: ScriptLine[] } | undefined)?.script ?? [];
    const segs = await sql`
      SELECT audio_url, label, lines, segment_order
      FROM podcast_segments
      WHERE episode_id = ${job.podcastEpisodeId}::uuid
      ORDER BY segment_order
    `;
    edl = buildPodcastEdl(script, segs as {
      audio_url: string | null; label: string; lines: ScriptLine[]; segment_order: number;
    }[], candidate, hosts);
  } else {
    edl = buildUploadEdl(job, strategy);
  }

  edl = edl.map((seg) => ({
    ...seg,
    sourceUrl: toPublicMediaUrl(env, seg.sourceUrl) ?? seg.sourceUrl,
  }));
  const srt = edlToSrt(edl);
  const pack: EditPack = {
    version: 1,
    jobId: job.id,
    sourceType: job.sourceType,
    title: strategy.title,
    cta: strategy.cta,
    aspect: '9:16',
    preview: { width: 720, height: 1280 },
    final: { width: 1080, height: 1920 },
    fonts: {
      regular: 'podcast-assets/fonts/SourceHanSansTW-Regular.otf',
      bold: 'podcast-assets/fonts/SourceHanSansTW-Bold.otf',
    },
    brands: Object.fromEntries(
      Object.entries(BRAND_SHORT_COLORS).map(([slug, v]) => [slug, { color: v.color, name: v.name }]),
    ),
    hosts: hosts.map((h) => ({
      nickname: h.nickname,
      brandSlug: h.brandSlug,
      avatarUrl: toPublicMediaUrl(env, h.avatarUrl) ?? h.avatarUrl,
      color: h.color,
    })),
    coverUrl: null,
    edl,
    srt,
    strategy,
  };
  return { edl, srt, pack };
}

function buildPodcastEdl(
  script: ScriptLine[],
  segments: { audio_url: string | null; label: string; lines: ScriptLine[]; segment_order: number }[],
  candidate: ClipCandidate,
  hosts: HostInfo[],
): EdlSegment[] {
  const picked = script.filter(
    (l) => l.order >= candidate.startLineOrder && l.order <= candidate.endLineOrder,
  );
  if (!picked.length) throw new Error('候選的逐字稿範圍是空的');

  const edl: EdlSegment[] = [];
  for (const line of picked) {
    const host = hosts.find((h) => h.agentId === line.agentId || h.nickname === line.nickname);
    const seg = segments.find((s) =>
      (s.lines ?? []).some((x) => x.order === line.order) || s.label === line.segmentLabel,
    );
    const chunkLines = (seg?.lines ?? [])
      .map((x) => ({ order: x.order, text: x.text }))
      .filter((x) => x.text);
    const siblings = chunkLines.length
      ? chunkLines
      : [{ order: line.order, text: line.text }];
    let startMs = 0;
    for (const prev of siblings) {
      if (prev.order === line.order) break;
      startMs += estimateLineDurationMs(prev.text);
    }
    const dur = estimateLineDurationMs(line.text);
    edl.push({
      id: `l${line.order}`,
      sourceKey: mediaUrlToKey(seg?.audio_url ?? null),
      sourceUrl: seg?.audio_url ?? null, // 寫 pack 時再轉公開 URL
      startMs,
      endMs: startMs + dur,
      speaker: line.nickname,
      brandSlug: host?.brandSlug ?? null,
      text: line.text,
      fadeInMs: FADE_MS,
      fadeOutMs: FADE_MS,
      chunkLines: siblings,
    });
  }

  // 超過 32 秒就從尾端裁到約 30 秒(保留完整句)
  const maxMs = 32_000;
  const spanMs = (seg: EdlSegment) => Math.max(0, seg.endMs - seg.startMs);
  while (edl.length > 1 && edl.reduce((n, seg) => n + spanMs(seg), 0) > maxMs) {
    edl.pop();
  }
  return edl;
}

function buildUploadEdl(job: VideoJobRow, strategy: VideoStrategy): EdlSegment[] {
  const words = (job.transcript as ScribeTranscript | null)?.words?.filter((w) => w.type === 'word') ?? [];
  if (!words.length) {
    const dur = (strategy.estimatedSeconds || TARGET_SECONDS) * 1000;
    return [{
      id: 'full',
      sourceKey: job.sourceMediaKey,
      sourceUrl: job.sourceMediaUrl,
      startMs: 0,
      endMs: dur,
      speaker: '',
      brandSlug: strategy.brandSlug,
      text: strategy.hook,
      fadeInMs: FADE_MS,
      fadeOutMs: FADE_MS,
    }];
  }

  const total = words[words.length - 1].end;
  const window = strategy.estimatedSeconds || TARGET_SECONDS;
  let bestStart = 0;
  let bestScore = -1;
  const step = 1;
  for (let t = 0; t <= Math.max(0, total - window); t += step) {
    const slice = words.filter((w) => w.start >= t && w.end <= t + window);
    const score = slice.reduce((n, w) => n + w.text.length, 0);
    if (score > bestScore) { bestScore = score; bestStart = t; }
  }
  const slice = words.filter((w) => w.start >= bestStart && w.end <= bestStart + window);
  const chunks: EdlSegment[] = [];
  let buf: ScribeTranscript['words'] = [];
  const flush = () => {
    if (!buf.length) return;
    chunks.push({
      id: `w${chunks.length + 1}`,
      sourceKey: job.sourceMediaKey,
      sourceUrl: job.sourceMediaUrl,
      startMs: Math.round(buf[0].start * 1000),
      endMs: Math.round(buf[buf.length - 1].end * 1000),
      speaker: buf[0].speakerId ?? '',
      brandSlug: strategy.brandSlug,
      text: buf.map((w) => w.text).join(''),
      fadeInMs: FADE_MS,
      fadeOutMs: FADE_MS,
    });
    buf = [];
  };
  for (const w of slice) {
    buf.push(w);
    const text = buf.map((x) => x.text).join('');
    if (text.length >= 16 || /[。！？!?]/.test(w.text)) flush();
  }
  flush();
  return chunks.length ? chunks : [{
    id: 'win',
    sourceKey: job.sourceMediaKey,
    sourceUrl: job.sourceMediaUrl,
    startMs: Math.round(bestStart * 1000),
    endMs: Math.round((bestStart + window) * 1000),
    speaker: '',
    brandSlug: strategy.brandSlug,
    text: strategy.hook,
    fadeInMs: FADE_MS,
    fadeOutMs: FADE_MS,
  }];
}

function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const frac = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(frac, 3)}`;
}

export function edlToSrt(edl: EdlSegment[]): string {
  let cursor = 0;
  let index = 0;
  const blocks: string[] = [];
  for (const seg of edl) {
    const phrases = splitPhrases(seg.text);
    const totalChars = phrases.reduce((n, p) => n + p.replace(/\s+/g, '').length, 0) || 1;
    const segDur = Math.max(300, seg.endMs - seg.startMs);
    for (const phrase of phrases) {
      const chars = phrase.replace(/\s+/g, '').length || 1;
      const dur = Math.max(400, Math.round(segDur * (chars / totalChars)));
      index += 1;
      blocks.push(
        `${index}\n${formatSrtTime(cursor)} --> ${formatSrtTime(cursor + dur)}\n${wrapSubtitle(phrase)}\n`,
      );
      cursor += dur;
    }
  }
  return blocks.join('\n');
}

function splitPhrases(text: string): string[] {
  const raw = (text || '').replace(/\s+/g, '').trim();
  if (!raw) return [' '];
  const parts = raw.split(/(?<=[！？。!?，,；;…])/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length <= 18) out.push(part);
    else {
      for (let i = 0; i < part.length; i += 14) out.push(part.slice(i, i + 14));
    }
  }
  return out.length ? out : [raw];
}

function wrapSubtitle(text: string, max = 14): string {
  const clean = text.replace(/\s+/g, '');
  if (!clean) return ' ';
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += max) lines.push(clean.slice(i, i + max));
  return lines.join('\n');
}

export async function adjustVideoJob(
  env: Env,
  params: { jobId: string; action: 'retitle' | 'cta' | 'subtitle_large' | 'subtitle_standard' | 'pick_candidate'; value?: string },
): Promise<VideoJobRow> {
  const job = await getVideoJob(env, params.jobId);
  if (!job) throw new Error('找不到短影音工作');
  if (!['strategy_review', 'preview_review', 'rendering_preview'].includes(job.status)) {
    throw new Error('目前狀態不能微調');
  }

  if (params.action === 'pick_candidate') {
    if (!params.value) throw new Error('請指定候選 id');
    return approveStrategy(env, { jobId: job.id, candidateId: params.value });
  }

  const candidate = job.candidates.find((c) => c.id === (job.selectedCandidateId ?? job.candidates[0]?.id));
  if (!candidate) throw new Error('沒有可微調的候選');

  if (params.action === 'retitle') {
    if (!params.value?.trim()) throw new Error('請提供新標題');
    return approveStrategy(env, {
      jobId: job.id,
      candidateId: candidate.id,
      title: params.value.trim(),
      cta: job.strategy?.cta,
      subtitleStyle: job.strategy?.subtitleStyle,
    });
  }
  if (params.action === 'cta') {
    if (!params.value?.trim()) throw new Error('請提供 CTA');
    return approveStrategy(env, {
      jobId: job.id,
      candidateId: candidate.id,
      title: job.strategy?.title,
      cta: params.value.trim(),
      subtitleStyle: job.strategy?.subtitleStyle,
    });
  }
  return approveStrategy(env, {
    jobId: job.id,
    candidateId: candidate.id,
    title: job.strategy?.title,
    cta: job.strategy?.cta,
    subtitleStyle: params.action === 'subtitle_large' ? 'large' : 'standard',
  });
}

export async function saveRenderResult(
  env: Env,
  params: { jobId: string; kind: 'preview' | 'final'; bytes: Uint8Array; contentType?: string },
): Promise<VideoJobRow> {
  const job = await getVideoJob(env, params.jobId);
  if (!job) throw new Error('找不到短影音工作');
  const filename = params.kind === 'preview' ? 'preview.mp4' : 'final.mp4';
  const key = buildVideoJobKey(job.id, filename);
  const url = await putMedia(env, key, params.bytes, params.contentType ?? 'video/mp4');
  const sql = getSql(env);

  if (params.kind === 'preview') {
    const updated = await sql`
      UPDATE video_jobs SET
        preview_url = ${url},
        status = 'preview_review',
        error_message = NULL,
        updated_at = now()
      WHERE id = ${job.id}::uuid
      RETURNING *
    `;
    return mapVideoJob(updated[0] as Record<string, unknown>);
  }

  if (job.status !== 'rendering_final' && job.status !== 'preview_review' && job.status !== 'ready') {
    throw new Error('預覽尚未核准,不能上傳正式檔');
  }
  const updated = await sql`
    UPDATE video_jobs SET
      final_url = ${url},
      status = 'ready',
      error_message = NULL,
      updated_at = now()
    WHERE id = ${job.id}::uuid
    RETURNING *
  `;
  return mapVideoJob(updated[0] as Record<string, unknown>);
}

export async function approvePreview(env: Env, jobId: string): Promise<VideoJobRow> {
  const job = await getVideoJob(env, jobId);
  if (!job) throw new Error('找不到短影音工作');
  if (job.status !== 'preview_review') throw new Error('請先上傳並檢查 720p 預覽');
  if (!job.previewUrl) throw new Error('還沒有預覽檔');
  const sql = getSql(env);
  const updated = await sql`
    UPDATE video_jobs SET status = 'rendering_final', error_message = NULL, updated_at = now()
    WHERE id = ${jobId}::uuid
    RETURNING *
  `;
  return mapVideoJob(updated[0] as Record<string, unknown>);
}

export async function rejectVideoJob(env: Env, jobId: string, reason?: string): Promise<VideoJobRow> {
  const sql = getSql(env);
  const updated = await sql`
    UPDATE video_jobs SET
      status = 'rejected',
      error_message = ${reason ?? '已打回'},
      updated_at = now()
    WHERE id = ${jobId}::uuid
    RETURNING *
  `;
  if (!updated.length) throw new Error('找不到短影音工作');
  return mapVideoJob(updated[0] as Record<string, unknown>);
}

export async function createUploadJob(
  env: Env,
  params: {
    brandId: string;
    createdBy: string;
    fileBytes: Uint8Array;
    fileName: string;
    mimeType: string;
    consentScribe: boolean;
  },
): Promise<VideoJobRow> {
  const sql = getSql(env);
  const ext = params.fileName.split('.').pop()?.toLowerCase() || 'mp4';
  const tempId = crypto.randomUUID();
  const key = buildVideoJobKey(tempId, `source.${ext}`);
  const url = await putMedia(env, key, params.fileBytes, params.mimeType);

  let transcript: ScribeTranscript | null = null;
  let candidates: ClipCandidate[] = [];
  let status: VideoJobStatus = 'strategy_review';
  let errorMessage: string | null = null;

  if (params.consentScribe) {
    try {
      transcript = await transcribeWithScribe(env, {
        fileBytes: params.fileBytes,
        fileName: params.fileName,
        mimeType: params.mimeType,
        languageCode: 'zho',
      });
      candidates = await proposeFromTranscript(env, transcript);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : '轉寫失敗';
      status = 'strategy_review';
      candidates = [{
        id: 'c1',
        hook: '這段實拍的前 30 秒',
        title: params.fileName.replace(/\.[^.]+$/, ''),
        summary: '轉寫未完成,先用片頭 30 秒當候選,可之後重跑。',
        strategy: '先出一支 30 秒直式精華。開頭用畫面張力當 Hook,字幕放大金句,結尾跟品牌。',
        estimatedSeconds: TARGET_SECONDS,
        startLineOrder: 0,
        endLineOrder: 0,
        speakers: [],
        cta: '追蹤我們看完整過程',
        brandSlug: null,
      }];
    }
  } else {
    candidates = [{
      id: 'c1',
      hook: '未轉寫：使用片頭 30 秒',
      title: params.fileName.replace(/\.[^.]+$/, ''),
      summary: '你尚未同意上傳 ElevenLabs。將先用開頭 30 秒當候選。',
      strategy: '在未轉寫前提下,先切片頭 30 秒直式。核准後可再同意 Scribe 重找 Hook。',
      estimatedSeconds: TARGET_SECONDS,
      startLineOrder: 0,
      endLineOrder: 0,
      speakers: [],
      cta: '追蹤我們看完整過程',
      brandSlug: null,
    }];
  }

  const inserted = await sql`
    INSERT INTO video_jobs (
      id, source_type, status, brand_id, title, source_media_key, source_media_url,
      consent_scribe, candidates, transcript, error_message, created_by
    ) VALUES (
      ${tempId}::uuid, 'upload', ${status}::video_job_status, ${params.brandId}::uuid,
      ${params.fileName.replace(/\.[^.]+$/, '')}, ${key}, ${url},
      ${params.consentScribe}, ${JSON.stringify(candidates)}::jsonb,
      ${transcript ? JSON.stringify(transcript) : null}::jsonb,
      ${errorMessage}, ${params.createdBy}::uuid
    )
    RETURNING *
  `;
  return mapVideoJob(inserted[0] as Record<string, unknown>);
}

async function proposeFromTranscript(env: Env, transcript: ScribeTranscript): Promise<ClipCandidate[]> {
  const text = transcript.text.slice(0, 8000);
  const proposed = await chatCompleteJson<{ candidates: Omit<ClipCandidate, 'id' | 'brandSlug'>[] }>(env, {
    messages: [
      {
        role: 'system',
        content:
          '你是短影音編輯。從逐字稿找出 2–4 段 30 秒精華。繁體中文。' +
          'strategy 寫 4–8 句白話。estimatedSeconds 26–32。startLineOrder/endLineOrder 可填 0。',
      },
      {
        role: 'user',
        content: `逐字稿:\n${text}\n\n回傳 JSON:{"candidates":[{hook,title,summary,strategy,estimatedSeconds,startLineOrder,endLineOrder,speakers,cta}]}`,
      },
    ],
    temperature: 0.6,
    maxTokens: 2000,
  });
  return (proposed.candidates ?? []).slice(0, 4).map((c, i) => ({
    id: `c${i + 1}`,
    hook: c.hook,
    title: c.title,
    summary: c.summary,
    strategy: c.strategy,
    estimatedSeconds: Math.max(20, Math.min(40, Math.round(c.estimatedSeconds || TARGET_SECONDS))),
    startLineOrder: c.startLineOrder ?? 0,
    endLineOrder: c.endLineOrder ?? 0,
    speakers: normalizeSpeakers(c.speakers),
    cta: c.cta || '追蹤我們看下一段',
    brandSlug: null,
  }));
}

export async function promoteVideoJobToContent(
  env: Env,
  params: { jobId: string; platform: 'instagram' | 'threads' | 'facebook'; createdBy: string },
): Promise<{ contentId: string; job: VideoJobRow }> {
  const job = await getVideoJob(env, params.jobId);
  if (!job) throw new Error('找不到短影音工作');
  if (job.status !== 'ready' || !job.finalUrl) throw new Error('正式檔尚未就緒');
  if (!job.brandId) throw new Error('這支短影音尚未指定品牌,無法寫入內容中心');

  const sql = getSql(env);
  if (job.contentId) return { contentId: job.contentId, job };

  const body = [
    job.strategy?.hook ?? job.title ?? '',
    '',
    job.strategy?.cta ?? '',
  ].filter(Boolean).join('\n');
  const hashtags = ['三小編熱聊', '短影音'];

  const contentRows = await sql`
    INSERT INTO contents (
      brand_id, content_type, target_platform, title, status, generation_prompt_meta
    ) VALUES (
      ${job.brandId}::uuid, 'video', ${params.platform},
      ${job.title ?? '短影音'}, 'pending_review',
      ${JSON.stringify({ source: 'video_job', videoJobId: job.id, sourceType: job.sourceType })}::jsonb
    )
    RETURNING id
  `;
  const contentId = (contentRows[0] as { id: string }).id;
  const versionRows = await sql`
    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
    VALUES (
      ${contentId}::uuid, 1, ${body},
      ${JSON.stringify(hashtags)}::jsonb,
      ${job.strategy?.cta ?? ''}
    )
    RETURNING id
  `;
  const versionId = (versionRows[0] as { id: string }).id;
  await sql`
    INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
    VALUES (
      ${versionId}::uuid, 'video', ${job.finalUrl},
      ${JSON.stringify({ videoJobId: job.id, previewUrl: job.previewUrl, durationHint: job.strategy?.estimatedSeconds })}::jsonb
    )
  `;
  const updated = await sql`
    UPDATE video_jobs SET content_id = ${contentId}::uuid, updated_at = now()
    WHERE id = ${job.id}::uuid
    RETURNING *
  `;
  return { contentId, job: mapVideoJob(updated[0] as Record<string, unknown>) };
}

export function publicVideoUrls(env: Env, job: VideoJobRow) {
  return {
    previewUrl: toPublicMediaUrl(env, job.previewUrl),
    finalUrl: toPublicMediaUrl(env, job.finalUrl),
    sourceMediaUrl: toPublicMediaUrl(env, job.sourceMediaUrl),
  };
}
