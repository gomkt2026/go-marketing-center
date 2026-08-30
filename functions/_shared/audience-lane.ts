import type { Env } from './env';
import { getSql } from './db';

let applied: Promise<void> | null = null;

function isMissingLaneColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?lane["']? does not exist/i.test(msg);
}

/** 套用 017 受眾車道欄位。可重複執行;同 isolate 只跑一次。 */
export async function ensureAudienceLane(env: Env): Promise<void> {
  if (applied) return applied;
  applied = (async () => {
    const sql = getSql(env);
    await sql`ALTER TABLE brand_audiences ADD COLUMN IF NOT EXISTS lane TEXT`;
    await sql`ALTER TABLE brand_personas ADD COLUMN IF NOT EXISTS lane TEXT`;
    await sql`DO $$ BEGIN
      ALTER TABLE brand_audiences
        ADD CONSTRAINT brand_audiences_lane_check
        CHECK (lane IS NULL OR lane IN ('b2b', 'b2c'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    await sql`DO $$ BEGIN
      ALTER TABLE brand_personas
        ADD CONSTRAINT brand_personas_lane_check
        CHECK (lane IS NULL OR lane IN ('b2b', 'b2c'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

    await sql`
      UPDATE brand_audiences SET lane = 'b2b'
      WHERE lane IS NULL AND (
        name ILIKE '%房東%' OR name ILIKE '%代管%' OR name ILIKE '%業者%'
        OR name ILIKE '%店主%' OR name ILIKE '%B2B%' OR name ILIKE '%加盟%'
        OR name ILIKE '%連鎖%'
      )`;
    await sql`
      UPDATE brand_audiences SET lane = 'b2c'
      WHERE lane IS NULL AND (
        name ILIKE '%房客%' OR name ILIKE '%上班族%' OR name ILIKE '%家庭%'
        OR name ILIKE '%衣物擁有%' OR name ILIKE '%學生%' OR name ILIKE '%爸媽%'
      )`;
    await sql`
      UPDATE brand_personas p SET lane = 'b2b'
      FROM brands b
      WHERE p.brand_id = b.id AND p.lane IS NULL AND b.slug = 'taskgo'`;
    await sql`
      UPDATE brand_personas SET lane = 'b2b'
      WHERE lane IS NULL AND (
        name ILIKE '%老闆%' OR name ILIKE '%主任%' OR name ILIKE '%經理%'
        OR name ILIKE '%房東%' OR name ILIKE '%物管%' OR name ILIKE '%師傅%'
      )`;
    await sql`
      INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order, lane)
      SELECT p.brand_id, p.brand_version_id, p.name, p.pain_points, p.appeal_angle, p.sort_order, COALESCE(p.lane, 'b2b')
      FROM brand_personas p
      JOIN brands b ON b.id = p.brand_id
      WHERE b.slug = 'taskgo'
        AND NOT EXISTS (
          SELECT 1 FROM brand_audiences a
          WHERE a.brand_id = p.brand_id AND a.name = p.name
        )`;

    await sql`
      UPDATE brand_keywords
      SET value = '想來信詢問：Service@inforcraft.com.tw，或來電 0972-395-117'
      WHERE category = 'cta' AND value IN (
        '加 LINE 免費開始',
        '加入 @washgo 領取 100 GoCoin',
        '免費試用 14 天,先用再說。'
      )`;

    await sql`
      INSERT INTO brand_channels (
        brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline,
        hashtag_count_min, hashtag_count_max
      )
      SELECT b.id, b.current_version_id, 'instagram',
             '視覺優先、匠管海軍藍設計圖',
             '80-180字,前125字完整hook',
             '4:5 斜切深藍+工地實拍,第一張強hook',
             8, 12
      FROM brands b
      WHERE b.slug = 'taskgo'
        AND NOT EXISTS (
          SELECT 1 FROM brand_channels c
          WHERE c.brand_id = b.id AND c.platform = 'instagram'
        )`;
    await sql`
      UPDATE brand_channels c
      SET length_guideline = '80-180字,前125字完整hook',
          format_guideline = CASE b.slug
            WHEN 'washgo' THEN '4:5 痛點海報+系統重點卡,不要整頁截圖直發'
            WHEN 'taskgo' THEN '4:5 斜切深藍痛點海報+派工畫面卡,第一張強hook'
            ELSE '4:5 痛點主標+情境+系統解法卡,第一張強hook'
          END,
          hashtag_count_min = 8,
          hashtag_count_max = 12
      FROM brands b
      WHERE c.brand_id = b.id AND c.platform = 'instagram'`;
    await sql`
      INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
      SELECT b.id, b.current_version_id, 'hashtag', v.value
      FROM brands b
      JOIN (VALUES
        ('homigo', '#收租對帳'),
        ('homigo', '#代管系統'),
        ('taskgo', '#現場回報'),
        ('taskgo', '#工班管理'),
        ('washgo', '#洗衣店系統'),
        ('washgo', '#送洗履歷')
      ) AS v(slug, value) ON v.slug = b.slug
      WHERE NOT EXISTS (
        SELECT 1 FROM brand_keywords k
        WHERE k.brand_id = b.id AND k.category = 'hashtag' AND k.value = v.value
      )`;
    await sql`
      INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
      SELECT b.id, b.current_version_id, 'IG輪播尺寸', '1080x1350 (4:5)', 'layout', 1
      FROM brands b
      WHERE b.slug IN ('taskgo', 'washgo')
        AND NOT EXISTS (
          SELECT 1 FROM brand_visuals v
          WHERE v.brand_id = b.id AND v.label = 'IG輪播尺寸'
        )`;
    await sql`
      INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
      SELECT b.id, b.current_version_id, v.label, v.value, v.category, v.sort_order
      FROM brands b
      JOIN (VALUES
        ('主色-海軍藍', '#0B2D5C', 'color', 2),
        ('主色-青藍', '#2BA3D6', 'color', 3),
        ('強調-安全橘', '#ED9121', 'color', 4),
        ('強調-黃', '#F7B500', 'color', 5),
        ('圖文構圖', '斜切深藍banner+工地實拍+蜂巢紋+藍機器人吉祥物', 'layout', 6)
      ) AS v(label, value, category, sort_order) ON TRUE
      WHERE b.slug = 'taskgo'
        AND NOT EXISTS (
          SELECT 1 FROM brand_visuals x
          WHERE x.brand_id = b.id AND x.label = v.label
        )`;
    await sql`
      UPDATE brand_channels c
      SET tone_of_voice = '視覺優先、匠管海軍藍設計圖'
      FROM brands b
      WHERE c.brand_id = b.id AND b.slug = 'taskgo' AND c.platform = 'instagram'`;
  })();
  try {
    await applied;
  } catch (e) {
    applied = null;
    throw e;
  }
}

export { isMissingLaneColumn };
