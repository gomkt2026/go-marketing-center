import type { Env } from './env';
import { getSql } from './db';

export function isMissingPressRelation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?press_(coverages|releases)["']? does not exist/i.test(msg)
    || /type ["']?press_(coverage_status|discovery_source|release_status)["']? does not exist/i.test(msg);
}

/** 套用 014 媒體報導／新聞稿 schema + 種子。可重複執行。 */
export async function applyPressMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];

  await sql`DO $$ BEGIN
    CREATE TYPE press_coverage_status AS ENUM ('inbox', 'published', 'syndicated', 'dismissed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  steps.push('type:press_coverage_status');

  await sql`DO $$ BEGIN
    CREATE TYPE press_discovery_source AS ENUM ('manual', 'scheduler');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  steps.push('type:press_discovery_source');

  await sql`DO $$ BEGIN
    CREATE TYPE press_release_status AS ENUM ('draft', 'pending_review', 'approved', 'final');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  steps.push('type:press_release_status');

  await sql`ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'press_article'`;
  await sql`ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'press_release'`;
  steps.push('enum:document_source_type');

  await sql`
    CREATE TABLE IF NOT EXISTS press_releases (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      title             TEXT NOT NULL,
      body              TEXT NOT NULL,
      status            press_release_status NOT NULL DEFAULT 'draft',
      embargo_on        DATE,
      review_note       TEXT,
      created_by        UUID REFERENCES users(id),
      updated_by        UUID REFERENCES users(id),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_press_releases_brand ON press_releases(brand_id, status, updated_at DESC)`;
  await sql`DROP TRIGGER IF EXISTS trg_press_releases_updated_at ON press_releases`;
  await sql`CREATE TRIGGER trg_press_releases_updated_at BEFORE UPDATE ON press_releases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
  steps.push('table:press_releases');

  await sql`
    CREATE TABLE IF NOT EXISTS press_coverages (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id              UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      press_release_id      UUID REFERENCES press_releases(id) ON DELETE SET NULL,
      story_key             TEXT NOT NULL,
      outlet                TEXT NOT NULL,
      headline              TEXT NOT NULL,
      article_url           TEXT,
      published_on          DATE,
      status                press_coverage_status NOT NULL DEFAULT 'inbox',
      discovery_source      press_discovery_source NOT NULL DEFAULT 'manual',
      summary               TEXT,
      key_quotes            JSONB NOT NULL DEFAULT '[]',
      claimable_facts       JSONB NOT NULL DEFAULT '[]',
      is_primary            BOOLEAN NOT NULL DEFAULT true,
      related_brand_slugs   JSONB NOT NULL DEFAULT '[]',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_press_coverages_brand ON press_coverages(brand_id, status, published_on DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_press_coverages_story ON press_coverages(brand_id, story_key)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_press_coverages_url ON press_coverages(brand_id, article_url) WHERE article_url IS NOT NULL`;
  await sql`DROP TRIGGER IF EXISTS trg_press_coverages_updated_at ON press_coverages`;
  await sql`CREATE TRIGGER trg_press_coverages_updated_at BEFORE UPDATE ON press_coverages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
  steps.push('table:press_coverages');

  await sql`ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_image_category_check`;
  await sql`
    ALTER TABLE brand_assets
      ADD CONSTRAINT brand_assets_image_category_check
      CHECK (image_category IS NULL OR image_category IN (
        'system_screenshot', 'real_photo', 'people', 'scene',
        'brand_collab', 'press_clipping', 'other'
      ))
  `;
  steps.push('constraint:brand_assets.press_clipping');

  await sql`
    INSERT INTO press_coverages (
      brand_id, story_key, outlet, headline, article_url, published_on,
      status, discovery_source, summary, key_quotes, claimable_facts, is_primary, related_brand_slugs
    )
    SELECT b.id, v.story_key, v.outlet, v.headline, v.article_url, v.published_on::date,
           v.status::press_coverage_status, 'manual', v.summary,
           v.key_quotes::jsonb, v.claimable_facts::jsonb, v.is_primary, v.related::jsonb
    FROM brands b
    JOIN (VALUES
      ('taskgo', 'taskgo-2025-10-launch', '工商時報',
       '數位工具平民化「匠管 Task Go」助攻工班資訊透明 打破紙本施工紀錄迷思',
       'https://www.ctee.com.tw/news/20251021701575-431206', '2025-10-21', 'published',
       '匠管推出 Task Go,主打簡單、即時、透明。',
       '["Task Go 的初衷就是要讓沒有 IT 背景的師傅,也能用得安心、用得開心。"]',
       '["簡單、即時、透明","現場拍照上傳與語音紀錄","一個月免費試用"]', true, '[]'),
      ('homigo', 'homigo-2026-07-launch', '民眾日報',
       '匠管攜手達觀跨足PropTech市場！ 推出Homigo智慧租屋管理平台',
       'https://tw.news.yahoo.com/%E5%8C%A0%E7%AE%A1%E6%94%9C%E6%89%8B%E9%81%94%E8%A7%80%E8%B7%A8%E8%B6%B3proptech%E5%B8%82%E5%A0%B4-%E6%8E%A8%E5%87%BAhomigo%E6%99%BA%E6%85%A7%E7%A7%9F%E5%B1%8B%E7%AE%A1%E7%90%86%E5%B9%B3%E5%8F%B0-080153567.html',
       '2026-07-01', 'published',
       '匠管攜手達觀推出 Homigo,開發經驗源自 TaskGo。',
       '["未來企業競爭將不僅是系統功能,而是管理能力的數位化。"]',
       '["匠管攜手達觀推出 Homigo","房東房客免下載 App","開發經驗源自 TaskGo"]', true, '["taskgo"]')
    ) AS v(slug, story_key, outlet, headline, article_url, published_on, status, summary, key_quotes, claimable_facts, is_primary, related)
      ON b.slug = v.slug
    WHERE NOT EXISTS (
      SELECT 1 FROM press_coverages pc WHERE pc.brand_id = b.id AND pc.article_url = v.article_url
    )
  `;
  await sql`
    INSERT INTO press_releases (brand_id, title, body, status, embargo_on)
    SELECT b.id,
      '匠管打造生活工程管理生態系,Washgo 再補一塊拼圖',
      '匠管今日宣布推出面向洗衣、乾洗營運的數位化平台 Washgo,以 LINE 讓洗滌業真正用得起數位化,首個落地場域為洗楽。文中僅陳述導入事實,不放洗楽執行長引言。定稿前不可宣稱已被媒體報導。',
      'pending_review', DATE '2026-08-16'
    FROM brands b
    WHERE b.slug = 'washgo'
      AND NOT EXISTS (
        SELECT 1 FROM press_releases pr WHERE pr.brand_id = b.id AND pr.title LIKE '匠管打造生活工程管理生態系%'
      )
  `;
  await sql`
    INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
    SELECT b.id, b.current_version_id, v.rule_type, v.statement, v.condition_note, v.verification, v.sort_order
    FROM brands b
    JOIN (VALUES
      ('taskgo', 'can_claim', '工商時報、三立曾報導 TaskGo 工班數位回報', '可引用媒體名與已見報事實,不可把轉載數說成全台專訪', 'verified', 20),
      ('homigo', 'can_claim', '匠管攜手達觀推出 Homigo,見報於民眾日報／Yahoo', '提及 300 萬租屋人口必須帶「根據市場統計」', 'verified', 20),
      ('washgo', 'cannot_claim', '不可宣稱 Washgo 已被媒體報導', '新聞稿尚未見報前絕對禁止', 'verified', 20)
    ) AS v(slug, rule_type, statement, condition_note, verification, sort_order)
      ON b.slug = v.slug
    WHERE NOT EXISTS (
      SELECT 1 FROM brand_rules r WHERE r.brand_id = b.id AND r.statement = v.statement
    )
  `;
  steps.push('seed:press');
  return steps;
}
