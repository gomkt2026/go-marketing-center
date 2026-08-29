import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { buildBrandDocumentKey, putMedia } from '../../../../_shared/media';
import { logActivity } from '../../../../_shared/activity';
import { applyDocumentCollateralMigration, isMissingDocumentCollateral } from '../../../../_shared/document-migrate';
import {
  finalizeCollateralExtract, isCollateralType, persistCollateralSourceType,
  toBrandDocument, type CollateralSourceType,
} from '../../../../_shared/documents';

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
};

function extFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.gif')) return 'gif';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.ppt')) return 'ppt';
  return null;
}

async function listDocuments(env: Env, brandId: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT * FROM brand_documents
    WHERE brand_id = ${brandId}::uuid
    ORDER BY created_at DESC
  `;
  return (rows as Record<string, unknown>[]).map(toBrandDocument);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    return json({ documents: await listDocuments(context.env, brand.id) });
  } catch (e) {
    if (!isMissingDocumentCollateral(e)) throw e;
    await applyDocumentCollateralMigration(context.env);
    return json({ documents: await listDocuments(context.env, brand.id) });
  }
};

// POST /api/brands/:slug/documents
// multipart: file、title(選填)、sourceType=dm|presentation、notes(選填)
// 先存 R2 + 列,再 waitUntil 抽賣點,避免大 PDF 在回應用前就把 Worker 撐到 500
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  try {
    await applyDocumentCollateralMigration(context.env);
  } catch (e) {
    console.error('[documents] migrate', e instanceof Error ? e.message : e);
  }

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳', 400);
  }

  const file = form.get('file');
  const sourceTypeRaw = String(form.get('sourceType') ?? '').trim();
  const titleRaw = String(form.get('title') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  if (!isCollateralType(sourceTypeRaw)) return error('sourceType 必須是 dm 或 presentation', 400);
  const sourceType: CollateralSourceType = sourceTypeRaw;
  if (!file || typeof file === 'string') return error('請上傳 DM 圖片、PDF 或 PPTX', 400);

  const upload = file as File;
  if (upload.size === 0) return error('檔案是空的', 400);
  if (upload.size > MAX_FILE_SIZE) return error('檔案過大,請壓在 40MB 以內', 400);

  const mimeType = upload.type || 'application/octet-stream';
  const ext = ALLOWED[mimeType] ?? extFromName(upload.name);
  if (!ext) return error('請上傳 JPG／PNG／WebP、PDF、PPT 或 PPTX', 400);

  const storedSourceType = persistCollateralSourceType(sourceType, ext);
  const pendingSummary = notes || '已存檔,正在抽出賣點。';

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await upload.arrayBuffer());
  } catch (e) {
    return error(e instanceof Error ? e.message : '讀取檔案失敗', 400);
  }

  const storedType = ALLOWED[mimeType]
    ? mimeType
    : ext === 'pdf' ? 'application/pdf'
      : ext === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : ext === 'ppt' ? 'application/vnd.ms-powerpoint'
          : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  try {
    const key = buildBrandDocumentKey(brand.slug, ext);
    const fileUrl = await putMedia(context.env, key, bytes, storedType);
    const title = titleRaw || upload.name.replace(/\.[^.]+$/, '') || (sourceType === 'dm' ? '品牌 DM' : '品牌簡報');

    const sql = getSql(context.env);
    const insert = async () => sql`
      INSERT INTO brand_documents (
        brand_id, source_type, title, file_url, raw_content, key_points,
        extract_status, file_name, mime_type, uploaded_by
      ) VALUES (
        ${brand.id}::uuid, ${storedSourceType}, ${title}, ${fileUrl}, ${pendingSummary},
        '[]'::jsonb, 'pending', ${upload.name || null}, ${storedType}, ${auth.id}::uuid
      ) RETURNING *
    `;

    let rows;
    try {
      rows = await insert();
    } catch (e) {
      if (!isMissingDocumentCollateral(e)) throw e;
      await applyDocumentCollateralMigration(context.env);
      rows = await insert();
    }

    const document = toBrandDocument(rows[0] as Record<string, unknown>);
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'brand_document.uploaded',
      entityType: 'brand_document',
      entityId: document.id,
      afterState: { sourceType: storedSourceType, title },
    });

    const extractBytes = ext === 'pdf' ? bytes.slice(0, 2 * 1024 * 1024) : bytes;
    context.waitUntil(finalizeCollateralExtract(context.env, document.id, {
      bytes: extractBytes, mimeType: storedType, fileName: upload.name || `檔案.${ext}`, kind: sourceType, notes,
    }).catch((e) => {
      console.error('[documents] extract', e instanceof Error ? e.message : e);
    }));

    return json({ document }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '上傳失敗';
    console.error('[documents] upload', msg);
    return error(msg, 500);
  }
};
