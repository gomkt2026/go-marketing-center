import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';
import { MEETING_EMOTIONS, type MeetingEmotion } from './meeting-ai';
import { synthesizeDialogue, applyEmotionTag, DIALOGUE_CHAR_LIMIT } from './elevenlabs';
import { buildPodcastMediaKey, putMedia } from './media';

// ============================================================================
// 三小編熱門話題 Podcast
//   選題:近 3 天 market_signals(排除近期已用過的)
//   腳本:一次 LLM 呼叫生成三人來回吵鬧的完整對話稿
//   語音:逐段呼叫 ElevenLabs Text-to-Dialogue,每段一支 mp3 存 R2
// ============================================================================

/** 主持群固定順序:阿豪開場帶氣氛 → 小咪 → 阿樂 */
const HOST_BRAND_ORDER = ['taskgo', 'homigo', 'washgo'];

export interface PodcastHost {
  agentId: string;
  brandSlug: string;
  brandName: string;
  nickname: string;
  characterTitle: string;
  temperament: string;
  catchphrase: string;
  focus: string;
  canInterrupt: boolean;
  voiceId: string;
}

export interface PodcastTopic {
  signalId: string;
  title: string;
  summary: string | null;
  brandSlug: string;
  brandName: string;
}

export interface ScriptLine {
  order: number;
  segmentLabel: string; // intro | topic1 | topic2 | ... | outro
  agentId: string;
  nickname: string;
  text: string;
  emotion: MeetingEmotion;
}

/** 載入三位品牌小編(需已在 persona 設定 ElevenLabs voiceId) */
export async function getPodcastHosts(env: Env): Promise<PodcastHost[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.display_name, a.persona, b.slug AS brand_slug, b.name AS brand_name
    FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    JOIN brands b ON b.id = a.brand_id
    WHERE r.code = 'brand_ai' AND a.is_active = true AND b.is_active = true
  `;
  const hosts = (rows as { id: string; display_name: string; persona: Record<string, unknown>; brand_slug: string; brand_name: string }[])
    .map((r) => {
      const p = r.persona ?? {};
      return {
        agentId: r.id,
        brandSlug: r.brand_slug,
        brandName: r.brand_name,
        nickname: (p.nickname as string) ?? r.display_name,
        characterTitle: (p.characterTitle as string) ?? '',
        temperament: (p.temperament as string) ?? '',
        catchphrase: (p.catchphrase as string) ?? '',
        focus: (p.focus as string) ?? '',
        canInterrupt: !!p.canInterrupt || r.brand_slug === 'taskgo',
        voiceId: (p.voiceId as string) ?? '',
      };
    })
    .filter((h) => HOST_BRAND_ORDER.includes(h.brandSlug))
    .sort((a, b) => HOST_BRAND_ORDER.indexOf(a.brandSlug) - HOST_BRAND_ORDER.indexOf(b.brandSlug));

  if (hosts.length < 2) throw new Error('找不到足夠的品牌小編(需要至少 2 位 brand_ai Agent)');
  const missingVoice = hosts.filter((h) => !h.voiceId);
  if (missingVoice.length) {
    throw new Error(`小編尚未設定 ElevenLabs voiceId:${missingVoice.map((h) => h.nickname).join('、')}(請執行 db/migrations/005_podcast.sql)`);
  }
  return hosts;
}

/** 選題:近 N 天的高分情報,排除近兩週已上過節目的,並讓三品牌都有機會入選 */
export async function pickTopicsForEpisode(env: Env, days = 3, limit = 4): Promise<PodcastTopic[]> {
  const sql = getSql(env);
  const [signalRows, usedRows] = await Promise.all([
    sql`
      SELECT ms.id, ms.title, ms.summary, ms.relevance_score, b.slug AS brand_slug, b.name AS brand_name
      FROM market_signals ms
      JOIN brands b ON b.id = ms.brand_id
      WHERE ms.discovered_at > now() - ${days} * interval '1 day'
      ORDER BY ms.relevance_score DESC NULLS LAST, ms.discovered_at DESC
      LIMIT 40
    `,
    sql`
      SELECT source_signal_ids FROM podcast_episodes
      WHERE created_at > now() - interval '14 days'
    `,
  ]);

  const usedIds = new Set<string>();
  for (const row of usedRows as { source_signal_ids: unknown }[]) {
    for (const id of (row.source_signal_ids as string[]) ?? []) usedIds.add(id);
  }

  const seenTitles = new Set<string>();
  const candidates: PodcastTopic[] = [];
  for (const r of signalRows as { id: string; title: string; summary: string | null; brand_slug: string; brand_name: string }[]) {
    if (usedIds.has(r.id) || seenTitles.has(r.title)) continue;
    seenTitles.add(r.title);
    candidates.push({ signalId: r.id, title: r.title, summary: r.summary, brandSlug: r.brand_slug, brandName: r.brand_name });
  }

  // 每品牌先各取最高分一則(有跨品牌話題的多樣性),剩餘名額依全域分數補滿
  const picked: PodcastTopic[] = [];
  for (const slug of HOST_BRAND_ORDER) {
    const best = candidates.find((c) => c.brandSlug === slug && !picked.includes(c));
    if (best && picked.length < limit) picked.push(best);
  }
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

function hostIntroBlock(host: PodcastHost): string {
  const voice = getBrandVoice(host.brandSlug);
  return [
    `【${host.nickname}】(${host.characterTitle},代表品牌 ${host.brandName})`,
    `- 性格:${host.temperament}`,
    `- 口頭禪:「${host.catchphrase}」(偶爾自然地用,不要每句都講)`,
    `- 在意的立場:${host.focus}`,
    `- 行業日常:${voice.dailyConcerns}`,
    host.canInterrupt ? '- 特質:急性子,會搶話打斷別人(開頭用「等等等等!」「欸不是啊…」之類)' : '',
  ].filter(Boolean).join('\n');
}

interface RawScriptLine {
  segment: string;
  speaker: string;
  text: string;
  emotion: string;
}

interface GeneratedScript {
  title: string;
  topicSummary: string;
  script: RawScriptLine[];
}

const SCRIPT_MIN_CHARS = 1400;

/** 一次 LLM 呼叫生成整集腳本(口語、吵鬧、有來有往) */
export async function generatePodcastScript(
  env: Env,
  hosts: PodcastHost[],
  topics: PodcastTopic[],
): Promise<{ title: string; topicSummary: string; lines: ScriptLine[] }> {
  const hostByNickname = new Map(hosts.map((h) => [h.nickname, h]));
  const topicList = topics
    .map((t, i) => `${i + 1}. 【${t.title}】${t.summary ? ` ${t.summary}` : ''}(和 ${t.brandName} 的客群比較相關)`)
    .join('\n');
  const segmentLabels = ['intro', ...topics.map((_, i) => `topic${i + 1}`), 'outro'];

  const systemPrompt = [
    `你是台灣 Podcast 節目「三小編熱聊」的資深編劇。這是一檔三位品牌小編閒聊本週熱門話題的節目,每集約 10 分鐘,風格像朋友在錄音室裡邊喝飲料邊聊天打鬧。`,
    '',
    '三位主持人的人設(要嚴格照人設寫,聽眾閉著眼睛也要分得出誰在講話):',
    hosts.map(hostIntroBlock).join('\n\n'),
    '',
    '腳本鐵則:',
    '- 每個話題至少 3-5 輪來回,不是每人輪流講一句就換話題;要互相吐槽、虧對方、開玩笑,意見不合就吵一下,吵完再收斂出共識或笑著帶過',
    '- 講話要像「真人」:常用台灣人的發語詞和口頭語(欸、蛤?、哇賽、老實說、講真的、啊不然、對啦、唉唷、嗯…、就是說),偶爾句子講一半停頓(用「…」),會直接叫對方的名字回應(「小咪妳這樣講喔…」),不要每句都文法完整',
    '- 每句台詞 30-90 字,口語、快節奏、有情緒;每個人都要為自己品牌的立場講話',
    '- 阿豪是急性子,一集至少搶話打斷別人 2-3 次(開頭用「等等等等!」「欸不是啊…」「蛤?等一下啦」)',
    '- 開場(intro)三人簡短打招呼、互虧一下就切入主題,不要冗長自我介紹;結尾(outro)輕鬆總結、互相虧一句、跟聽眾說下集見',
    '- 話題之間的轉場要自然(由某個人吐槽或聯想帶到下一題),不要像念稿',
    '- 不要讀廣告、不要促銷、不要喊口號;品牌立場透過聊天自然流露',
    ANTI_AI_RULES,
  ].join('\n');

  const userPrompt = [
    `本集要聊的熱門話題(共 ${topics.length} 則,依序討論):`,
    topicList,
    '',
    `請寫出完整一集的腳本,總長度 1800-2800 字(不含 JSON 結構),分成這些段落:${segmentLabels.join(' → ')}。`,
    '回傳 JSON:',
    `{"title":"本集標題(10-20字,像 Podcast 單集標題,吸引人點開)","topicSummary":"一句話介紹本集聊了什麼","script":[{"segment":"${segmentLabels.join('|')} 擇一","speaker":"${hosts.map((h) => h.nickname).join('|')} 擇一","text":"台詞(30-90字)","emotion":"${MEETING_EMOTIONS.join('|')} 中選一個"}]}`,
  ].join('\n');

  let result = await chatCompleteJson<GeneratedScript>(env, {
    temperature: 0.95,
    maxTokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  // 太短就要求擴寫一次(使用者要的是熱鬧、有來有往的長對話)
  const totalChars = (result.script ?? []).reduce((s, l) => s + (l.text?.length ?? 0), 0);
  if (totalChars < SCRIPT_MIN_CHARS) {
    result = await chatCompleteJson<GeneratedScript>(env, {
      temperature: 0.9,
      maxTokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(result) },
        { role: 'user', content: `這集只有 ${totalChars} 字,太短了。每個話題再多加 2-3 輪來回(多一點吐槽、吵架、開玩笑),把總長度擴到 1800-2800 字,回傳同格式完整 JSON。` },
      ],
    });
  }

  const lines: ScriptLine[] = [];
  for (const raw of result.script ?? []) {
    const host = hostByNickname.get(raw.speaker?.trim());
    const text = raw.text?.trim();
    if (!host || !text) continue;
    const segment = segmentLabels.includes(raw.segment) ? raw.segment : (lines[lines.length - 1]?.segmentLabel ?? 'intro');
    const emotion = (MEETING_EMOTIONS as readonly string[]).includes(raw.emotion) ? raw.emotion as MeetingEmotion : 'neutral';
    lines.push({ order: lines.length, segmentLabel: segment, agentId: host.agentId, nickname: host.nickname, text, emotion });
  }
  if (lines.length < 10) throw new Error(`腳本生成失敗:只有 ${lines.length} 句有效台詞`);

  return { title: result.title?.trim() || '三小編熱聊', topicSummary: result.topicSummary?.trim() || '', lines };
}

/** 台灣時區的本週週一(week_of 欄位用) */
function taipeiWeekMonday(): string {
  const taipei = new Date(Date.now() + 8 * 3600 * 1000);
  const diffToMonday = (taipei.getUTCDay() + 6) % 7;
  const monday = new Date(taipei.getTime() - diffToMonday * 86400 * 1000);
  return monday.toISOString().slice(0, 10);
}

export interface CreatedEpisode {
  episodeId: string;
  title: string;
  topicCount: number;
  lineCount: number;
  totalChars: number;
}

/** 完整流程:選題 → 生成腳本 → 寫入 podcast_episodes(status=script_draft,音檔另由人工觸發) */
export async function createPodcastEpisode(env: Env): Promise<CreatedEpisode> {
  const sql = getSql(env);
  const hosts = await getPodcastHosts(env);
  const topics = await pickTopicsForEpisode(env);
  if (!topics.length) throw new Error('近 3 天沒有可用的熱門話題(market_signals 為空)');

  const { title, topicSummary, lines } = await generatePodcastScript(env, hosts, topics);

  const weekOf = taipeiWeekMonday();
  const seqRows = await sql`
    SELECT count(*)::int AS n FROM podcast_episodes WHERE week_of = ${weekOf}::date
  `;
  const episodeSeq = ((seqRows[0] as { n: number })?.n ?? 0) + 1;

  const inserted = await sql`
    INSERT INTO podcast_episodes (week_of, episode_seq, title, topic_summary, source_signal_ids, script, status)
    VALUES (
      ${weekOf}::date, ${episodeSeq}, ${title}, ${topicSummary},
      ${JSON.stringify(topics.map((t) => t.signalId))},
      ${JSON.stringify(lines)}, 'script_draft'
    ) RETURNING id
  `;
  const episodeId = (inserted[0] as { id: string }).id;
  const totalChars = lines.reduce((s, l) => s + l.text.length, 0);
  console.log(`[podcast] 已生成第 ${weekOf} 週第 ${episodeSeq} 集「${title}」:${lines.length} 句 / ${totalChars} 字`);
  return { episodeId, title, topicCount: topics.length, lineCount: lines.length, totalChars };
}

// ============================================================================
// 語音合成:把腳本切成段落 chunk,每次呼叫合成一段(控制單一請求時長)
// ============================================================================

export interface PlannedChunk {
  order: number;
  label: string;
  lines: ScriptLine[];
  charCount: number;
}

/** 依 segmentLabel 分組,再依 ElevenLabs 字數上限切塊(確定性:同腳本永遠切出同樣結果) */
export function planSegments(lines: ScriptLine[]): PlannedChunk[] {
  const groups: { label: string; lines: ScriptLine[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.label === line.segmentLabel) last.lines.push(line);
    else groups.push({ label: line.segmentLabel, lines: [line] });
  }

  const chunks: PlannedChunk[] = [];
  for (const group of groups) {
    let part: ScriptLine[] = [];
    let partChars = 0;
    let partIdx = 1;
    const flush = () => {
      if (!part.length) return;
      const label = partIdx === 1 ? group.label : `${group.label}#${partIdx}`;
      chunks.push({ order: chunks.length, label, lines: part, charCount: partChars });
      partIdx += 1;
      part = [];
      partChars = 0;
    };
    for (const line of group.lines) {
      const len = applyEmotionTag(line.text, line.emotion).length;
      if (part.length && partChars + len > DIALOGUE_CHAR_LIMIT) flush();
      part.push(line);
      partChars += len;
    }
    flush();
  }
  return chunks;
}

export interface SynthesisProgress {
  done: boolean;
  completed: number;
  total: number;
  label: string | null;
  audioUrl: string | null;
}

/**
 * 合成「下一個」還沒有音檔的段落(單次呼叫只做一段,避免單一請求跑太久)。
 * 前端/呼叫端重複呼叫直到 done=true,全部完成時把 episode 狀態改為 ready_for_review。
 */
export async function synthesizeNextSegment(env: Env, episodeId: string): Promise<SynthesisProgress> {
  const sql = getSql(env);
  const epRows = await sql`
    SELECT id, script, status FROM podcast_episodes WHERE id = ${episodeId}::uuid LIMIT 1
  `;
  if (!epRows.length) throw new Error('找不到這集節目');
  const episode = epRows[0] as { id: string; script: ScriptLine[]; status: string };
  const lines = episode.script ?? [];
  if (!lines.length) throw new Error('這集還沒有腳本');

  const hosts = await getPodcastHosts(env);
  const voiceByAgentId = new Map(hosts.map((h) => [h.agentId, h.voiceId]));

  const chunks = planSegments(lines);
  const segRows = await sql`
    SELECT segment_order, audio_url FROM podcast_segments
    WHERE episode_id = ${episodeId}::uuid AND audio_url IS NOT NULL
  `;
  const doneOrders = new Set((segRows as { segment_order: number }[]).map((r) => r.segment_order));

  const next = chunks.find((c) => !doneOrders.has(c.order));
  if (!next) {
    await sql`
      UPDATE podcast_episodes SET status = 'ready_for_review', error_message = NULL, updated_at = now()
      WHERE id = ${episodeId}::uuid
    `;
    return { done: true, completed: chunks.length, total: chunks.length, label: null, audioUrl: null };
  }

  if (episode.status !== 'audio_generating') {
    await sql`
      UPDATE podcast_episodes SET status = 'audio_generating', updated_at = now()
      WHERE id = ${episodeId}::uuid
    `;
  }

  try {
    const inputs = next.lines.map((l) => {
      const voiceId = voiceByAgentId.get(l.agentId);
      if (!voiceId) throw new Error(`台詞的小編(agent ${l.agentId})沒有 voiceId`);
      return { text: applyEmotionTag(l.text, l.emotion), voiceId };
    });
    const bytes = await synthesizeDialogue(env, { inputs });
    const key = buildPodcastMediaKey(episodeId, next.order);
    const audioUrl = await putMedia(env, key, bytes, 'audio/mpeg');

    await sql`
      INSERT INTO podcast_segments (episode_id, segment_order, label, lines, audio_url, char_count)
      VALUES (${episodeId}::uuid, ${next.order}, ${next.label}, ${JSON.stringify(next.lines)}, ${audioUrl}, ${next.charCount})
      ON CONFLICT (episode_id, segment_order)
      DO UPDATE SET label = EXCLUDED.label, lines = EXCLUDED.lines,
                    audio_url = EXCLUDED.audio_url, char_count = EXCLUDED.char_count
    `;

    const completed = doneOrders.size + 1;
    if (completed >= chunks.length) {
      await sql`
        UPDATE podcast_episodes SET status = 'ready_for_review', error_message = NULL, updated_at = now()
        WHERE id = ${episodeId}::uuid
      `;
    }
    return { done: completed >= chunks.length, completed, total: chunks.length, label: next.label, audioUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : '語音合成失敗';
    await sql`
      UPDATE podcast_episodes SET error_message = ${message}, updated_at = now()
      WHERE id = ${episodeId}::uuid
    `;
    throw e;
  }
}
