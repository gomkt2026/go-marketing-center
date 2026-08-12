-- ============================================================================
-- Migration 007: 品牌智慧圖片素材庫
--   讓 brand_assets 可以承載品牌上傳的系統畫面截圖/實拍照片/人物/場景/合作品牌照片,
--   並記錄被 Threads「圖片靈感」貼文使用的次數與時間,供排程輪替挑選最少被用過的素材。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/007_brand_asset_images.sql
-- ============================================================================

ALTER TABLE brand_assets
  ADD COLUMN IF NOT EXISTS image_category TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS used_in_threads_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id);

DO $$ BEGIN
  ALTER TABLE brand_assets
    ADD CONSTRAINT brand_assets_image_category_check
    CHECK (image_category IS NULL OR image_category IN ('system_screenshot', 'real_photo', 'people', 'scene', 'brand_collab', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 排程挑選「最少用過/最久沒用過」的圖片素材時會用到
CREATE INDEX IF NOT EXISTS idx_brand_assets_image_rotation
  ON brand_assets(brand_id, used_in_threads_count, last_used_at)
  WHERE asset_type = 'image';
