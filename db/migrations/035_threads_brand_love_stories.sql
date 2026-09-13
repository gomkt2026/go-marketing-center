-- ============================================================================
-- Migration 035: 三品牌 Threads 愛情生活散文(對齊 TaskGo 遠距離爆款公式)
--   1. 各品牌一則待審閱串文(1/2 正文 + prompt_meta.replyBody 當 2/2)
--   2. 核准學習洞察,之後自動產文會優先走感情散文
-- 可安全重複執行。
-- ============================================================================

INSERT INTO contents (
  brand_id, content_type, target_platform, title, status,
  predicted_engagement_score, engagement_analysis, generation_prompt_meta
)
SELECT b.id, 'article', 'threads', '工班愛情不被看扁', 'pending_review',
       88.0,
       '對齊 TaskGo 遠距離戀愛文公式(曝光 5,619、按讚 270、互動率 5.20%):感情散文 + 具體畫面 + 邀請分享,不塞產品。',
       '{"source":"threads_offtopic","category":"love_story","audienceLane":"b2c","replyBody":"歡迎分享你看過、聽過、自己走過的工地愛情。被看不起也好、被珍惜也好，鬼故事也好，我都想聽。 2/2"}'::jsonb
FROM brands b
WHERE b.slug = 'taskgo'
  AND NOT EXISTS (
    SELECT 1 FROM contents c WHERE c.brand_id = b.id AND c.title = '工班愛情不被看扁'
  );

INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
SELECT c.id, 1, $tg_body$不管你有多愛對方，跟做工的人談戀愛，真的不是偶像劇那種畫面。你還記得嗎？開始的時候覺得手再黑、衣服再髒都沒差。結果第一次帶回家，長輩看他鞋上的水泥就問：「這是在做什麼的？」那些心裡的小劇場，越想越覺得自己像叛徒。

其實被看不起的從來不是他這個人，是這份工作被擺在最底層。你在冷氣房滑手機，他在三十樓外牆流汗；朋友聚餐在講股票，他只能講今天被業主唸了哪一句。久了連你都會心虛，覺得自己是不是該找個更體面的人。

我覺得，工班的愛情最動人的地方，就是有人願意在所有人都看不見的時候，還是選擇你。有一個女生，收工後在工地門口等他，自己買兩份便當。她說：「手黑沒關係，心不黑就好。」那種被真心選中的感覺，比任何體面工作都值錢。

所以啊，被看不起的人一旦被珍惜，會愛得特別乾淨。體面可以裝，真心裝不來。 1/2$tg_body$,
       '[]'::jsonb, ''
FROM contents c
JOIN brands b ON b.id = c.brand_id
WHERE b.slug = 'taskgo' AND c.title = '工班愛情不被看扁'
  AND NOT EXISTS (SELECT 1 FROM content_versions v WHERE v.content_id = c.id);

INSERT INTO contents (
  brand_id, content_type, target_platform, title, status,
  predicted_engagement_score, engagement_analysis, generation_prompt_meta
)
SELECT b.id, 'article', 'threads', '租屋裡的愛情修羅場', 'pending_review',
       88.0,
       '對齊遠距離爆款:房東房客巧遇→戀愛→吵架→一點點情慾暗示。禁止色情、禁止產品名。',
       '{"source":"threads_offtopic","category":"love_story","audienceLane":"b2c","replyBody":"歡迎分享你的租屋愛情。房東房客、室友、樓上樓下，修羅場也好、擦槍走火也好，我都想聽。 2/2"}'::jsonb
FROM brands b
WHERE b.slug = 'homigo'
  AND NOT EXISTS (
    SELECT 1 FROM contents c WHERE c.brand_id = b.id AND c.title = '租屋裡的愛情修羅場'
  );

INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
SELECT c.id, 1, $hg_body$不管你有多愛一個人，租屋裡談戀愛，真的不是你想像中的浪漫故事。你還記得嗎？開始只是報修。冷氣半夜不涼，他上來。你只套一件寬鬆白T去開門，鎖骨還帶著剛洗完澡的水氣。兩個人蹲在客廳地板，近到能聽到呼吸。後來每次漏水、門把鬆了，他都會來。從房東變成會傳「到家了沒」的人。

再後來會吵架。租金、押金、誰該換濾網。吵完卻又在那扇剛關上的門後面吻到衣領都滑了。窗外是鄰居的電視聲，裡面是兩個人把還沒穿好的衣服、還沒說完的氣，全都揉在一起。

我覺得，租屋愛情最危險，因為你住在他的房子裡，也住進他的生活裡。分開的時候，連回家都變成一種痛。

所以，房東房客一旦越線，真的要想清楚。甜蜜和修羅場，常常只隔一扇門。 1/2$hg_body$,
       '[]'::jsonb, ''
FROM contents c
JOIN brands b ON b.id = c.brand_id
WHERE b.slug = 'homigo' AND c.title = '租屋裡的愛情修羅場'
  AND NOT EXISTS (SELECT 1 FROM content_versions v WHERE v.content_id = c.id);

INSERT INTO contents (
  brand_id, content_type, target_platform, title, status,
  predicted_engagement_score, engagement_analysis, generation_prompt_meta
)
SELECT b.id, 'article', 'threads', '洗衣店巧遇的愛情', 'pending_review',
       88.0,
       '對齊遠距離爆款:約會前衣服沒洗、洗衣店巧遇、送洗後被重新喜歡。不提 Washgo 產品。',
       '{"source":"threads_offtopic","category":"love_story","audienceLane":"b2c","replyBody":"歡迎分享你因為洗衣服遇上的緣分。拿錯衣服、烘衣等太久、約會前的髒衣山，我都想聽。 2/2"}'::jsonb
FROM brands b
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM contents c WHERE c.brand_id = b.id AND c.title = '洗衣店巧遇的愛情'
  );

INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
SELECT c.id, 1, $wg_body$不管你有多愛對方，約會前才發現衣服沒洗，真的不是你想像中的小插曲。你還記得嗎？第一次正式約會，那件他誇過的襯衫還在洗衣機裡。你只好衝去巷口洗衣店，結果遇到一個也抱著一袋衣服、看起來一樣狼狽的人。兩個人並肩等烘衣，從「這台很慢」聊到「要不要吃消夜」。

後來才知道，喜歡一個人，常常是從一件乾淨衣服開始的。他穿過的帽T上還有柔軟精氣味，你會偷偷把臉埋進去。衣服送洗拿回來那天，整個人像被重新喜歡一次。連那件被紅酒灑到的洋裝，洗完後又敢穿出門見面。

我覺得，洗衣店的巧遇比交友軟體真實多了。至少你知道，對方也是會把生活弄皺、再一件一件燙平的人。

所以啊，別小看送洗這件事。有時候愛情不是在餐廳開始的，是在等烘衣的那二十分鐘。 1/2$wg_body$,
       '[]'::jsonb, ''
FROM contents c
JOIN brands b ON b.id = c.brand_id
WHERE b.slug = 'washgo' AND c.title = '洗衣店巧遇的愛情'
  AND NOT EXISTS (SELECT 1 FROM content_versions v WHERE v.content_id = c.id);

INSERT INTO learning_records (brand_id, record_type, insight, supporting_data, status)
SELECT b.id, 'content_performance',
       'Threads 感情散文互動遠高於工地知識文。生活檔要用「工班被看不起卻被真心選擇」的愛情故事,結尾邀請大家分享,不要硬塞品牌或系統。',
       '{"source":"manual_love_story_wave","do_more":["工班被看不起卻被珍惜的愛情散文","1/2 長文 + 2/2 邀請分享","具體畫面:水泥鞋、便當、工地門口"],"do_less":["開頭就講派工系統","工地知識教學文當主軸"],"winning_hooks":["不管你有多愛對方，跟做工的人談戀愛，真的不是偶像劇那種畫面"],"platform":"threads","gen_source":"threads_offtopic"}'::jsonb,
       'approved'
FROM brands b
WHERE b.slug = 'taskgo'
  AND NOT EXISTS (
    SELECT 1 FROM learning_records l
    WHERE l.brand_id = b.id AND l.insight LIKE 'Threads 感情散文互動遠高於工地知識文%'
  );

INSERT INTO learning_records (brand_id, record_type, insight, supporting_data, status)
SELECT b.id, 'content_performance',
       '租屋愛情(房東房客巧遇、認識、戀愛、吵架、一點點情慾暗示)會帶 Threads 熱議。暗示即可,不要寫到性行為,不要提 Homigo 產品名。',
       '{"source":"manual_love_story_wave","do_more":["報修巧遇變日常傳訊","租金吵架後門後的吻","2/2 邀請分享租屋愛情"],"do_less":["一開頭講包租代管系統","色情描寫"],"winning_hooks":["不管你有多愛一個人，租屋裡談戀愛，真的不是你想像中的浪漫故事"],"platform":"threads","gen_source":"threads_offtopic"}'::jsonb,
       'approved'
FROM brands b
WHERE b.slug = 'homigo'
  AND NOT EXISTS (
    SELECT 1 FROM learning_records l
    WHERE l.brand_id = b.id AND l.insight LIKE '租屋愛情(房東房客巧遇%'
  );

INSERT INTO learning_records (brand_id, record_type, insight, supporting_data, status)
SELECT b.id, 'content_performance',
       '洗衣巧遇與送洗後被重新喜歡,比洗衣知識文更容易被分享。用柔軟精氣味、約會前髒衣山當畫面,不要提 Washgo 或到府收送。',
       '{"source":"manual_love_story_wave","do_more":["洗衣店並肩等烘衣","衣服洗回來像被重新喜歡","2/2 邀請分享送洗緣分"],"do_less":["開頭講 LINE 下單","GoCoin 點數"],"winning_hooks":["不管你有多愛對方，約會前才發現衣服沒洗，真的不是你想像中的小插曲"],"platform":"threads","gen_source":"threads_offtopic"}'::jsonb,
       'approved'
FROM brands b
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM learning_records l
    WHERE l.brand_id = b.id AND l.insight LIKE '洗衣巧遇與送洗後被重新喜歡%'
  );
