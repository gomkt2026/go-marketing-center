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
  return { status: 502, message: `${action}失敗:${raw.slice(0, 240)}`, retryable: status >= 500 };
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

type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
type ImageQuality = 'medium' | 'high';

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

/** 產生圖片,回傳 JPEG bytes */
export async function generateImage(
  env: Env,
  params: { prompt: string; size?: ImageSize; quality?: ImageQuality },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
      prompt: params.prompt,
      size: params.size ?? '1024x1024',
      // 預設 medium(快);要在圖上渲染中文字的設計圖用 high,避免錯字
      quality: params.quality ?? 'medium',
      // IG Graph API 的 image_url 只接受 JPEG,統一輸出 JPEG(檔案也較小)
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
    /** high=保留參考圖細節(logo/系統 UI);low=允許重構圖 */
    inputFidelity?: 'high' | 'low';
  },
): Promise<Uint8Array> {
  const apiKey = requireApiKey(env);
  const { mime, filename } = referenceImageMime(params.reference);
  const form = new FormData();
  form.append('model', env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1');
  form.append('prompt', params.prompt);
  form.append('size', params.size ?? '1024x1024');
  form.append('quality', params.quality ?? 'medium');
  form.append('output_format', 'jpeg');
  form.append('input_fidelity', params.inputFidelity ?? 'high');
  form.append('image[]', new Blob([params.reference as unknown as ArrayBuffer], { type: mime }), filename);
  const res = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  return parseImageResponse(res);
}
