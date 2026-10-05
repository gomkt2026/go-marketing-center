import type { Env } from './env';
import { claudeChatJson } from './claude';
import { chatCompleteJson, OpenAIError, type ChatMessage } from './openai';

/**
 * 三品牌發文文案：有 Claude 金鑰就走 Haiku，失敗才退回 OpenAI 文字模型。
 * 圖片仍走 OpenAI，不經過這裡。
 */
export async function socialChatJson<T>(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; maxTokens?: number },
): Promise<T> {
  if (!env.ANTHROPIC_API_KEY) return chatCompleteJson<T>(env, params);
  try {
    return await claudeChatJson<T>(env, params);
  } catch (e) {
    console.error('[social-llm] Claude 產文失敗，改走 OpenAI', e instanceof Error ? e.message : e);
    return chatCompleteJson<T>(env, params);
  }
}

function isLlmTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/**
 * 官網長文只要打一次模型。
 * 社群那條會先 Claude 再整篇重打 OpenAI，長 JSON 很容易超過前端等待時間。
 * 這裡優先用 OpenAI 的 json_mode；金鑰失效才改 Claude。逾時不再連打第二輪。
 */
export async function seoChatJson<T>(
  env: Env,
  params: { messages: ChatMessage[]; temperature?: number; maxTokens?: number },
): Promise<T> {
  const timed = { ...params, timeoutMs: 55_000, maxTokens: Math.min(params.maxTokens ?? 3200, 3200) };
  if (env.OPENAI_API_KEY) {
    try {
      return await chatCompleteJson<T>(env, timed);
    } catch (e) {
      const badJson = e instanceof OpenAIError && e.status === 502 && /非合法 JSON/.test(e.message);
      if (isLlmTimeout(e) || badJson || !env.ANTHROPIC_API_KEY) throw e;
      console.error('[seo-llm] OpenAI 產長文失敗，改走 Claude', e instanceof Error ? e.message : e);
    }
  }
  return claudeChatJson<T>(env, timed);
}
