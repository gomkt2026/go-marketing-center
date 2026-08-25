-- ============================================================================
-- Migration 017: 受眾車道(B 端 / C 端)
--   FB/IG 每日圖文走 B 端,Threads 維持 C 端衝觸及。
--   brand_audiences / brand_personas 加上 lane,生成時只抽對應車道的客群。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/017_audience_lane.sql
-- ============================================================================

ALTER TABLE brand_audiences ADD COLUMN IF NOT EXISTS lane TEXT;
ALTER TABLE brand_personas ADD COLUMN IF NOT EXISTS lane TEXT;

DO $$ BEGIN
  ALTER TABLE brand_audiences
    ADD CONSTRAINT brand_audiences_lane_check
    CHECK (lane IS NULL OR lane IN ('b2b', 'b2c'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE brand_personas
    ADD CONSTRAINT brand_personas_lane_check
    CHECK (lane IS NULL OR lane IN ('b2b', 'b2c'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Homigo / Washgo 既有 audiences
UPDATE brand_audiences SET lane = 'b2b'
WHERE lane IS NULL AND (
  name ILIKE '%房東%' OR name ILIKE '%代管%' OR name ILIKE '%業者%'
  OR name ILIKE '%店主%' OR name ILIKE '%B2B%' OR name ILIKE '%加盟%'
  OR name ILIKE '%連鎖%'
);

UPDATE brand_audiences SET lane = 'b2c'
WHERE lane IS NULL AND (
  name ILIKE '%房客%' OR name ILIKE '%上班族%' OR name ILIKE '%家庭%'
  OR name ILIKE '%衣物擁有%' OR name ILIKE '%學生%' OR name ILIKE '%爸媽%'
);

-- TaskGo 角色幾乎都是工班/業主端
UPDATE brand_personas p SET lane = 'b2b'
FROM brands b
WHERE p.brand_id = b.id AND p.lane IS NULL AND b.slug = 'taskgo';

UPDATE brand_personas SET lane = 'b2b' WHERE lane IS NULL AND (
  name ILIKE '%老闆%' OR name ILIKE '%主任%' OR name ILIKE '%經理%'
  OR name ILIKE '%房東%' OR name ILIKE '%物管%' OR name ILIKE '%師傅%'
);

-- TaskGo 沒有 audiences,從 personas 補一筆對應,讓 B 端抽選有來源
INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order, lane)
SELECT p.brand_id, p.brand_version_id, p.name, p.pain_points, p.appeal_angle, p.sort_order, COALESCE(p.lane, 'b2b')
FROM brand_personas p
JOIN brands b ON b.id = p.brand_id
WHERE b.slug = 'taskgo'
  AND NOT EXISTS (
    SELECT 1 FROM brand_audiences a
    WHERE a.brand_id = p.brand_id AND a.name = p.name
  );
