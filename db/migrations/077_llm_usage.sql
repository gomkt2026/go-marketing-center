-- 品牌 AI 文字與產圖花費。上線前的呼叫沒有列在這張表。
-- 執行：psql "$DATABASE_URL" -f db/migrations/077_llm_usage.sql

CREATE TABLE IF NOT EXISTS llm_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  feature        TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  image_count    INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(14, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_brand_time
  ON llm_usage (brand_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_time
  ON llm_usage (occurred_at DESC);
