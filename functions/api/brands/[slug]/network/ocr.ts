import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { buildNetworkCardKey, putMedia } from '../../../../_shared/media';
import { upsertNetworkContact } from '../../../../_shared/network-contacts';
import { bytesToDataUrl, draftFromOcr, ocrBusinessCard } from '../../../../_shared/network-ocr';
import { toClientError } from '../../../../_shared/openai';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳名片照片', 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return error('請上傳名片照片', 400);
  const imageFile = file as File;
  if (imageFile.size === 0) return error('圖片是空的', 400);
  if (imageFile.size > MAX_IMAGE_SIZE) return error('圖片請壓在 8MB 以內', 400);
  const contentType = imageFile.type || 'image/jpeg';
  if (!contentType.startsWith('image/')) return error('請上傳 jpg / png / webp', 400);

  const bytes = new Uint8Array(await imageFile.arrayBuffer());
  const ext = EXT_BY_MIME[contentType] ?? 'jpg';
  let cardImageUrl: string | null = null;
  try {
    if (context.env.MEDIA) {
      cardImageUrl = await putMedia(context.env, buildNetworkCardKey(brand.slug, ext), bytes, contentType);
    }
  } catch {
    cardImageUrl = null;
  }

  try {
    const ocr = await ocrBusinessCard(context.env, bytesToDataUrl(bytes, contentType));
    if (!ocr.isBusinessCard) {
      return json({ skipped: true, reason: ocr.skipReason || '這張不像名片', ocr }, 200);
    }
    const { contact, created } = await upsertNetworkContact(context.env, brand.id, draftFromOcr(ocr, 'business_card', {
      sourceRef: imageFile.name || 'upload',
      cardImageUrl: cardImageUrl ?? undefined,
    }));
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'network.card.ocr',
      entityType: 'network_contact',
      entityId: contact.id,
      afterState: { name: contact.name, created, file: imageFile.name },
    });
    return json({ skipped: false, created, contact, ocr }, created ? 201 : 200);
  } catch (e) {
    const client = toClientError(e, '名片辨識');
    return error(client.message, client.status);
  }
};
