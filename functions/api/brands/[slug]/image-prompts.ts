import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth, requireBrandAccess } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import {
  IMAGE_PROMPT_SLOTS,
  listBrandImagePrompts,
  resetBrandImagePrompt,
  saveBrandImagePrompt,
  type ImagePromptSlot,
} from '../../../_shared/image-prompts';
import { recordKnowledgeChange } from '../../../_shared/brand-knowledge';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access !== true) return access;
  const prompts = await listBrandImagePrompts(context.env, brand.id, slug);
  return json({ prompts });
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
    slot?: string;
    prompt?: string;
    reset?: boolean;
  };
  const slot = body.slot as ImagePromptSlot;
  if (!IMAGE_PROMPT_SLOTS.includes(slot)) return error('slot 必須是 design_style / photo_style / copy_spec', 400);

  try {
    const beforeList = await listBrandImagePrompts(context.env, brand.id, slug);
    const before = beforeList.find((p) => p.slot === slot)?.prompt ?? '';
    if (body.reset) await resetBrandImagePrompt(context.env, brand.id, slot);
    else await saveBrandImagePrompt(context.env, brand.id, slot, body.prompt ?? '');
    const prompts = await listBrandImagePrompts(context.env, brand.id, slug);
    const after = prompts.find((p) => p.slot === slot)?.prompt ?? '';
    const title = prompts.find((p) => p.slot === slot)?.title ?? slot;
    const draft = await recordKnowledgeChange(context.env, {
      brandId: brand.id,
      actor: auth,
      section: 'image_prompt',
      action: body.reset ? 'delete' : 'update',
      entityId: slot,
      label: body.reset ? `還原「${title}」為系統預設` : title,
      before,
      after,
    }).catch(() => null);
    return json({ prompts, draft });
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存失敗', 400);
  }
};
