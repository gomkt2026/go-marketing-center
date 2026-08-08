import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { advanceMeetingOnce } from '../../../_shared/meeting-ai';

// 直播會議:生成下一位小編的單則發言(前端每 12-18 秒輪詢一次)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const meetingId = context.params.id as string;
  try {
    const result = await advanceMeetingOnce(context.env, meetingId);
    if (!result) return json({ message: null, agent: null, done: true });

    const p = result.agent.persona;
    return json({
      message: {
        id: result.messageId,
        meetingId,
        senderType: 'ai_agent',
        senderAgentId: result.agent.id,
        content: result.content,
        metadata: { emotion: result.emotion },
        createdAt: new Date().toISOString(),
      },
      agent: {
        id: result.agent.id,
        displayName: result.agent.displayName,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl ?? null,
      },
    }, 201);
  } catch (e) {
    return error(`發言生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
