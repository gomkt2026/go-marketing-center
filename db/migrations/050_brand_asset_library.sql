-- ============================================================================
-- Migration 050: 素材庫語意欄位
--   沿用 brand_assets.name / image_category / caption / used_in_threads_count。
--   只補角色、功能、畫面用途、狀態，以及「品牌素材」分類。
--   舊素材不刪、不改 ID；status 預設現行(active)；新欄位可為空。
-- ============================================================================

ALTER TABLE brand_assets
  ADD COLUMN IF NOT EXISTS asset_role TEXT,
  ADD COLUMN IF NOT EXISTS feature TEXT,
  ADD COLUMN IF NOT EXISTS usage_context TEXT,
  ADD COLUMN IF NOT EXISTS asset_status TEXT;

UPDATE brand_assets
SET asset_status = 'active'
WHERE asset_status IS NULL OR asset_status = '';

ALTER TABLE brand_assets ALTER COLUMN asset_status SET DEFAULT 'active';

ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_image_category_check;
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_image_category_check
  CHECK (image_category IS NULL OR image_category IN (
    'system_screenshot', 'real_photo', 'people', 'scene',
    'brand_collab', 'press_clipping', 'brand_identity', 'other'
  ));

ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_asset_role_check;
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_asset_role_check
  CHECK (asset_role IS NULL OR asset_role IN (
    'landlord', 'tenant', 'operator', 'staff', 'public', 'brand', 'none'
  ));

ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_asset_status_check;
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_asset_status_check
  CHECK (asset_status IS NULL OR asset_status IN ('active', 'legacy', 'disabled'));

CREATE INDEX IF NOT EXISTS idx_brand_assets_library_search
  ON brand_assets(brand_id, asset_status, image_category)
  WHERE asset_type = 'image';
