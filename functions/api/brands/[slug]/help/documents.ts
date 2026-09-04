import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { putMedia } from '../../../../_shared/media';
import { logActivity } from '../../../../_shared/activity';
import { ensureProductHelp } from '../../../../_shared/product-help-migrate';
import { extractCsDocumentText, classifyCsFile } from '../../../../_shared/cs-knowledge';
import {
  isValidHelpRole, listCsDocuments, replaceDocumentRoles, parsePagePaths, withProductHelp,
} from '../../../../_shared/product-help';
import { getSql } from '../../../../_shared/db';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(['md', 'txt', 'pdf', 'docx']);

function extFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  await ensureProductHelp(context.env);
  const documents = await listCsDocuments(context.env, brand.id);
  return json({ documents });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  await ensureProductHelp(context.env);

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
  if (!file || typeof file === 'string') return error('請上傳 MD、PDF 或 Word（.docx）', 400);
  const upload = file as File;
  if (upload.size === 0) return error('檔案是空的', 400);
  if (upload.size > MAX_FILE_SIZE) return error('檔案過大，請壓在 10MB 以內', 400);

  const ext = extFromName(upload.name);
  if (!ext || !ALLOWED_EXT.has(ext)) return error('請上傳 .md、.txt、.pdf 或 .docx', 400);
  if (classifyCsFile(upload.name, upload.type) === 'unsupported') {
    return error('舊版 .doc 請另存 .docx，或改傳 MD／PDF', 400);
  }

  const rolesRaw = String(form.get('roles') ?? '').trim();
  const roles = rolesRaw.split(/[\s,]+/).map((r) => r.trim()).filter((r) => isValidHelpRole(slug, r));
  if (!roles.length) return error('請至少選擇一個適用角色', 400);

  const title = String(form.get('title') ?? '').trim() || upload.name.replace(/\.[^.]+$/, '') || '客服說明';
  const pagePaths = parsePagePaths(String(form.get('pagePaths') ?? ''));

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await upload.arrayBuffer());
  } catch (e) {
    return error(e instanceof Error ? e.message : '讀取檔案失敗', 400);
  }

  const mimeType = upload.type
    || (ext === 'pdf' ? 'application/pdf'
      : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain');

  const key = `cs-docs/${brand.slug}/${crypto.randomUUID()}.${ext}`;
  const fileUrl = await putMedia(context.env, key, bytes, mimeType);
  const extracted = await extractCsDocumentText({ bytes, fileName: upload.name, mimeType });

  const document = await withProductHelp(context.env, async () => {
    const sql = getSql(context.env);
    const rows = await sql`
      INSERT INTO cs_knowledge_documents (
        brand_id, title, file_url, file_name, mime_type,
        extracted_text, extract_status, publish_status, page_paths, uploaded_by
      ) VALUES (
        ${brand.id}::uuid, ${title}, ${fileUrl}, ${upload.name || null}, ${mimeType},
        ${extracted.text || extracted.error || null}, ${extracted.status}, 'draft',
        ${JSON.stringify(pagePaths)}::jsonb, ${auth.id}::uuid
      ) RETURNING *
    `;
    const id = String((rows[0] as { id: string }).id);
    await replaceDocumentRoles(context.env, id, roles);
    return (await listCsDocuments(context.env, brand.id)).find((d) => d.id === id)!;
  });

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'help.document.uploaded',
    entityType: 'cs_knowledge_document',
    entityId: document.id,
    afterState: { title, roles, extractStatus: extracted.status },
  });

  return json({ document, extractError: extracted.error ?? null });
};
