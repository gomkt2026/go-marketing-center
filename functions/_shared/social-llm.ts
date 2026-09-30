import type { Env } from './env';
import { claudeChatJson } from './claude';
import { chatCompleteJson, type ChatMessage } from './openai';

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
