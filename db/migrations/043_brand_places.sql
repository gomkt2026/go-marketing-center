-- 三品牌場域據點（評估 3D 球體用）。可重複執行。

CREATE TABLE IF NOT EXISTS brand_places (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'property',
  name            TEXT NOT NULL,
  address         TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  external_ref    TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  note            TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  geocode_status  TEXT NOT NULL DEFAULT 'ready',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_places_kind_check
    CHECK (kind IN ('property', 'site', 'store', 'event', 'contact')),
  CONSTRAINT brand_places_source_check
    CHECK (source IN ('demo', 'manual', 'event', 'contact', 'product')),
  CONSTRAINT brand_places_geocode_check
    CHECK (geocode_status IN ('ready', 'pending', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_places_brand_ref
  ON brand_places(brand_id, external_ref);

CREATE INDEX IF NOT EXISTS idx_brand_places_brand
  ON brand_places(brand_id, kind, updated_at DESC);

DROP TRIGGER IF EXISTS trg_brand_places_updated_at ON brand_places;
CREATE TRIGGER trg_brand_places_updated_at BEFORE UPDATE ON brand_places
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
