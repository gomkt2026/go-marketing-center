import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth, requireBrandAccess } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import {
  listBrandPostingSlots,
  replaceBrandPostingSlots,
  summarizeFrequency,
  type PostingSlotKind,
  type PostingSlotPlatform,
} from '../../../_shared/posting-slots';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access !== true) return access;

  const slots = await listBrandPostingSlots(context.env, brand.id);
  return json({ slots, frequency: summarizeFrequency(slots) });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access !== true) return access;

  const body = await context.request.json().catch(() => ({})) as {
    slots?: Array<{ platform?: string; hourTw?: number; slotKind?: string; enabled?: boolean }>;
  };
  if (!Array.isArray(body.slots)) return error('slots 必須是陣列', 400);

  try {
    const slots = await replaceBrandPostingSlots(
      context.env,
      brand.id,
      body.slots.map((s) => ({
        platform: s.platform as PostingSlotPlatform,
        hourTw: Number(s.hourTw),
        slotKind: s.slotKind as PostingSlotKind,
        enabled: s.enabled !== false,
      })),
    );
    return json({ slots, frequency: summarizeFrequency(slots) });
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存失敗', 400);
  }
};
