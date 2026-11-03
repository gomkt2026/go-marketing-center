import type { Env } from './env';

const OPENAI_BASE = 'https://api.openai.com/v1';

/** 多模態訊息內容片段(文字 + 圖片),格式對齊 OpenAI Chat Completions 的 vision 輸入 */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** 純文字或多模態內容(帶圖片時用陣列);預設文字模型(gpt-4o-mini)本身支援 vision */
  content: string | ChatContentPart[];
}

export class OpenAIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export interface ClientFacingError {
  status: number;
  message: string;
  retryable: boolean;
}

/** 把 OpenAI / 生成例外轉成前台看得懂的中文,額度不足不再偽裝成 502 */
export function toClientError(err: unknown, action: string): ClientFacingError {
  const raw = err instanceof Error ? err.message : String(err);
  const status = err instanceof OpenAIError ? err.status : 502;
  const blob = raw.toLowerCase();
  if (status === 401 || /incorrect api key|invalid_api_key|invalid api key/.test(blob)) {
    return { status: 401, message: `${action}失敗:OpenAI API Key 無效,請檢查 Pages Secret OPENAI_API_KEY`, retryable: false };
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { status: 504, message: `${action}逾時，模型還沒寫完。請再試一次，不要連按。`, retryable: true };
  }
  if (
    /insufficient_quota|exceeded your (current )?quota|credit_balance_exhausted|no credits remaining|billing_not_active/.test(blob)
  ) {
    return {
      status: 402,
      message: `${action}失敗:OpenAI 額度不足(儲值金額已用完)。請到 platform.openai.com/settings/organization/billing 儲值後再試`,
      retryable: false,
    };
  }
  if (status === 429 || /rate[_ ]limit/.test(blob)) {
    return { status: 429, message: `${action}失敗:OpenAI 請求過於頻繁,請稍後再試`, retryable: true };
  }
  if (/OPENAI_API_KEY 尚未設定/.test(raw)) {
    return { status: 503, message: raw, retryable: false };
  }
  if (/invalid input syntax for type uuid/i.test(blob)) {
    return {
      status: 400,
      message: `${action}失敗:稿件編號不對,請再說一次「幫我排程」,不要重產`,
      retryable: true,
    };
  }
  if (/too many subrequests/i.test(blob)) {
    return {
      status: 503,
      message: `${action}失敗:這輪動作一次打太多次資料庫,請再送一次「幫我排程」,不要重講整段背景`,
      retryable: true,
    };
  }
  return { status: 502, message: `${action}失敗:${raw.slice(0, 240)}`, retryable: status >= 500 };
}

function requireApiKey(env: Env): string {
  if (!env.OPENAI_API_KEY) {
    throw new OpenAIError(500, 'OPENAI_API_KEY 尚未設定,請先執行 wrangler pages secret put OPENAI_API_KEY');
  }
  return env.OPENAI_API_KEY;
}

/** 社群配圖、頭像、參考圖編修。gpt-image-1 已停用,mini 將於 2026-12-01 下線 */
const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
/** 產圖前把場面寫具體。比發文用的小模型穩,失敗就沿用原提示 */
const DEFAULT_IMAGE_PROMPT_MODEL = 'gpt-6.1-sol';

export function imageModel(env: Env): string {
  return env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

export function imagePromptModel(env: Env): string {
  return env.OPENAI_IMAGE_PROMPT_MODEL?.trim() || DEFAULT_IMAGE_PROMPT_MODEL;
}

/** 呼叫 Chat Completions;jsonMode 開啟時強制回傳合法 JSON 物件 */
export async function chatComplete(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; jsonMode?: boolean; maxTokens?: number; timeoutMs?: number },
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
    signal: params.timeoutMs ? AbortSignal.timeout(params.timeoutMs) : undefined,
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
  params: { messages: ChatMessage[]; temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<T> {
  const raw = await chatComplete(env, { ...params, jsonMode: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new OpenAIError(502, `OpenAI 回傳非合法 JSON: ${raw.slice(0, 200)}`);
  }
}

type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
type ImageQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const IMAGE_PROMPT_POLISH =
  'You rewrite prompts for OpenAI image generation. Return only the final English prompt. ' +
  'Keep every constraint already present: composition, empty areas for later type, brand colors, materials, and bans on letters, numbers, captions, watermarks, and logos. ' +
  'Make the subject, pose, camera, lighting, and materials concrete enough to render once. ' +
  'Do not add slogans or any written characters. Do not explain.';

function unwrapImagePrompt(text: string): string {
  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * 產圖前用較強的 ChatGPT 文字模型把場面寫清楚。
 * 改寫失敗、太短、或把原提示砍掉時,沿用呼叫端已組好的提示。
 */
export async function polishImagePrompt(env: Env, prompt: string): Promise<string> {
  const trimmed = prompt.trim();
  if (trimmed.length < 24) return trimmed;
  try {
    const apiKey = requireApiKey(env);
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: imagePromptModel(env),
        reasoning_effort: 'low',
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: IMAGE_PROMPT_POLISH },
          { role: 'user', content: trimmed },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OpenAIError(res.status, text.slice(0, 300));
    }
    const data = await res.json() as { choices?: { message?: { content?: string | null } }[] };
    const next = unwrapImagePrompt(data.choices?.[0]?.message?.content ?? '');
    if (next.length < 80 || next.length < trimmed.length * 0.45) return trimmed;
    return next.slice(0, 6000);
  } catch (e) {
    console.error('[image] 提示詞改寫失敗,沿用原提示', e instanceof Error ? e.message : e);
    return trimmed;
  }
}

async function parseImageResponse(res: Response): Promise<Uint8Array> {
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

/** 產生圖片,回傳 JPEG bytes。提示詞先經較強文字模型改寫,再交給圖像模型 */
export async function generateImage(
  env: Env,
  params: { prompt: string; size?: ImageSize; quality?: ImageQuality; model?: string; polish?: boolean },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  const model = params.model ?? imageModel(env);
  const prompt = params.polish === false ? params.prompt : await polishImagePrompt(env, params.prompt);
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      size: params.size ?? '1024x1024',
      quality: params.quality ?? 'high',
      output_format: 'jpeg',
      n: 1,
    }),
  });
  return parseImageResponse(res);
}

/**
 * 帶參考圖產生圖片(images/edits 端點)。
 * 用途:品牌 logo 合成,或把真實系統截圖做成 B 端痛點海報(input_fidelity=high 保留 UI)。
 */
function referenceImageMime(bytes: Uint8Array): { mime: string; filename: string } {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', filename: 'reference.jpg' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', filename: 'reference.png' };
  }
  return { mime: 'image/png', filename: 'reference.png' };
}

export async function generateImageWithReference(
  env: Env,
  params: {
    prompt: string;
    reference: Uint8Array;
    size?: ImageSize;
    quality?: ImageQuality;
    model?: string;
    /** high=保留參考圖細節(logo/系統 UI);low=允許重構圖。2.5 圖像模型已內建高保真,不送這個欄位 */
    inputFidelity?: 'high' | 'low';
    polish?: boolean;
  },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  const { mime, filename } = referenceImageMime(params.reference);
  const model = params.model ?? imageModel(env);
  const prompt = params.polish === false ? params.prompt : await polishImagePrompt(env, params.prompt);
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', params.size ?? '1024x1024');
  form.append('quality', params.quality ?? 'high');
  form.append('output_format', 'jpeg');
  if (/^gpt-image-1(\.|$)/.test(model)) form.append('input_fidelity', params.inputFidelity ?? 'low');
  form.append('image[]', new Blob([params.reference as unknown as ArrayBuffer], { type: mime }), filename);
  const res = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  return parseImageResponse(res);
}
