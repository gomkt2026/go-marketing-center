CREATE TABLE IF NOT EXISTS brand_seo_topics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  angle           TEXT NOT NULL,
  primary_keyword TEXT,
  related_terms   JSONB NOT NULL DEFAULT '[]',
  category        TEXT,
  search_intent   TEXT,
  audience        TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_seo_topics_brand ON brand_seo_topics(brand_id);
