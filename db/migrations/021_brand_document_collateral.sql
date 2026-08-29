-- ============================================================================
-- Migration 021: 品牌 DM／簡報
--   讓 brand_documents 承載各品牌上傳的 DM 與簡報,抽出賣點後給社群發文引用。
--   可安全重複執行。
-- ============================================================================

ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'dm';

ALTER TABLE brand_documents
  ADD COLUMN IF NOT EXISTS key_points JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extract_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

DO $$ BEGIN
  ALTER TABLE brand_documents
    ADD CONSTRAINT brand_documents_extract_status_check
    CHECK (extract_status IN ('pending', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_brand_documents_collateral
  ON brand_documents(brand_id, source_type, created_at DESC)
  WHERE source_type IN ('dm', 'presentation');
