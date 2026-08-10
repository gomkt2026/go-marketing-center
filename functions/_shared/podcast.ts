import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';
import { MEETING_EMOTIONS, type MeetingEmotion } from './meeting-ai';
import { synthesizeDialogue, applyEmotionTag, cloneVoice, DIALOGUE_CHAR_LIMIT } from './elevenlabs';
import { buildPodcastMediaKey, buildGuestVoiceKey, putMedia } from './media';

// ============================================================================
// 三小編熱門話題 Podcast
//   選題:近 3 天 market_signals(排除近期已用過的)
//   腳本:一次 LLM 呼叫生成三人來回吵鬧的完整對話稿
//   語音:逐段呼叫 ElevenLabs Text-to-Dialogue,每段一支 mp3 存 R2
// ============================================================================

/** 主持群固定順序:阿豪開場帶氣氛 → 小咪 → 阿樂 */
const HOST_BRAND_ORDER = ['taskgo', 'homigo', 'washgo'];

/** 每集固定的開場自我介紹台詞(依 HOST_BRAND_ORDER 順序播,第一位多一句節目開場) */
const SHOW_OPENING = '哈囉哈囉~歡迎收聽《三小編熱聊》!一週兩集,三個小編陪你聊最近最熱的話題!';
const FIXED_SELF_INTROS: Record<string, string> = {
  taskgo: '我是 Taskgo 的阿豪!裝潢、修繕、找工班,大小工程交給 Taskgo,報價透明不踩雷!',
  homigo: '大家好~我是 Homigo 的小咪!租屋、收租、包租代管,把租屋大小事整理回同一個地方,房東房客都安心!',
  washgo: '哈囉!我是 Washgo 的阿樂!衣服棉被送洗、收送到府,髒衣服交給我,你只管當個乾淨的人~',
};

/** 各品牌可以在節目中自然帶到的系統優勢(給編劇當「業配」素材) */
const SERVICE_PITCHES: Record<string, string> = {
  taskgo: '裝修媒合平台:幫屋主找到可靠工班、報價透明、進度看得到,避免被亂報價或工程爛尾',
  homigo: '包租代管/租屋管理:合約、租金、修繕紀錄整理在同一個地方,房東不用自己追,房客有問題找得到人',
  washgo: '洗衣送洗服務:線上預約、收送到府,換季棉被床單、名牌衣物都有專業處理,省時間又不怕洗壞',
};

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

/** 選題:近 N 天的高分情報,排除近兩週已上過節目的,並讓三品牌都有機會入選(2-3 題深聊) */
export async function pickTopicsForEpisode(env: Env, days = 3, limit = 3): Promise<PodcastTopic[]> {
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
    SERVICE_PITCHES[host.brandSlug] ? `- 自家服務(業配素材):${SERVICE_PITCHES[host.brandSlug]}` : '',
    host.canInterrupt ? '- 特質:急性子,會搶話打斷別人(開頭用「等等等等!」「欸不是啊…」之類)' : '',
  ].filter(Boolean).join('\n');
}

/** 每集固定的開場自我介紹(不經 LLM,保證每集一致) */
function buildFixedIntroLines(hosts: PodcastHost[]): ScriptLine[] {
  const lines: ScriptLine[] = [];
  hosts.forEach((h, i) => {
    const intro = FIXED_SELF_INTROS[h.brandSlug] ?? `大家好,我是 ${h.brandName} 的 ${h.nickname}!`;
    const text = i === 0 ? `${SHOW_OPENING}${intro}` : intro;
    lines.push({ order: lines.length, segmentLabel: 'intro', agentId: h.agentId, nickname: h.nickname, text, emotion: 'excited' });
  });
  return lines;
}

/** 反應性笑聲規則(一般集與訪談集共用) */
const LAUGHTER_RULE =
  '- 笑聲要「聽得到」:每個話題/問題至少 1-2 句「純反應」的短台詞——某人講完笑點後,另一人立刻單獨接一句像「哈哈哈哈,不會吧!」「欸你很壞欸哈哈!」「笑死,真的假的?」(這種句子的 emotion 一定填 laughing),不用等講完整段才笑;全集 laughing 情緒至少出現 4-6 次,聽起來才像真的有人在棚裡笑出來';

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

const SCRIPT_MIN_CHARS = 1800;

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
    '- 話題不多但要聊得深:每個話題 6-10 輪來回,從「發生什麼事」→「各自的看法/經驗」→「吵一下或互虧」→「收斂出結論或笑著帶過」,不是每人輪流講一句就換話題',
    '- 每個話題至少埋 1 個「實用小知識或冷知識」:讓聽眾聽完覺得有帶走東西(例如行情數字、避雷方法、內行人才知道的眉角),但要用聊天口吻講,像朋友爆料,不要像上課',
    '- 每個話題至少 1 個笑點:吐槽、自嘲、誇張比喻、講自己客人的糗事(匿名)都可以,要讓人聽了會笑出來',
    LAUGHTER_RULE,
    '- 業配時間:話題和某個小編的服務相關時,那位小編要自然地「順便」講 1-2 句自家系統的優勢(用上面的業配素材),講的時候可以理直氣壯,其他兩人可以吐槽「又來了又來了」「業配喔!」然後笑著帶過;每集業配 2-3 次就好,不要每題都推銷',
    '- 業配鐵則:每個人「只能」推銷自己代表的品牌!阿豪只推 Taskgo、小咪只推 Homigo、阿樂只推 Washgo;別人的品牌絕對不能講成「我們」,只能用吐槽或幫腔的方式提到',
    '- 三個人的名字必須寫對:阿豪、小咪、阿樂,不准出現錯字(例如「阿浩」)',
    '- 講話要像「真人」:常用台灣人的發語詞和口頭語(欸、蛤?、哇賽、老實說、講真的、啊不然、對啦、唉唷、嗯…、就是說),偶爾句子講一半停頓(用「…」),會直接叫對方的名字回應(「小咪妳這樣講喔…」),不要每句都文法完整',
    '- 每句台詞 30-90 字,口語、快節奏、有情緒;每個人都要為自己品牌的立場講話',
    '- 阿豪是急性子,一集至少搶話打斷別人 2-3 次(開頭用「等等等等!」「欸不是啊…」「蛤?等一下啦」)',
    '- 節目開頭已經有固定的節目介紹和三人自我介紹(系統會自動加在最前面),所以你寫的開場(intro)不要再自我介紹,直接用 2-4 句互虧、聊近況暖場,然後帶入第一個話題',
    '- 結尾(outro)輕鬆總結每題重點一句話、互相虧一句、跟聽眾說下集見',
    '- 話題之間的轉場要自然(由某個人吐槽或聯想帶到下一題),不要像念稿',
    '- 除了業配時間之外不要喊口號、不要促銷;品牌立場透過聊天自然流露',
    ANTI_AI_RULES,
  ].join('\n');

  const userPrompt = [
    `本集要聊的熱門話題(共 ${topics.length} 則,每一則都要深入討論):`,
    topicList,
    '',
    `請寫出完整一集的腳本,總長度 2000-3000 字(不含 JSON 結構),分成這些段落:${segmentLabels.join(' → ')}。`,
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
        { role: 'user', content: `這集只有 ${totalChars} 字,太短了。每個話題再多加 2-3 輪來回(多一點吐槽、吵架、開玩笑,知識點講得更細),把總長度擴到 2000-3000 字,回傳同格式完整 JSON。` },
      ],
    });
  }

  // 固定自我介紹放最前面(不經 LLM,每集一致),後面接 LLM 寫的腳本
  const lines: ScriptLine[] = buildFixedIntroLines(hosts);
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
// 訪談來賓:Instant Voice Clone + 三小編訪談集
// ============================================================================

export type PodcastGuestStatus = 'pending' | 'cloning' | 'ready' | 'failed';

export interface PodcastGuest {
  id: string;
  name: string;
  title: string | null;
  bio: string;
  voiceId: string | null;
  status: PodcastGuestStatus;
  errorMessage: string | null;
  createdAt: string;
}

/** 來賓在 ScriptLine.agentId 的識別格式(和 ai_agents UUID 區分) */
export function guestAgentId(guestId: string): string {
  return `guest:${guestId}`;
}

function rowToGuest(r: Record<string, unknown>): PodcastGuest {
  return {
    id: r.id as string,
    name: r.name as string,
    title: (r.title as string) ?? null,
    bio: r.bio as string,
    voiceId: (r.voice_id as string) ?? null,
    status: r.status as PodcastGuestStatus,
    errorMessage: (r.error_message as string) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function getPodcastGuest(env: Env, guestId: string): Promise<PodcastGuest> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM podcast_guests WHERE id = ${guestId}::uuid LIMIT 1`;
  if (!rows.length) throw new Error('找不到這位來賓');
  return rowToGuest(rows[0] as Record<string, unknown>);
}

/**
 * 建立來賓資料:聲音樣本存 R2 → 呼叫 ElevenLabs Instant Voice Clone。
 * clone 失敗不丟例外,回傳 status='failed' 的來賓(資料保留,可之後重試)。
 */
export async function createGuestProfile(
  env: Env,
  params: {
    name: string;
    title?: string;
    bio: string;
    audioBytes: Uint8Array;
    fileName: string;
    mimeType: string;
    consentConfirmed: boolean;
  },
): Promise<PodcastGuest> {
  if (!params.consentConfirmed) throw new Error('必須先確認已取得受訪者本人同意複製聲音');
  if (!params.name.trim() || !params.bio.trim()) throw new Error('來賓姓名與經歷/故事資料為必填');

  const sql = getSql(env);
  const ext = params.fileName.split('.').pop()?.toLowerCase() || 'mp3';
  const sampleKey = buildGuestVoiceKey(ext);
  await putMedia(env, sampleKey, params.audioBytes, params.mimeType);

  const inserted = await sql`
    INSERT INTO podcast_guests (name, title, bio, voice_sample_key, consent_confirmed_at, status)
    VALUES (${params.name.trim()}, ${params.title?.trim() || null}, ${params.bio.trim()}, ${sampleKey}, now(), 'cloning')
    RETURNING *
  `;
  const guestId = (inserted[0] as { id: string }).id;

  try {
    const { voiceId, requiresVerification } = await cloneVoice(env, {
      name: `Podcast來賓-${params.name.trim()}`,
      description: params.title?.trim() || undefined,
      fileBytes: params.audioBytes,
      fileName: params.fileName,
      mimeType: params.mimeType,
    });
    const note = requiresVerification ? 'ElevenLabs 要求驗證此聲音,若合成失敗請到 ElevenLabs 後台完成驗證' : null;
    const updated = await sql`
      UPDATE podcast_guests SET voice_id = ${voiceId}, status = 'ready', error_message = ${note}
      WHERE id = ${guestId}::uuid RETURNING *
    `;
    return rowToGuest(updated[0] as Record<string, unknown>);
  } catch (e) {
    const message = e instanceof Error ? e.message : '聲音複製失敗';
    const updated = await sql`
      UPDATE podcast_guests SET status = 'failed', error_message = ${message}
      WHERE id = ${guestId}::uuid RETURNING *
    `;
    console.error(`[podcast] 來賓 ${params.name} 聲音複製失敗`, e);
    return rowToGuest(updated[0] as Record<string, unknown>);
  }
}

const INTERVIEW_MIN_CHARS = 1600;

/** 訪談集腳本:固定開場 + 來賓介紹轉場 → 3 段深入問答 → 感謝結尾 */
export async function generateInterviewScript(
  env: Env,
  hosts: PodcastHost[],
  guest: PodcastGuest,
): Promise<{ title: string; topicSummary: string; lines: ScriptLine[] }> {
  const hostByNickname = new Map(hosts.map((h) => [h.nickname, h]));
  const segmentLabels = ['intro', 'q1', 'q2', 'q3', 'outro'];
  const guestLabel = guest.title ? `${guest.title}——${guest.name}` : guest.name;

  const systemPrompt = [
    `你是台灣 Podcast 節目「三小編熱聊」的資深編劇。本集是「訪談特輯」:三位品牌小編邀請一位真實來賓上節目聊他的經歷與故事,全長約 10 分鐘,氣氛像朋友聚會,不是正式專訪。`,
    '',
    '三位主持人的人設(要嚴格照人設寫,聽眾閉著眼睛也要分得出誰在講話):',
    hosts.map(hostIntroBlock).join('\n\n'),
    '',
    `本集來賓:【${guest.name}】${guest.title ? `(${guest.title})` : ''}`,
    '來賓的背景資料(訪談內容的唯一素材來源):',
    guest.bio,
    '',
    '訪談腳本鐵則:',
    '- 來賓的每一句回答都要根據上面的背景資料「代寫」:語氣要像真人受訪,口語、自然、有停頓和贅字;可以合理延伸感受和情緒,但「絕對不可以」捏造背景資料以外的具體事實(數字、日期、人名、地點、公司名)',
    '- 來賓回答每句 60-150 字,講故事的時候可以連續講 2 句;主持人台詞每句 30-90 字',
    '- 三小編要像真的主持人:聽到有趣的地方會追問「後來咧?」「等等,那個時候你不會怕喔?」、會驚訝、會吐槽、會把來賓的故事連回自己的行業經驗,不是照稿輪流念問題',
    '- 三段問答(q1/q2/q3)各聊一個不同切角:從背景資料裡挑最有梗的三件事(例如:入行經歷/最難忘的故事/專業眉角或給聽眾的建議),每段 5-8 輪來回',
    LAUGHTER_RULE,
    '- 開場(intro):系統已自動加上節目固定開場和來賓介紹,你寫的 intro 從來賓打招呼開始——來賓先簡短自我介紹(根據背景資料,50-100字),三小編熱情回應、簡單寒暄 2-3 句就進第一個問題',
    '- 結尾(outro):三小編各自講一句今天的收穫或虧來賓一句,誠懇感謝來賓,跟聽眾說下集見;來賓也要講一句收尾',
    '- 講話要像「真人」:常用台灣人的發語詞和口頭語(欸、蛤?、哇賽、老實說、講真的、啊不然、對啦、唉唷、嗯…、就是說),不要每句都文法完整',
    `- 名字必須寫對:${hosts.map((h) => h.nickname).join('、')}、${guest.name},不准出現錯字`,
    '- 不要業配、不要促銷;小編可以自然聊到自己行業,但這集的主角是來賓',
    ANTI_AI_RULES,
  ].join('\n');

  const userPrompt = [
    `請寫出完整一集訪談腳本,總長度 2000-3000 字(不含 JSON 結構),分成這些段落:${segmentLabels.join(' → ')}。`,
    '回傳 JSON:',
    `{"title":"本集標題(10-20字,要讓人想點開,包含來賓的亮點)","topicSummary":"一句話介紹本集訪談了誰、聊了什麼","script":[{"segment":"${segmentLabels.join('|')} 擇一","speaker":"${[...hosts.map((h) => h.nickname), guest.name].join('|')} 擇一","text":"台詞","emotion":"${MEETING_EMOTIONS.join('|')} 中選一個"}]}`,
  ].join('\n');

  let result = await chatCompleteJson<GeneratedScript>(env, {
    temperature: 0.95,
    maxTokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const totalChars = (result.script ?? []).reduce((s, l) => s + (l.text?.length ?? 0), 0);
  if (totalChars < INTERVIEW_MIN_CHARS) {
    result = await chatCompleteJson<GeneratedScript>(env, {
      temperature: 0.9,
      maxTokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(result) },
        { role: 'user', content: `這集只有 ${totalChars} 字,太短了。每個問答段再多 2-3 輪追問和反應(來賓故事講得更細、小編多吐槽多笑),把總長度擴到 2000-3000 字,回傳同格式完整 JSON。` },
      ],
    });
  }

  // 固定開場 + 來賓介紹轉場(不經 LLM,每集一致)
  const lines: ScriptLine[] = buildFixedIntroLines(hosts);
  lines.push({
    order: lines.length,
    segmentLabel: 'intro',
    agentId: hosts[0].agentId,
    nickname: hosts[0].nickname,
    text: `欸今天不一樣喔!我們請到一位超特別的來賓——${guestLabel}!等一下就讓他自己跟大家打招呼,掌聲歡迎~`,
    emotion: 'excited',
  });

  const guestNickname = guest.name;
  for (const raw of result.script ?? []) {
    const speaker = raw.speaker?.trim();
    const text = raw.text?.trim();
    if (!speaker || !text) continue;
    const segment = segmentLabels.includes(raw.segment) ? raw.segment : (lines[lines.length - 1]?.segmentLabel ?? 'intro');
    const emotion = (MEETING_EMOTIONS as readonly string[]).includes(raw.emotion) ? raw.emotion as MeetingEmotion : 'neutral';
    const host = hostByNickname.get(speaker);
    if (host) {
      lines.push({ order: lines.length, segmentLabel: segment, agentId: host.agentId, nickname: host.nickname, text, emotion });
    } else if (speaker === guestNickname) {
      lines.push({ order: lines.length, segmentLabel: segment, agentId: guestAgentId(guest.id), nickname: guestNickname, text, emotion });
    }
  }
  if (lines.length < 12) throw new Error(`訪談腳本生成失敗:只有 ${lines.length} 句有效台詞`);
  const guestLineCount = lines.filter((l) => l.agentId === guestAgentId(guest.id)).length;
  if (guestLineCount < 3) throw new Error(`訪談腳本生成失敗:來賓只有 ${guestLineCount} 句台詞`);

  return {
    title: result.title?.trim() || `三小編熱聊訪談:${guest.name}`,
    topicSummary: result.topicSummary?.trim() || `本集邀請 ${guestLabel} 來聊聊他的故事`,
    lines,
  };
}

/** 完整流程:讀來賓 → 生成訪談腳本 → 寫入 podcast_episodes(episode_type=interview) */
export async function createInterviewEpisode(env: Env, guestId: string): Promise<CreatedEpisode> {
  const sql = getSql(env);
  const guest = await getPodcastGuest(env, guestId);
  if (guest.status !== 'ready' || !guest.voiceId) {
    throw new Error(`來賓「${guest.name}」的聲音還沒準備好(狀態:${guest.status}${guest.errorMessage ? `,${guest.errorMessage}` : ''})`);
  }

  const hosts = await getPodcastHosts(env);
  const { title, topicSummary, lines } = await generateInterviewScript(env, hosts, guest);

  const weekOf = taipeiWeekMonday();
  const seqRows = await sql`
    SELECT count(*)::int AS n FROM podcast_episodes WHERE week_of = ${weekOf}::date
  `;
  const episodeSeq = ((seqRows[0] as { n: number })?.n ?? 0) + 1;

  const inserted = await sql`
    INSERT INTO podcast_episodes (week_of, episode_seq, title, topic_summary, source_signal_ids, script, status, episode_type, guest_id)
    VALUES (
      ${weekOf}::date, ${episodeSeq}, ${title}, ${topicSummary},
      '[]', ${JSON.stringify(lines)}, 'script_draft', 'interview', ${guestId}::uuid
    ) RETURNING id
  `;
  const episodeId = (inserted[0] as { id: string }).id;
  const totalChars = lines.reduce((s, l) => s + l.text.length, 0);
  console.log(`[podcast] 已生成訪談集「${title}」(來賓 ${guest.name}):${lines.length} 句 / ${totalChars} 字`);
  return { episodeId, title, topicCount: 3, lineCount: lines.length, totalChars };
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
    SELECT id, script, status, guest_id FROM podcast_episodes WHERE id = ${episodeId}::uuid LIMIT 1
  `;
  if (!epRows.length) throw new Error('找不到這集節目');
  const episode = epRows[0] as { id: string; script: ScriptLine[]; status: string; guest_id: string | null };
  const lines = episode.script ?? [];
  if (!lines.length) throw new Error('這集還沒有腳本');

  const hosts = await getPodcastHosts(env);
  const voiceByAgentId = new Map(hosts.map((h) => [h.agentId, h.voiceId]));

  // 訪談集:把來賓的 cloned voice 併入
  if (episode.guest_id) {
    const guest = await getPodcastGuest(env, episode.guest_id);
    if (!guest.voiceId) throw new Error(`來賓「${guest.name}」沒有可用的 cloned voice(狀態:${guest.status})`);
    voiceByAgentId.set(guestAgentId(guest.id), guest.voiceId);
  }

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
