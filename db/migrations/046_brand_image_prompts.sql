-- ============================================================================
-- Migration 046: 品牌可自行編輯的產圖 Prompt
--   品牌智慧「產圖 Prompt」分頁讀寫這張表;沒有列就退回程式內建預設。
-- 可安全重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_image_prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_image_prompts_slot_check CHECK (slot IN ('design_style', 'photo_style', 'copy_spec')),
  UNIQUE (brand_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_brand_image_prompts_brand ON brand_image_prompts(brand_id);
