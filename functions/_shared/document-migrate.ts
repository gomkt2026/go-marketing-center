import type { Env } from './env';
import { getSql } from './db';

export function isMissingDocumentCollateral(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?(key_points|extract_status|file_name|mime_type)["']? does not exist/i.test(msg)
    || /invalid input value for enum document_source_type.*dm/i.test(msg);
}

/** 套用 021 品牌 DM／簡報欄位。可重複執行。 */
export async function applyDocumentCollateralMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];

  await sql`ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'dm'`;
  steps.push('enum:document_source_type.dm');

  await sql`ALTER TABLE brand_documents ADD COLUMN IF NOT EXISTS key_points JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE brand_documents ADD COLUMN IF NOT EXISTS extract_status TEXT NOT NULL DEFAULT 'pending'`;
  await sql`ALTER TABLE brand_documents ADD COLUMN IF NOT EXISTS file_name TEXT`;
  await sql`ALTER TABLE brand_documents ADD COLUMN IF NOT EXISTS mime_type TEXT`;
  steps.push('columns:brand_documents');

  await sql`DO $$ BEGIN
    ALTER TABLE brand_documents
      ADD CONSTRAINT brand_documents_extract_status_check
      CHECK (extract_status IN ('pending', 'ready', 'failed'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  steps.push('check:extract_status');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_brand_documents_collateral
    ON brand_documents(brand_id, source_type, created_at DESC)
    WHERE source_type IN ('dm', 'presentation')
  `;
  steps.push('index:collateral');

  return steps;
}
