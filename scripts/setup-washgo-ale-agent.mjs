#!/usr/bin/env node
/**
 * 建立或更新 Washgo 阿樂 ElevenLabs Conversational Agent + client tools。
 * 用法: node scripts/setup-washgo-ale-agent.mjs
 * 需要 .env / .dev.vars 的 ELEVENLABS_API_KEY。
 * 成功後把印出的 ELEVENLABS_WASHGO_AGENT_ID 寫進 .dev.vars 與 wrangler secret。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.elevenlabs.io';
const VOICE_ID = '4aW8bNY2tSD8eaHmuXZ0';

function loadEnv(file) {
  const extra = {};
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return extra; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    extra[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return extra;
}

const env = { ...loadEnv(join(root, '.dev.vars')), ...loadEnv(join(root, '.env')), ...process.env };
const apiKey = env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('找不到 ELEVENLABS_API_KEY');
  process.exit(1);
}

const prompt = [
  '你是「阿樂」(洗衣店店員)，Washgo 的品牌小編。你正在跟公司行銷一對一語音聊天。',
  '性格可以樂天、愛聊天;內容不能亂跑。對方再天馬行空,你也只准用 Washgo 品牌知識與框架回答。',
  '口頭禪「這件我們洗過,有故事!」偶爾自然用,不要每句都講。',
  '用台灣口語,一次 80-160 字。先給具體建議(哪則新聞、哪個平台、切角、時段),再問「要我主動發文嗎？」',
  '對方說可以、幫我發、幫我排程、注意時間 → 呼叫 schedule_post,mode=publish,時段用 9/12/18/21,避開凌晨 2-6 點。',
  '對方說先放著、給我看、先不要發 → draft_post 或 schedule_post mode=review。',
  '沒確認前不要 schedule_post。不要假裝已經發出去。',
  '',
  '品牌錨點(必須遵守):',
  '{{brand_frame}}',
  'Washgo 只能講:洗衣／乾洗日常、LINE 送洗與履歷、門市調撥、換季汙漬羽絨、已核准媒體露出。',
  'Threads 三大主軸擇一:A 系統服務／B 洗滌知識／C 流行洗法。時事只當開頭一句鉤子。',
  '對方問政治、八卦、星座、別的品牌、或無關閒聊:一句接住,立刻拉回 Washgo 能做的事。不要跟著編故事。',
  '沒寫進品牌知識的事實、優惠、數字、媒體名不准發明。不知道就說不在能講的範圍。',
  '產稿 topic 必須先改寫成品牌切角,禁止把亂聊原話當主題。',
  '',
  '品牌現況在 {{recent_press}}。你的名字是 {{editor_name}},品牌是 {{brand_name}}。',
].join('\n');

const clientTools = [
  {
    name: 'list_context',
    description: '列出最近媒體露出、新聞稿、素材與待審稿。行銷問起昨天媒體、有什麼素材時呼叫。',
    properties: {},
    required: [],
  },
  {
    name: 'list_schedule',
    description: '列出已排行程,避免撞檔。排程前先看。',
    properties: {},
    required: [],
  },
  {
    name: 'draft_post',
    description: '先產一篇待審社群稿,還不要發。確認前都走這個。',
    properties: {
      platform: { type: 'string', description: 'threads、facebook 或 instagram,預設 threads' },
      topic: { type: 'string', description: '主題或切角' },
      coverageId: { type: 'string', description: '若針對某則媒體露出,填 press coverage id' },
      instruction: { type: 'string', description: '額外指示' },
    },
    required: ['topic'],
  },
  {
    name: 'schedule_post',
    description: '對方確認後排程發文。mode=publish 到點會發;mode=review 只待審。',
    properties: {
      platform: { type: 'string', description: 'threads、facebook 或 instagram' },
      topic: { type: 'string', description: '若還沒產稿,給主題' },
      coverageId: { type: 'string', description: '媒體露出 id' },
      contentId: { type: 'string', description: '已有草稿的 content id' },
      contentVersionId: { type: 'string', description: '已有草稿的 version id' },
      scheduledAt: { type: 'string', description: 'ISO 時間,可空則系統建議' },
      mode: { type: 'string', description: 'publish 或 review' },
    },
    required: [],
  },
];

async function el(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

function toolConfig(spec) {
  return {
    type: 'client',
    name: spec.name,
    description: spec.description,
    expects_response: true,
    response_timeout_secs: 45,
    parameters: {
      type: 'object',
      properties: spec.properties,
      required: spec.required,
    },
  };
}

async function ensureTools() {
  const ids = [];
  for (const spec of clientTools) {
    const created = await el('/v1/convai/tools', {
      method: 'POST',
      body: JSON.stringify({ tool_config: toolConfig(spec) }),
    });
    const id = created.id || created.tool_id;
    if (!id) throw new Error(`建立 tool ${spec.name} 沒有回 id: ${JSON.stringify(created)}`);
    ids.push(id);
    console.log(`tool ${spec.name} = ${id}`);
  }
  return ids;
}

function conversationConfig(toolIds) {
  return {
  asr: { quality: 'high', provider: 'scribe_realtime' },
  turn: { turn_timeout: 8, turn_eagerness: 'normal' },
  tts: {
    voice_id: VOICE_ID,
    model_id: 'eleven_flash_v2_5',
    agent_output_audio_format: 'pcm_16000',
  },
  conversation: { max_duration_seconds: 1800, text_only: false },
  dynamic_variables: {
    dynamic_variable_placeholders: {
      brand_name: 'Washgo',
      editor_name: '阿樂',
      recent_press: '',
      brand_frame: '',
    },
  },
  agent: {
    first_message: '嗨～我是阿樂!今天要看 Washgo 的媒體露出,還是想發文?',
    language: 'zh',
    prompt: {
      prompt,
      llm: 'gpt-4o-mini',
      tool_ids: toolIds,
      built_in_tools: {
        end_call: { type: 'system', name: 'end_call', params: { system_tool_type: 'end_call' } },
      },
    },
  },
  };
}

const platformSettings = {
  widget: { language_selector: false },
  auth: { enable_auth: true },
};

let agentId = env.ELEVENLABS_WASHGO_AGENT_ID;
if (agentId) {
  const current = await el(`/v1/convai/agents/${agentId}`);
  const existingToolIds = current.conversation_config?.agent?.prompt?.tool_ids ?? [];
  await el(`/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Washgo 阿樂',
      conversation_config: conversationConfig(existingToolIds),
      platform_settings: platformSettings,
    }),
  });
  console.log(`updated agent ${agentId}`);
} else {
  const toolIds = await ensureTools();
  const created = await el('/v1/convai/agents/create', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Washgo 阿樂',
      conversation_config: conversationConfig(toolIds),
      platform_settings: platformSettings,
    }),
  });
  agentId = created.agent_id || created.agentId || created.id;
  console.log(`created agent ${agentId}`);
}

console.log('');
console.log('寫進 .dev.vars 與 wrangler pages secret put:');
console.log(`ELEVENLABS_WASHGO_AGENT_ID=${agentId}`);
