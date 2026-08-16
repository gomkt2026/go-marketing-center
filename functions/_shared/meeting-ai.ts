import type { Env } from './env';
import { getSql } from './db';
import { chatComplete, chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';

export interface AgentPersona {
  nickname?: string;
  characterTitle?: string;
  avatarUrl?: string | null;
  temperament?: string;
  catchphrase?: string;
  focus?: string;
  /** 有此特質的小編在直播中偶爾會插隊打斷別人(例如阿豪) */
  canInterrupt?: boolean;
}

export interface MeetingAgent {
  id: string;
  displayName: string;
  roleCode: string;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  persona: AgentPersona;
}

const ROLE_PERSONA: Record<string, string> = {
  brand_ai: '你是品牌的 AI 代理人,代表品牌立場發言,熟知品牌的受眾與第一線日常。',
  market_analyst: '你是跨品牌市場分析師,用數據與趨勢觀點發言,提醒大家現在網路上在紅什麼。',
  content_strategist: '你是內容策略師,關注貼文形式、平台演算法與內容排程。',
  risk_advisor: '你是風險顧問,專門指出可能的公關風險、法規疑慮與品牌規則衝突。',
  devils_advocate: '你是唱反調的人,專挑大家共識裡的盲點。',
  moderator: '你是會議主持人,負責聚焦討論、整理共識。',
};

export async function getMeetingAgents(env: Env, meetingId: string): Promise<MeetingAgent[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.display_name, a.brand_id, a.persona, r.code AS role_code, b.slug AS brand_slug, b.name AS brand_name
    FROM meeting_participants mp
    JOIN ai_agents a ON a.id = mp.agent_id
    JOIN agent_roles r ON r.id = a.role_id
    LEFT JOIN brands b ON b.id = a.brand_id
    WHERE mp.meeting_id = ${meetingId}::uuid AND mp.participant_type = 'ai_agent' AND a.is_active = true
    ORDER BY a.display_name
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    roleCode: r.role_code as string,
    brandId: (r.brand_id as string | null),
    brandSlug: (r.brand_slug as string | null),
    brandName: (r.brand_name as string | null),
    persona: ((r.persona ?? {}) as AgentPersona),
  }));
}

function agentSystemPrompt(agent: MeetingAgent, meetingTitle: string, meetingTopic: string | null, liveMode = false): string {
  const rolePersona = ROLE_PERSONA[agent.roleCode] ?? ROLE_PERSONA.brand_ai;
  const voice = agent.brandSlug ? getBrandVoice(agent.brandSlug) : null;
  const p = agent.persona;
  const displayName = p.nickname ?? agent.displayName;
  return [
    `你是「${displayName}」${p.characterTitle ? `(${p.characterTitle})` : ''},正在參加${liveMode ? '一場三品牌小編的直播式快閃會議' : `內部行銷會議`}「${meetingTitle}」。`,
    meetingTopic ? `會議主題:${meetingTopic}` : '',
    rolePersona,
    agent.brandName ? `你代表品牌:${agent.brandName}。` : '',
    p.temperament ? `你的性格:${p.temperament}` : '',
    p.catchphrase ? `你的口頭禪是「${p.catchphrase}」(偶爾自然地用,不要每句都講)。` : '',
    p.focus ? `你在意的立場:${p.focus}` : '',
    voice ? voice.frontlinePersona : '',
    voice?.dailyConcerns ? `你的行業日常話題:${voice.dailyConcerns}` : '',
    '',
    '發言規則:',
    liveMode
      ? '- 像在群聊直播裡講話:一次 50-100 字,口語、快節奏、有情緒(可以吐槽、虧對方、據理力爭,也可以難過、感動、突然很有信心),但最終都是為自己品牌著想'
      : '- 用台灣職場口語,像真人在會議裡講話,不要客套開場白',
    liveMode
      ? '- 講話要像「真人」:常用台灣人的發語詞和口頭語(欸、蛤?、哇賽、老實說、講真的、啊不然、對啦、唉唷、嗯…、就是說),' +
        '偶爾句子講一半停頓(用「…」),會直接叫對方的名字回應(「小咪妳這樣講喔…」),不要每句都文法完整'
      : '',
    liveMode
      ? '- 要推進討論:回應上一位講的話,然後丟出自己的具體主張(發文主題、切角、時段、平台形式)'
      : '- 一次發言 150 字以內,只講一兩個重點,要有具體主張(可以直接提議發文規則、時段、形式)',
    '- 可以回應、質疑其他人的發言;意見相同就補充新角度,不要重複',
    liveMode ? '- 若管理者(使用者)有插話,優先回應他的意見' : '',
    ANTI_AI_RULES,
  ].filter(Boolean).join('\n');
}

/** 讓會議中每個 AI Agent 依序回覆一輪,回傳新增訊息的 id 清單 */
export async function runAgentRound(
  env: Env,
  meetingId: string,
  options?: { maxAgents?: number },
): Promise<string[]> {
  const sql = getSql(env);
  const meetingRows = await sql`SELECT title, topic FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return [];
  const meeting = meetingRows[0] as { title: string; topic: string | null };

  const agents = (await getMeetingAgents(env, meetingId)).slice(0, options?.maxAgents ?? 4);
  if (!agents.length) return [];

  const insertedIds: string[] = [];
  for (const agent of agents) {
    // 每次都重新載入最新對話,讓後面的 Agent 看得到前面 Agent 剛講的話
    const msgRows = await sql`
      SELECT mm.sender_type, mm.content, a.display_name AS agent_name, u.display_name AS user_name
      FROM meeting_messages mm
      LEFT JOIN ai_agents a ON a.id = mm.sender_agent_id
      LEFT JOIN users u ON u.id = mm.sender_user_id
      WHERE mm.meeting_id = ${meetingId}::uuid
      ORDER BY mm.created_at DESC LIMIT 24
    `;
    const transcript = (msgRows as { sender_type: string; content: string; agent_name: string | null; user_name: string | null }[])
      .reverse()
      .map((m) => `${m.agent_name ?? m.user_name ?? '成員'}:${m.content}`)
      .join('\n');

    try {
      const reply = await chatComplete(env, {
        temperature: 0.9,
        maxTokens: 400,
        messages: [
          { role: 'system', content: agentSystemPrompt(agent, meeting.title, meeting.topic) },
          {
            role: 'user',
            content: `目前會議對話紀錄:\n${transcript || '(還沒有人發言)'}\n\n輪到你發言了,請直接輸出你要講的話(不要加名字前綴)。`,
          },
        ],
      });
      const inserted = await sql`
        INSERT INTO meeting_messages (meeting_id, sender_type, sender_agent_id, content)
        VALUES (${meetingId}::uuid, 'ai_agent', ${agent.id}::uuid, ${reply.trim()})
        RETURNING id
      `;
      insertedIds.push((inserted[0] as { id: string }).id);
    } catch (e) {
      console.error(`[meeting-ai] agent ${agent.displayName} 回覆失敗`, e);
    }
  }
  return insertedIds;
}

// ============================================================================
// 直播模式:單次生成「下一位」小編的發言(含情緒標記)
// ============================================================================

export const MEETING_EMOTIONS = [
  'neutral', 'happy', 'excited', 'annoyed', 'angry', 'worried', 'laughing', 'proud',
  'sad', 'confident', 'determined', 'surprised', 'moved',
] as const;
export type MeetingEmotion = typeof MEETING_EMOTIONS[number];

export interface AdvanceResult {
  messageId: string;
  content: string;
  emotion: MeetingEmotion;
  interrupted: boolean;
  agent: MeetingAgent;
}

/** 過往會議記憶:近期結論摘要 + 該品牌的學習洞察,讓小編延續共識、越聊越懂品牌 */
async function buildMeetingMemory(env: Env, meetingId: string, brandId: string | null): Promise<string> {
  const sql = getSql(env);
  const [summaryRows, learningRows] = await Promise.all([
    sql`
      SELECT m.title, ms.summary_markdown
      FROM meeting_summaries ms
      JOIN meetings m ON m.id = ms.meeting_id
      WHERE ms.meeting_id != ${meetingId}::uuid
      ORDER BY ms.created_at DESC LIMIT 3
    `,
    brandId ? sql`
      SELECT insight FROM learning_records
      WHERE brand_id = ${brandId}::uuid AND status = 'approved'
      ORDER BY created_at DESC LIMIT 6
    ` : Promise.resolve([]),
  ]);

  const parts: string[] = [];
  const summaries = summaryRows as { title: string; summary_markdown: string }[];
  if (summaries.length) {
    parts.push(
      '你們過去開會討論過的結論(記得延續共識,不要重複討論已定案的事;若這次的討論跟過去結論衝突,可以指出來):\n' +
      summaries.map((s) => `【${s.title}】${s.summary_markdown.slice(0, 300)}`).join('\n'),
    );
  }
  const learnings = learningRows as { insight: string }[];
  if (learnings.length) {
    parts.push('你從過去經營中累積的品牌心得:\n' + learnings.map((l) => `- ${l.insight}`).join('\n'));
  }
  return parts.join('\n\n');
}

/** 直播會議:讓下一位小編發言一則(加權隨機挑人、可搶話,回應前文與使用者插話) */
export async function advanceMeetingOnce(env: Env, meetingId: string): Promise<AdvanceResult | null> {
  const sql = getSql(env);
  const meetingRows = await sql`SELECT title, topic, status FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return null;
  const meeting = meetingRows[0] as { title: string; topic: string | null; status: string };
  if (meeting.status === 'concluded' || meeting.status === 'archived') return null;

  const agents = await getMeetingAgents(env, meetingId);
  if (!agents.length) return null;

  // 最近對話 + 找出上一位發言的 Agent 以決定下一位(輪替)
  const msgRows = await sql`
    SELECT mm.sender_type, mm.sender_agent_id, mm.content, a.display_name AS agent_name,
           a.persona->>'nickname' AS agent_nickname, u.display_name AS user_name
    FROM meeting_messages mm
    LEFT JOIN ai_agents a ON a.id = mm.sender_agent_id
    LEFT JOIN users u ON u.id = mm.sender_user_id
    WHERE mm.meeting_id = ${meetingId}::uuid
    ORDER BY mm.created_at DESC LIMIT 30
  `;
  const recent = (msgRows as { sender_type: string; sender_agent_id: string | null; content: string; agent_name: string | null; agent_nickname: string | null; user_name: string | null }[]).reverse();

  // 發言者不照順序:加權隨機挑人(同一人不連續講兩次)
  //   - 上一則對話點到名字的人,很可能跳出來回應(權重 x3)
  //   - 衝動型小編(canInterrupt)本來就比較搶話(權重 x1.5)
  const lastAgentMsg = [...recent].reverse().find((m) => m.sender_type === 'ai_agent' && m.sender_agent_id);
  const lastMsg = recent[recent.length - 1];
  const candidates = agents.filter((a) => a.id !== lastAgentMsg?.sender_agent_id || agents.length === 1);
  const weighted = candidates.map((a) => {
    let w = 1;
    const nickname = a.persona.nickname ?? a.displayName;
    if (lastMsg?.content.includes(nickname)) w *= 3;
    if (a.persona.canInterrupt) w *= 1.5;
    return { agent: a, w };
  });
  const totalW = weighted.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * totalW;
  let speaker = weighted[0].agent;
  for (const x of weighted) {
    roll -= x.w;
    if (roll <= 0) { speaker = x.agent; break; }
  }

  // 搶話:衝動型小編 30%、其他人 10% 機率會用打斷的口氣搶著講
  const interrupted = recent.length > 0 && Math.random() < (speaker.persona.canInterrupt ? 0.3 : 0.1);

  const transcript = recent
    .map((m) => `${m.agent_nickname ?? m.agent_name ?? m.user_name ?? '管理者'}:${m.content}`)
    .join('\n');

  const memory = await buildMeetingMemory(env, meetingId, speaker.brandId);

  const reply = await chatCompleteJson<{ message: string; emotion: string }>(env, {
    temperature: 0.95,
    maxTokens: 300,
    messages: [
      {
        role: 'system',
        content: [agentSystemPrompt(speaker, meeting.title, meeting.topic, true), memory].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: [
          `目前會議對話:\n${transcript || '(會議剛開始,還沒有人講話,由你開場,直接切入主題)'}`,
          '',
          interrupted
            ? '你聽到一半忍不住了,直接打斷上一位的話搶著發言(開頭就要有打斷的感覺,用符合你個性的方式,例如「等等等等!」「欸不是啊…」「蛤?等一下啦」),然後講你的主張。回傳 JSON:'
            : '輪到你發言了。回傳 JSON:',
          `{"message":"你要講的話(50-100字,不要加名字前綴)","emotion":"${MEETING_EMOTIONS.join('|')} 中選一個最符合這則發言的情緒"}`,
        ].join('\n'),
      },
    ],
  });

  const emotion = (MEETING_EMOTIONS as readonly string[]).includes(reply.emotion) ? reply.emotion as MeetingEmotion : 'neutral';
  const inserted = await sql`
    INSERT INTO meeting_messages (meeting_id, sender_type, sender_agent_id, content, metadata)
    VALUES (${meetingId}::uuid, 'ai_agent', ${speaker.id}::uuid, ${reply.message.trim()}, ${JSON.stringify({ emotion, interrupted })})
    RETURNING id
  `;

  return {
    messageId: (inserted[0] as { id: string }).id,
    content: reply.message.trim(),
    emotion,
    interrupted,
    agent: speaker,
  };
}

export interface SuggestedRule {
  brandSlug: string;
  ruleType: 'marketing_rule' | 'can_claim' | 'cannot_claim' | 'negative_rule';
  statement: string;
  conditionNote?: string;
}

export interface PostPlanItem {
  brandSlug: string;
  platform: 'facebook' | 'instagram' | 'threads';
  topic: string;
  angle: string;
}

export interface BrandLearning {
  brandSlug: string;
  insight: string;
}

export interface MeetingConclusion {
  summaryMarkdown: string;
  suggestedRules: SuggestedRule[];
  postPlan: PostPlanItem[];
  learnings: BrandLearning[];
}

/** 總結會議並提出可採納的發文規則 */
export async function concludeMeeting(env: Env, meetingId: string): Promise<MeetingConclusion | null> {
  const sql = getSql(env);
  const meetingRows = await sql`SELECT title, topic FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return null;
  const meeting = meetingRows[0] as { title: string; topic: string | null };

  const msgRows = await sql`
    SELECT mm.content, a.display_name AS agent_name, u.display_name AS user_name
    FROM meeting_messages mm
    LEFT JOIN ai_agents a ON a.id = mm.sender_agent_id
    LEFT JOIN users u ON u.id = mm.sender_user_id
    WHERE mm.meeting_id = ${meetingId}::uuid
    ORDER BY mm.created_at
  `;
  const transcript = (msgRows as { content: string; agent_name: string | null; user_name: string | null }[])
    .map((m) => `${m.agent_name ?? m.user_name ?? '成員'}:${m.content}`)
    .join('\n');
  if (!transcript) return null;

  const brandRows = await sql`SELECT id, slug, name FROM brands WHERE is_active = true`;
  const brandList = (brandRows as { slug: string; name: string }[]).map((b) => `${b.slug}(${b.name})`).join('、');

  const conclusion = await chatCompleteJson<MeetingConclusion>(env, {
    temperature: 0.3,
    maxTokens: 1600,
    messages: [
      { role: 'system', content: '你是會議記錄專家,擅長把行銷討論整理成可執行的結論。' },
      {
        role: 'user',
        content: [
          `會議「${meeting.title}」${meeting.topic ? `(主題:${meeting.topic})` : ''}的完整對話:`,
          transcript,
          '',
          `可用品牌 slug:${brandList}`,
          '請整理:',
          '1) Markdown 會議摘要(共識、分歧、待辦)',
          '2) 各品牌可直接採納的發文規則(具體可執行,例如發文時段、平台形式、禁忌)',
          '3) 發文計畫 postPlan:根據討論結論,列出接下來要生成的貼文(哪個品牌、哪個平台、什麼主題、什麼切角);只列討論中真正有共識的項目,最多 4 項。每一項的 platform 只能填「一個」平台;若同主題要發多平台,就拆成多項。',
          '4) 品牌學習 learnings:從這次討論中,每個有參與的品牌學到什麼(對品牌價值、受眾、內容方向的洞察),一品牌最多 2 條,要具體、日後可直接引用。',
          '回傳 JSON:{"summaryMarkdown":"...","suggestedRules":[{"brandSlug":"homigo","ruleType":"marketing_rule","statement":"規則內容","conditionNote":"適用條件(可省略)"}],"postPlan":[{"brandSlug":"taskgo","platform":"facebook 或 instagram 或 threads 擇一","topic":"貼文主題","angle":"切入角度一句話"}],"learnings":[{"brandSlug":"washgo","insight":"洞察內容"}]}',
        ].join('\n'),
      },
    ],
  });

  // 容錯:AI 偶爾會把 platform 寫成 "facebook|instagram" 複合值,拆成多項
  const VALID_PLATFORMS = ['facebook', 'instagram', 'threads'] as const;
  const postPlan: PostPlanItem[] = [];
  for (const item of conclusion.postPlan ?? []) {
    const platforms = String(item.platform).split(/[|、,/\s]+/)
      .filter((p): p is PostPlanItem['platform'] => (VALID_PLATFORMS as readonly string[]).includes(p));
    for (const platform of platforms) {
      // 上限 4 項:控制 execute-plan 單次請求的生成量(Workers 子請求上限)
      if (postPlan.length >= 4) break;
      postPlan.push({ ...item, platform });
    }
  }

  await sql`
    INSERT INTO meeting_summaries (meeting_id, summary_markdown)
    VALUES (${meetingId}::uuid, ${conclusion.summaryMarkdown})
  `;
  // postPlan 存入 meetings.metadata,供 execute-plan 端點讀取
  await sql`
    UPDATE meetings
    SET status = 'concluded', updated_at = now(),
        metadata = metadata || ${JSON.stringify({ postPlan, planExecuted: false })}::jsonb
    WHERE id = ${meetingId}::uuid
  `;

  // 品牌學習寫入 learning_records:小編未來的會議與貼文生成都會引用這些洞察,越聊越懂品牌
  const learnings = (conclusion.learnings ?? []).slice(0, 6);
  const brandIdBySlug = new Map((brandRows as { id: string; slug: string }[]).map((b) => [b.slug, b.id]));
  for (const l of learnings) {
    const brandId = brandIdBySlug.get(l.brandSlug);
    if (!brandId || !l.insight?.trim()) continue;
    try {
      await sql`
        INSERT INTO learning_records (brand_id, record_type, insight, supporting_data)
        VALUES (${brandId}::uuid, 'other', ${l.insight.trim()},
                ${JSON.stringify({ source: 'meeting', meetingId, meetingTitle: meeting.title })})
      `;
    } catch (e) {
      console.error('[meeting-ai] 寫入品牌學習失敗', e);
    }
  }

  return { ...conclusion, postPlan, learnings };
}
