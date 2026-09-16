-- ============================================================================
-- Migration 040: Washgo 2026-09 中部落地媒體露出
--   第三方只存標題／出處／摘要／短金句／可宣稱事實，不存全文。
--   經濟日報尚無公開 URL，以 outlet + story_key 去重。
--   可安全重複執行。
-- ----------------------------------------------------------------------------
-- 執行方式: node scripts/apply-washgo-press.mjs
--           或 psql "$DATABASE_URL" -f db/migrations/040_washgo_press_coverages.sql
-- ============================================================================

INSERT INTO press_coverages (
  brand_id, press_release_id, story_key, outlet, headline, article_url, published_on,
  status, discovery_source, summary, key_quotes, claimable_facts,
  is_primary, related_brand_slugs
)
SELECT
  b.id,
  pr.id,
  v.story_key,
  v.outlet,
  v.headline,
  v.article_url,
  v.published_on::date,
  v.status::press_coverage_status,
  'manual',
  v.summary,
  v.key_quotes::jsonb,
  v.claimable_facts::jsonb,
  v.is_primary,
  v.related_brand_slugs::jsonb
FROM brands b
LEFT JOIN LATERAL (
  SELECT id FROM press_releases
  WHERE brand_id = b.id
    AND (
      title LIKE '匠管完成 Washgo%'
      OR title LIKE '匠管打造生活工程管理生態系%'
      OR title LIKE '匠管 Washgo%'
    )
  ORDER BY updated_at DESC
  LIMIT 1
) pr ON TRUE
JOIN (VALUES
  ('washgo-2026-09-central-landing', '經濟日報',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   NULL::text, '2026-09-15', 'published',
   '匠管旗下 Washgo 已於中部洗滌業者洗楽完成實際場域導入，以 LINE 為入口串聯送洗、報價、品管與收送，並正式開放洗衣、乾洗品牌加入。',
   '["洗楽願意讓Washgo進入真實營運現場，對我們來說非常重要。因為系統到底好不好，不是我們自己說了算，而是現場每天願不願意用。","品牌是你的，數位能力由匠管提供","Taskgo、Homigo、Washgo是我們進入產業的入口，每一個產品先解決一個真實問題，再慢慢把不同場景串起來。"]',
   '["Washgo 已於中部洗滌業者洗楽完成實際場域導入","以 LINE 為主要服務入口，消費者免另下載 App","正式開放洗衣、乾洗品牌與門市加入","品牌是你的，數位能力由匠管提供","見報於 Yahoo、經濟日報等；同一則轉載不可算成多次獨立專訪"]',
   true, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', 'Yahoo',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://tw.news.yahoo.com/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B-%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0-%E9%96%8B%E6%94%BE%E5%93%81%E7%89%8C%E5%8A%A0%E5%85%A5-091737161.html',
   '2026-09-15', 'published',
   '匠管旗下 Washgo 已於中部洗滌業者洗楽完成實際場域導入，以 LINE 為入口串聯送洗、報價、品管與收送，並正式開放洗衣、乾洗品牌加入。',
   '["洗楽願意讓Washgo進入真實營運現場，對我們來說非常重要。因為系統到底好不好，不是我們自己說了算，而是現場每天願不願意用。","品牌是你的，數位能力由匠管提供","Taskgo、Homigo、Washgo是我們進入產業的入口，每一個產品先解決一個真實問題，再慢慢把不同場景串起來。"]',
   '["Washgo 已於中部洗滌業者洗楽完成實際場域導入","以 LINE 為主要服務入口，消費者免另下載 App","正式開放洗衣、乾洗品牌與門市加入","品牌是你的，數位能力由匠管提供","見報於 Yahoo、經濟日報等；同一則轉載不可算成多次獨立專訪"]',
   true, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '臺灣郵報',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://taiwanpost.net/2026/life/167962/', '2026-09-15', 'syndicated',
   '臺灣郵報轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '民眾新聞網',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://mypeoplevol.com/2026/life/111715', '2026-09-15', 'syndicated',
   '民眾新聞網轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '民聲新聞',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://91postnews.com/life/136166', '2026-09-15', 'syndicated',
   '民聲新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '福爾摩沙新聞',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://formosalive.com/2026/life/351908', '2026-09-15', 'syndicated',
   '福爾摩沙新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '玉山新聞',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://yushanmedia.com/2026/life/153433/', '2026-09-15', 'syndicated',
   '玉山新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '蕃新聞',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://n.yam.com/Article/20260915866777', '2026-09-15', 'syndicated',
   '蕃新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', 'PChome 新聞',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://news.pchome.com.tw/living/mypeople/20260915/index-78945263708716219009.html', '2026-09-15', 'syndicated',
   'PChome 新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', 'LIFE生活網',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://life.tw/article/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B-%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0-%E9%96%8B%E6%94%BE%E5%93%81-3149739',
   '2026-09-15', 'syndicated',
   'LIFE生活網轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', 'yes新聞網',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://www.yesmedia.com.tw/%e5%82%b3%e7%b5%b1%e6%b4%97%e8%a1%a3%e5%ba%97%e4%b9%9f%e6%8b%9aai%e6%95%b8%e4%bd%8d%e8%bd%89%e5%9e%8b%ef%bc%81%e5%8c%a0%e7%ae%a1washgo%e4%b8%ad%e9%83%a8%e8%90%bd%e5%9c%b0%e3%80%81%e9%96%8b%e6%94%be/',
   '2026-09-15', 'syndicated',
   'yes新聞網轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '中聞社',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://chiwannews.com/39612/', '2026-09-15', 'syndicated',
   '中聞社轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '爆了媒',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://bowmedia.tw/81326/', '2026-09-15', 'syndicated',
   '爆了媒轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '獨家報導',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://www.scooptw.com/taiwanpost/527874/%e5%82%b3%e7%b5%b1%e6%b4%97%e8%a1%a3%e5%ba%97%e4%b9%9f%e6%8b%9aai%e6%95%b8%e4%bd%8d%e8%bd%89%e5%9e%8b%ef%bc%81%e5%8c%a0%e7%ae%a1washgo%e4%b8%ad%e9%83%a8%e8%90%bd%e5%9c%b0%e3%80%81%e9%96%8b%e6%94%be/',
   '2026-09-15', 'syndicated',
   '獨家報導轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '數智傳媒',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://pressunion.net/2026/edit-center/life/494857', '2026-09-15', 'syndicated',
   '數智傳媒轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '奧丁丁',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://news.owlting.com/articles/1454907', '2026-09-15', 'syndicated',
   '奧丁丁新聞轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '商傳媒',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://sunmedia.tw/news/Industry-information/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9AAI%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B%EF%BC%81%E5%8C%A0%E7%AE%A1Washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0%E3%80%81%E9%96%8B%E6%94%BE%E5%93%81%E7%89%8C%E5%8A%A0%E5%85%A5-1789457185940',
   '2026-09-15', 'syndicated',
   '商傳媒轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '火報',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://firenews.com.tw/2026/09/15/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B%EF%BC%81%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0%E3%80%81%E9%96%8B%E6%94%BE/',
   '2026-09-15', 'syndicated',
   '火報轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]'),
  ('washgo-2026-09-central-landing', '台灣電報',
   '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入',
   'https://enn.tw/779363/', '2026-09-15', 'syndicated',
   '台灣電報轉載同一則 Washgo 中部落地稿。', '[]', '[]', false, '["homigo","taskgo"]')
) AS v(story_key, outlet, headline, article_url, published_on, status, summary, key_quotes, claimable_facts, is_primary, related_brand_slugs)
  ON TRUE
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM press_coverages pc
    WHERE pc.brand_id = b.id
      AND pc.story_key = v.story_key
      AND (
        (v.article_url IS NOT NULL AND pc.article_url = v.article_url)
        OR (v.article_url IS NULL AND pc.outlet = v.outlet)
      )
  );

UPDATE press_releases pr
SET status = 'final'
FROM brands b
WHERE pr.brand_id = b.id
  AND b.slug = 'washgo'
  AND (
    pr.title LIKE '匠管完成 Washgo%'
    OR pr.title LIKE '匠管打造生活工程管理生態系%'
    OR pr.title LIKE '匠管 Washgo%'
  );

UPDATE brand_rules r
SET
  rule_type = 'can_claim',
  statement = 'Yahoo、經濟日報等媒體曾報導 Washgo 中部落地、開放洗衣乾洗品牌加入',
  condition_note = '可引用已列媒體名與已見報事實；不可把同一則轉載算成多次獨立專訪；不可宣稱全台專訪或保證導入成效',
  verification = 'verified'
FROM brands b
WHERE r.brand_id = b.id
  AND b.slug = 'washgo'
  AND r.statement = '不可宣稱 Washgo 已被媒體報導';

INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
SELECT b.id, b.current_version_id, 'can_claim',
  'Yahoo、經濟日報等媒體曾報導 Washgo 中部落地、開放洗衣乾洗品牌加入',
  '可引用已列媒體名與已見報事實；不可把同一則轉載算成多次獨立專訪；不可宣稱全台專訪或保證導入成效',
  'verified', 20
FROM brands b
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM brand_rules r
    WHERE r.brand_id = b.id
      AND r.statement = 'Yahoo、經濟日報等媒體曾報導 Washgo 中部落地、開放洗衣乾洗品牌加入'
  );
