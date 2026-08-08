import type { Env } from './env';
import { getSql } from './db';
import { chatComplete, chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';

export interface MeetingAgent {
  id: string;
  displayName: string;
  roleCode: string;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
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
    SELECT a.id, a.display_name, a.brand_id, r.code AS role_code, b.slug AS brand_slug, b.name AS brand_name
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
  }));
}

function agentSystemPrompt(agent: MeetingAgent, meetingTitle: string, meetingTopic: string | null): string {
  const rolePersona = ROLE_PERSONA[agent.roleCode] ?? ROLE_PERSONA.brand_ai;
  const voice = agent.brandSlug ? getBrandVoice(agent.brandSlug) : null;
  return [
    `你是「${agent.displayName}」,正在參加內部行銷會議「${meetingTitle}」。`,
    meetingTopic ? `會議主題:${meetingTopic}` : '',
    rolePersona,
    agent.brandName ? `你代表品牌:${agent.brandName}。` : '',
    voice ? voice.frontlinePersona : '',
    voice?.dailyConcerns ? `你的行業日常話題:${voice.dailyConcerns}` : '',
    '',
    '發言規則:',
    '- 用台灣職場口語,像真人在會議裡講話,不要客套開場白',
    '- 一次發言 150 字以內,只講一兩個重點,要有具體主張(可以直接提議發文規則、時段、形式)',
    '- 可以回應、質疑其他人的發言;意見相同就補充新角度,不要重複',
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

export interface SuggestedRule {
  brandSlug: string;
  ruleType: 'marketing_rule' | 'can_claim' | 'cannot_claim' | 'negative_rule';
  statement: string;
  conditionNote?: string;
}

export interface MeetingConclusion {
  summaryMarkdown: string;
  suggestedRules: SuggestedRule[];
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

  const brandRows = await sql`SELECT slug, name FROM brands WHERE is_active = true`;
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
          '請整理:1) Markdown 會議摘要(共識、分歧、待辦) 2) 各品牌可直接採納的發文規則(具體可執行,例如發文時段、平台形式、禁忌)。',
          '回傳 JSON:{"summaryMarkdown":"...","suggestedRules":[{"brandSlug":"homigo","ruleType":"marketing_rule","statement":"規則內容","conditionNote":"適用條件(可省略)"}]}',
        ].join('\n'),
      },
    ],
  });

  await sql`
    INSERT INTO meeting_summaries (meeting_id, summary_markdown)
    VALUES (${meetingId}::uuid, ${conclusion.summaryMarkdown})
  `;
  await sql`UPDATE meetings SET status = 'concluded', updated_at = now() WHERE id = ${meetingId}::uuid`;

  return conclusion;
}
