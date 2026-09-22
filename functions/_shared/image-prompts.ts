import type { Env } from './env';
import { getSql } from './db';
import {
  defaultCopyImageSpec,
  defaultDesignImageStyle,
  defaultPhotoImageStyle,
} from './prompts';

export const IMAGE_PROMPT_SLOTS = ['design_style', 'photo_style', 'copy_spec'] as const;
export type ImagePromptSlot = (typeof IMAGE_PROMPT_SLOTS)[number];

export interface BrandImagePrompt {
  slot: ImagePromptSlot;
  title: string;
  hint: string;
  prompt: string;
  isCustom: boolean;
  updatedAt: string | null;
}

export interface BrandImagePromptPack {
  designStyle: string;
  photoStyle: string;
  copySpec: string;
}

const SLOT_META: Record<ImagePromptSlot, { title: string; hint: string }> = {
  design_style: {
    title: '圖片模型風格 Prompt',
    hint: '會附加在每次生圖後面，決定色票、構圖、人物與禁止事項。品牌主可直接改這段，不必等系統管理員改程式。',
  },
  photo_style: {
    title: '生活照／無系統卡風格',
    hint: '沒有系統畫面卡、比較靠近現場瞬間時用這段。通常比上一則更單純。',
  },
  copy_spec: {
    title: '文案怎麼描述畫面',
    hint: '告訴文案 AI 要怎麼寫 imagePrompt：構圖順序、情境、禁止畫字。可寫完整 "imagePrompt": "…" 或直接寫說明。',
  },
};

function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?brand_image_prompts["']? does not exist/i.test(msg);
}

export async function ensureImagePromptTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS brand_image_prompts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      slot        TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand_id, slot)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_brand_image_prompts_brand ON brand_image_prompts(brand_id)`;
}

export function defaultPromptForSlot(slug: string, slot: ImagePromptSlot): string {
  if (slot === 'photo_style') return defaultPhotoImageStyle(slug);
  if (slot === 'copy_spec') return defaultCopyImageSpec(slug);
  return defaultDesignImageStyle(slug);
}

export async function listBrandImagePrompts(env: Env, brandId: string, slug: string): Promise<BrandImagePrompt[]> {
  try {
    await ensureImagePromptTable(env);
  } catch (e) {
    console.error('[image-prompts] 建表失敗', e);
  }
  const sql = getSql(env);
  let rows: Array<{ slot: string; prompt: string; updated_at: string }> = [];
  try {
    rows = await sql`
      SELECT slot, prompt, updated_at
      FROM brand_image_prompts
      WHERE brand_id = ${brandId}::uuid
    ` as Array<{ slot: string; prompt: string; updated_at: string }>;
  } catch (e) {
    if (!isMissingTable(e)) console.error('[image-prompts] 讀取失敗', e);
  }
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  return IMAGE_PROMPT_SLOTS.map((slot) => {
    const saved = bySlot.get(slot);
    const fallback = defaultPromptForSlot(slug, slot);
    const prompt = saved?.prompt?.trim() || fallback;
    return {
      slot,
      title: SLOT_META[slot].title,
      hint: SLOT_META[slot].hint,
      prompt,
      isCustom: !!saved?.prompt?.trim() && saved.prompt.trim() !== fallback,
      updatedAt: saved?.updated_at ?? null,
    };
  });
}

export async function loadBrandImagePromptPack(env: Env, brandId: string, slug: string): Promise<BrandImagePromptPack> {
  let id = brandId;
  if (!id) {
    const sql = getSql(env);
    const rows = await sql`SELECT id FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
    id = (rows[0] as { id: string } | undefined)?.id ?? '';
  }
  if (!id) {
    return {
      designStyle: defaultDesignImageStyle(slug),
      photoStyle: defaultPhotoImageStyle(slug),
      copySpec: defaultCopyImageSpec(slug),
    };
  }
  const list = await listBrandImagePrompts(env, id, slug);
  const pick = (slot: ImagePromptSlot) => list.find((p) => p.slot === slot)?.prompt || defaultPromptForSlot(slug, slot);
  return {
    designStyle: pick('design_style'),
    photoStyle: pick('photo_style'),
    copySpec: pick('copy_spec'),
  };
}

export async function saveBrandImagePrompt(
  env: Env,
  brandId: string,
  slot: ImagePromptSlot,
  prompt: string,
): Promise<void> {
  if (!IMAGE_PROMPT_SLOTS.includes(slot)) throw new Error('未知的 prompt 欄位');
  const text = prompt.trim();
  if (text.length < 20) throw new Error('Prompt 太短，請寫完整風格說明');
  if (text.length > 12000) throw new Error('Prompt 太長（上限 12000 字）');
  await ensureImagePromptTable(env);
  const sql = getSql(env);
  await sql`
    INSERT INTO brand_image_prompts (brand_id, slot, prompt, updated_at)
    VALUES (${brandId}::uuid, ${slot}, ${text}, now())
    ON CONFLICT (brand_id, slot) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = now()
  `;
}

export async function resetBrandImagePrompt(env: Env, brandId: string, slot: ImagePromptSlot): Promise<void> {
  if (!IMAGE_PROMPT_SLOTS.includes(slot)) throw new Error('未知的 prompt 欄位');
  await ensureImagePromptTable(env);
  const sql = getSql(env);
  await sql`DELETE FROM brand_image_prompts WHERE brand_id = ${brandId}::uuid AND slot = ${slot}`;
}
