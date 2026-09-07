import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { draftFromCsvRow, parseNetworkCsv, upsertNetworkContact } from '../../../../_shared/network-contacts';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let text = '';
  const contentType = context.request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await context.request.formData() as unknown as FormData;
    const file = form.get('file');
    if (!file || typeof file === 'string') return error('請上傳 CSV', 400);
    text = await (file as File).text();
  } else {
    const body = await context.request.json().catch(() => ({})) as { csv?: string };
    text = body.csv ?? '';
  }
  if (!text.trim()) return error('CSV 是空的', 400);

  const rows = parseNetworkCsv(text);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const draft = draftFromCsvRow(row, 'csv-upload');
    if (!draft) {
      skipped += 1;
      continue;
    }
    const result = await upsertNetworkContact(context.env, brand.id, draft);
    if (result.created) created += 1;
    else updated += 1;
  }

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'network.contact.imported',
    entityType: 'network_contact',
    afterState: { source: 'csv', created, updated, skipped },
  });
  return json({ created, updated, skipped, total: rows.length });
};
