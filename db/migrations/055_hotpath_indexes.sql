-- 工作台 / Threads desk / 內容列表熱路徑索引
CREATE INDEX IF NOT EXISTS idx_contents_brand_updated
  ON contents (brand_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contents_brand_platform
  ON contents (brand_id, target_platform);

CREATE INDEX IF NOT EXISTS idx_contents_slot_at
  ON contents ((generation_prompt_meta->>'slotAt'))
  WHERE generation_prompt_meta ? 'slotAt';

CREATE INDEX IF NOT EXISTS idx_content_assets_version_type
  ON content_assets (content_version_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_publishing_logs_job_created
  ON publishing_logs (publishing_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_brand_action
  ON activity_logs (brand_id, action, created_at DESC);
