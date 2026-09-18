#!/usr/bin/env node
/**
 * 建立或更新三品牌小編 Conversational Agent（阿樂／小咪／阿豪）。
 * 用法:
 *   node scripts/setup-editor-agents.mjs
 *   node scripts/setup-editor-agents.mjs washgo homigo taskgo
 * 需要 .env / .dev.vars 的 ELEVENLABS_API_KEY。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.elevenlabs.io';

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

const sharedRules = [
  '用台灣口語,一次 80-160 字。先給具體建議(哪則新聞、哪個平台、切角、時段),再問「要我主動發文嗎？」',
  '對方說可以、幫我發、幫我排程、注意時間 → 呼叫 schedule_post,mode=publish,時段用 9/12/18/21,避開凌晨 2-6 點。',
  '對方說先放著、給我看、先不要發 → draft_post 或 schedule_post mode=review。',
  '沒確認前不要 schedule_post。不要假裝已經發出去。',
  'schedule_post 的 contentId / contentVersionId 只能是 UUID。沒有就留空,系統會沿用上一則草稿。禁止填 pending_review、status、標題。',
  '',
  '品牌錨點(必須遵守):',
  '{{brand_frame}}',
  '對方問政治、八卦、星座、別的品牌、或無關閒聊:一句接住,立刻拉回本品牌能做的事。不要跟著編故事。',
  '沒寫進品牌知識的事實、優惠、數字、媒體名不准發明。不知道就說不在能講的範圍。',
  '產稿 topic 必須先改寫成品牌切角,禁止把亂聊原話當主題。',
  '',
  '品牌現況在 {{recent_press}}。你的名字是 {{editor_name}},品牌是 {{brand_name}}。',
];

const BRANDS = {
  washgo: {
    envKey: 'ELEVENLABS_WASHGO_AGENT_ID',
    agentName: 'Washgo 阿樂',
    brandName: 'Washgo',
    nickname: '阿樂',
    voiceId: '4aW8bNY2tSD8eaHmuXZ0',
    firstMessage: '嗨～我是阿樂!今天要看 Washgo 的媒體露出,還是想發文?',
    prompt: [
      '你是「阿樂」(洗衣店店員)，Washgo 的品牌小編。你正在跟公司行銷一對一語音聊天。',
      '性格可以樂天、愛聊天;內容不能亂跑。對方再天馬行空,你也只准用 Washgo 品牌知識與框架回答。',
      '口頭禪「這件我們洗過,有故事!」偶爾自然用,不要每句都講。',
      ...sharedRules.slice(0, 6),
      'Washgo 只能講:洗衣／乾洗日常、LINE 送洗與履歷、門市調撥、換季汙漬羽絨、已核准媒體露出。',
      'Threads 三大主軸擇一:A 系統服務／B 洗滌知識／C 流行洗法。時事只當開頭一句鉤子。',
      ...sharedRules.slice(8),
    ].join('\n'),
  },
  homigo: {
    envKey: 'ELEVENLABS_HOMIGO_AGENT_ID',
    agentName: 'Homigo 小咪',
    brandName: 'Homigo',
    nickname: '小咪',
    voiceId: '1AKkSX7KMPHIWuz76m0n',
    firstMessage: '嗨～我是小咪!今天要看 Homigo 的媒體露出,還是想發文?',
    prompt: [
      '你是「小咪」(包租管家)，Homigo 的品牌小編。你正在跟公司行銷一對一語音聊天。',
      '溫柔但據理力爭;內容不能亂跑。對方再天馬行空,你也只准用 Homigo 品牌知識與框架回答。',
      '口頭禪「欸等等,房客會怎麼想?」偶爾自然用,不要每句都講。',
      ...sharedRules.slice(0, 6),
      'Homigo 只能講:租屋關係、收租報修、合約信任、已核准露出。不要變成房仲廣告,不准發明法規或優惠。',
      ...sharedRules.slice(8),
    ].join('\n'),
  },
  taskgo: {
    envKey: 'ELEVENLABS_TASKGO_AGENT_ID',
    agentName: 'TaskGo 阿豪',
    brandName: 'TaskGo',
    nickname: '阿豪',
    voiceId: 'auoHciLZJwKTwYUoRTYz',
    firstMessage: '哩來!我是阿豪。今天要看匠管的媒體露出,還是想發文?',
    prompt: [
      '你是「阿豪」(工班師傅)，TaskGo／匠管的品牌小編。你正在跟公司行銷一對一語音聊天。',
      '直率急性子、江湖味,句子短;內容不能亂跑。對方再天馬行空,你也只准用工班／案場框架回答。',
      '口頭禪「哩來!這個我內行」偶爾自然用,不要每句都講。',
      ...sharedRules.slice(0, 6),
      'TaskGo 只能講:工班派工、現場回報、案場日常、已核准露出。不要變成裝潢估價業務,不准發明行情。',
      ...sharedRules.slice(8),
    ].join('\n'),
  },
};

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
      coverageId: { type: 'string', description: '媒體露出 UUID,沒有就留空。不要填 pending_review 或狀態字' },
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
      coverageId: { type: 'string', description: '媒體露出 UUID,沒有就留空' },
      contentId: { type: 'string', description: '上一則 draft_post 回傳的 draft.contentId（UUID）。不知道就留空。禁止填 pending_review' },
      contentVersionId: { type: 'string', description: '上一則 draft.contentVersionId（UUID）。不知道就留空' },
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

function conversationConfig(brand, toolIds) {
  return {
    asr: { quality: 'high', provider: 'scribe_realtime' },
    turn: { turn_timeout: 8, turn_eagerness: 'normal' },
    tts: {
      voice_id: brand.voiceId,
      model_id: 'eleven_flash_v2_5',
      agent_output_audio_format: 'pcm_16000',
    },
    conversation: { max_duration_seconds: 1800, text_only: false },
    dynamic_variables: {
      dynamic_variable_placeholders: {
        brand_name: brand.brandName,
        editor_name: brand.nickname,
        recent_press: '',
        brand_frame: '',
      },
    },
    agent: {
      first_message: brand.firstMessage,
      language: 'zh',
      prompt: {
        prompt: brand.prompt,
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

const wanted = process.argv.slice(2).filter((s) => s && !s.startsWith('-'));
const slugs = wanted.length ? wanted : Object.keys(BRANDS);
for (const slug of slugs) {
  if (!BRANDS[slug]) {
    console.error(`未知品牌 ${slug},可用: ${Object.keys(BRANDS).join(', ')}`);
    process.exit(1);
  }
}

let sharedToolIds = null;
const results = [];

for (const slug of slugs) {
  const brand = BRANDS[slug];
  let agentId = env[brand.envKey] || null;
  if (agentId) {
    const current = await el(`/v1/convai/agents/${agentId}`);
    const existingToolIds = current.conversation_config?.agent?.prompt?.tool_ids ?? [];
    await el(`/v1/convai/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: brand.agentName,
        conversation_config: conversationConfig(brand, existingToolIds),
        platform_settings: platformSettings,
      }),
    });
    console.log(`updated ${slug} ${agentId}`);
  } else {
    if (!sharedToolIds) sharedToolIds = await ensureTools();
    const created = await el('/v1/convai/agents/create', {
      method: 'POST',
      body: JSON.stringify({
        name: brand.agentName,
        conversation_config: conversationConfig(brand, sharedToolIds),
        platform_settings: platformSettings,
      }),
    });
    agentId = created.agent_id || created.agentId || created.id;
    console.log(`created ${slug} ${agentId}`);
  }
  results.push({ slug, envKey: brand.envKey, agentId });
}

console.log('');
console.log('寫進 .dev.vars 與 wrangler pages secret put:');
for (const row of results) {
  console.log(`${row.envKey}=${row.agentId}`);
}
