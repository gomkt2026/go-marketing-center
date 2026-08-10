import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { createGuestProfile } from '../../../_shared/podcast';

const MAX_SAMPLE_SIZE = 25 * 1024 * 1024; // 25MB

// GET /api/podcast/guests:來賓列表
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, name, title, bio, voice_id, status, error_message, consent_confirmed_at, created_at
    FROM podcast_guests
    ORDER BY created_at DESC LIMIT 100
  `;
  return json({ guests: rowsToCamel(rows as Record<string, unknown>[]) });
};

// POST /api/podcast/guests:建立來賓並複製聲音
// multipart form:name, title(選填), bio, consentConfirmed=true, audio(聲音樣本)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳', 400);
  }

  const name = String(form.get('name') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const bio = String(form.get('bio') ?? '').trim();
  const consentConfirmed = String(form.get('consentConfirmed') ?? '') === 'true';
  const audio = form.get('audio');

  if (!consentConfirmed) return error('必須勾選「已取得受訪者本人同意複製聲音」才能建立來賓', 400);
  if (!name || !bio) return error('姓名與經歷/故事資料為必填', 400);
  if (!audio || typeof audio === 'string') return error('請上傳聲音樣本(mp3 / wav / m4a,建議 1 分鐘以上)', 400);

  const file = audio as File;
  if (file.size === 0) return error('聲音樣本是空的', 400);
  if (file.size > MAX_SAMPLE_SIZE) return error('聲音樣本過大,請壓在 25MB 以內', 400);

  try {
    const guest = await createGuestProfile(context.env, {
      name,
      title: title || undefined,
      bio,
      audioBytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name || 'sample.mp3',
      mimeType: file.type || 'audio/mpeg',
      consentConfirmed,
    });
    return json({ guest }, 201);
  } catch (e) {
    return error(`建立來賓失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
