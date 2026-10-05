import type { Env } from './env';
import type { ChatContentPart, ChatMessage } from './openai';
import { OpenAIError } from './openai';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
/** 發文文案用 Haiku：輸入 $1 / 輸出 $5（每百萬 token），夠寫繁中社群貼文 */
const DEFAULT_MODEL = 'claude-haiku-4-5';

type ClaudeBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } | { type: 'base64'; media_type: string; data: string } };

function toClaudeContent(content: ChatMessage['content']): string | ClaudeBlock[] {
  if (typeof content === 'string') return content;
  return content.map((part: ChatContentPart): ClaudeBlock => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const url = part.image_url.url;
    const dataUrl = url.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrl) {
      return { type: 'image', source: { type: 'base64', media_type: dataUrl[1], data: dataUrl[2] } };
    }
    return { type: 'image', source: { type: 'url', url } };
  });
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) return body.slice(start, end + 1);
  return body;
}

/** 發文文案。失敗拋 OpenAIError，讓呼叫端可以改走 OpenAI。 */
export async function claudeChatJson<T>(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<T> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new OpenAIError(500, 'ANTHROPIC_API_KEY 尚未設定');
  }
  const system = params.messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')))
    .filter(Boolean)
    .join('\n\n');
  const messages = params.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: toClaudeContent(m.content) }));

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_TEXT_MODEL ?? DEFAULT_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.8,
      ...(system ? { system: `${system}\n\n只回傳一個 JSON 物件，不要 markdown。` } : {}),
      messages,
    }),
    signal: params.timeoutMs ? AbortSignal.timeout(params.timeoutMs) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenAIError(res.status, `Claude chat 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { content?: Array<{ type?: string; text?: string }> };
  const raw = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
  if (!raw) throw new OpenAIError(502, 'Claude 回傳空內容');
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    throw new OpenAIError(502, `Claude 回傳非合法 JSON: ${raw.slice(0, 200)}`);
  }
}
