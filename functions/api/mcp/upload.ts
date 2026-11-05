import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { json, error } from '../../_shared/response';
import { ensureMcpTables } from '../../_shared/mcp-auth';
import { saveUploadedVideo } from '../../_shared/mcp-tools';

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'content-type, authorization, x-api-key');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new Response(response.body, { status: response.status, headers });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (context.request.method !== 'POST') return cors(error('請用 POST 上傳影片', 405));

  const token = new URL(context.request.url).searchParams.get('token')?.trim() ?? '';
  if (!token) return cors(error('缺少上傳連結', 401));

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return cors(error('請用 multipart/form-data，欄位名 file', 400));
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return cors(error('請上傳影片檔', 400));

  try {
    await ensureMcpTables(context.env);
    const saved = await saveUploadedVideo(context.env, token, file as File);
    if (!saved.ok) return cors(error(saved.error, saved.status));
    return cors(json({
      ok: true,
      summary: `已把「${saved.name}」存進素材庫。`,
      asset: { id: saved.assetId, name: saved.name, fileUrl: saved.fileUrl, assetType: 'video' },
    }, 201));
  } catch (e) {
    console.error('[mcp-upload]', e);
    return cors(error('影片沒有存進素材庫', 500));
  }
};
