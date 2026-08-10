import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { deleteVoice } from '../../../_shared/elevenlabs';

// DELETE /api/podcast/guests/:id:刪除來賓(含 ElevenLabs cloned voice 與 R2 樣本)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const guestId = context.params.id as string;
  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, voice_id, voice_sample_key FROM podcast_guests WHERE id = ${guestId}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這位來賓', 404);
  const guest = rows[0] as { id: string; voice_id: string | null; voice_sample_key: string | null };

  // 先清 ElevenLabs 的 cloned voice(失敗只記 log,不擋刪除)
  if (guest.voice_id) {
    try {
      await deleteVoice(context.env, guest.voice_id);
    } catch (e) {
      console.error(`[podcast] 刪除 ElevenLabs voice ${guest.voice_id} 失敗`, e);
    }
  }
  if (guest.voice_sample_key && context.env.MEDIA) {
    await context.env.MEDIA.delete(guest.voice_sample_key).catch(() => {});
  }

  await sql`DELETE FROM podcast_guests WHERE id = ${guestId}::uuid`;
  return json({ ok: true });
};
