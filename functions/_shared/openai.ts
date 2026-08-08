import type { Env } from './env';

const OPENAI_BASE = 'https://api.openai.com/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'OpenAIError';
  }
}

function requireApiKey(env: Env): string {
  if (!env.OPENAI_API_KEY) {
    throw new OpenAIError(500, 'OPENAI_API_KEY 尚未設定,請先執行 wrangler pages secret put OPENAI_API_KEY');
  }
  return env.OPENAI_API_KEY;
}

/** 呼叫 Chat Completions;jsonMode 開啟時強制回傳合法 JSON 物件 */
export async function chatComplete(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; jsonMode?: boolean; maxTokens?: number },
): Promise<string> {
  const apiKey = requireApiKey(env);
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL ?? 'gpt-4o-mini',
      messages: params.messages,
      temperature: params.temperature ?? 0.8,
      max_tokens: params.maxTokens ?? 2048,
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenAIError(res.status, `OpenAI chat 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenAIError(502, 'OpenAI 回傳空內容');
  return content;
}

/** 便利函式:chat + 解析 JSON 回傳 */
export async function chatCompleteJson<T>(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; maxTokens?: number },
): Promise<T> {
  const raw = await chatComplete(env, { ...params, jsonMode: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new OpenAIError(502, `OpenAI 回傳非合法 JSON: ${raw.slice(0, 200)}`);
  }
}

/** 產生圖片,回傳 PNG bytes */
export async function generateImage(
  env: Env,
  params: { prompt: string; size?: '1024x1024' | '1024x1536' | '1536x1024' },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
      prompt: params.prompt,
      size: params.size ?? '1024x1024',
      // medium 品質社群貼圖已足夠,生成時間比預設(auto=high)快一倍以上
      quality: 'medium',
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenAIError(res.status, `OpenAI image 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { data: { b64_json?: string; url?: string }[] };
  const first = data.data?.[0];
  if (first?.b64_json) {
    const binary = atob(first.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (first?.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new OpenAIError(502, '下載生成圖片失敗');
    return new Uint8Array(await imgRes.arrayBuffer());
  }
  throw new OpenAIError(502, 'OpenAI 未回傳圖片資料');
}
