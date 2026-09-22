-- ============================================================================
-- Migration 052: 素材角色改為品牌各自一份
--   框架共用,Homigo 的 landlord/tenant 不再當成全品牌角色。
--   TaskGo / Washgo 可用自己的工班、業主、店主、司機等角色。
-- ============================================================================

ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_asset_role_check;
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_asset_role_check
  CHECK (asset_role IS NULL OR asset_role IN (
    'landlord', 'tenant', 'operator',
    'crew', 'client', 'shop',
    'customer', 'shop_owner', 'driver',
    'staff', 'public', 'brand', 'none'
  ));
