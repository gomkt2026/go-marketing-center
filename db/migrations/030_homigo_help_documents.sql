-- ============================================================================
-- Migration 030: 匯入／更新 Homigo 品牌客服操作文件（21 份）
--   依 file_name 或標題 upsert，並發布。可安全重複執行。
--   來源：docs/help/homigo/ ；此檔由 scripts/generate-homigo-help-seed.mjs 產生。
-- ----------------------------------------------------------------------------
-- 執行方式: node scripts/apply-homigo-help.mjs
-- ============================================================================

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://cc.homigo.workers.dev'),
  ('https://liff.line.me'),
  ('http://localhost:5173')
) AS o(origin)
WHERE b.slug = 'homigo'
ON CONFLICT (brand_id, origin) DO NOTHING;

DO $$
DECLARE
  bid UUID;
  uid UUID;
  rec RECORD;
  did UUID;
BEGIN
  SELECT id INTO bid FROM brands WHERE slug = 'homigo';
  IF bid IS NULL THEN
    RAISE NOTICE 'skip 030: brands.slug=homigo 不存在';
    RETURN;
  END IF;

  SELECT id INTO uid FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;

  FOR rec IN
    SELECT * FROM (VALUES
    ('landlord-add-property.md', '我要怎麼新增物件？', 'landlord', '/properties,/properties/new', $hgdoc$# 我要怎麼新增物件？

## 我要怎麼新增物件？

1. 打開房東 App，底部點「物件」。
2. 點右下角「＋」或進入「新增物件」。
3. 填寫標題、類型、地址、坪數、房型。
4. 設定月租金、繳費日、水電費方式。
5. 上傳至少 1 張照片。
6. 點「儲存」。

## 物件類型怎麼選？

整租、雅房或套房。多戶型可再填房號。

## 儲存後要去哪裡看？

底部「物件」列表點進去，可看詳情、編輯，或走收租、報修、邀請房客。
$hgdoc$),
    ('landlord-invite-tenant.md', '我要怎麼邀請房客、審核綁定？', 'landlord', '/tenants', $hgdoc$# 我要怎麼邀請房客、審核綁定？

## 我要怎麼邀請房客？

1. 打開「更多 → 租客申請」，或從物件詳情點「邀請租客」。
2. 選擇物件，點「產生邀請連結」。
3. 用 LINE 或簡訊把連結傳給房客。
4. 請房客在 LINE 內點開連結完成綁定。

## 房客申請後我要怎麼審核？

1. 會收到 LINE「房客申請綁定」推播。
2. 點推播或進入租客申請頁。
3. 查看資料後點「核准」或「拒絕」。

## 房客說收不到連結？

請重新產生連結。請對方一定要在 LINE 裡點開，不要貼到外部瀏覽器。也可改用手機號碼綁定。
$hgdoc$),
    ('landlord-lease-sign.md', '我要怎麼建立租約與電子簽名？', 'landlord', '/leases,/signatures', $hgdoc$# 我要怎麼建立租約與電子簽名？

## 我要怎麼建立租約？

1. 打開「更多 → 合約管理」。
2. 點「新增租約」。
3. 選擇物件與已綁定房客。
4. 設定租期、月租金、押金、繳費日後儲存。
5. 點「啟用」，系統會通知房客。

## 租約狀態代表什麼？

- 草稿：尚未生效
- 進行中：正常租期中
- 已終止：退租完成
- 已到期：租期屆滿

## 電子簽名在哪裡？

「更多 → 電子簽名」。房東與房客可線上簽署，完成後可下載 PDF。

## 續約怎麼問房客？

在合約管理發送續約詢問。房客可在 LINE 或 App 回覆願意／不續約，確認後再建立新租期。
$hgdoc$),
    ('landlord-rent-review.md', '我要怎麼看收租、審核繳租？', 'landlord', '/rent-overview,/payments', $hgdoc$# 我要怎麼看收租、審核繳租？

## 收租總覽在哪裡？

底部 Tab「收租總覽」。可看本月應收、本月實收、逾期繳納。

## 我要怎麼審核房客繳租？

1. 收到 LINE「繳租待審核」推播，或進入收租總覽。
2. 點待審項目，查看匯款憑證。
3. 點「核可」，或「退回」並填原因。
4. 也可在 LINE 推播卡點「查看並核可」。

## 逾期帳單怎麼催收？

在收租總覽點逾期項目，確認後系統會發催繳通知給房客。
$hgdoc$),
    ('landlord-repair.md', '房客報修後我要怎麼處理？', 'landlord', '/maintenance,/equipment-events', $hgdoc$# 房客報修後我要怎麼處理？

## 報修工單在哪裡看？

「更多 → 報修管理」，或從物件詳情進入報修。

## 處理步驟是什麼？

1. 打開報修工單列表。
2. 點進詳情看描述與照片。
3. 更新處理狀態，並回覆房客。
4. 完成後標記結案。

## 房客會知道進度嗎？

會。狀態更新與回覆會讓房客在報修頁看到，通常也會有 LINE 通知。
$hgdoc$),
    ('landlord-movein-moveout.md', '入住點交與退租怎麼走？', 'landlord', '/properties,/leases', $hgdoc$# 入住點交與退租怎麼走？

## 入住點交怎麼做？

1. 在物件或租約建立入住點交清單（設備勾選 + 照片）。
2. 請房客在 App 內確認。
3. 雙方確認後系統留存紀錄。

## 退租 SOP 怎麼走？

1. 到「合約管理」選租約，進入退租。
2. 房東或房客發起退租申請。
3. 做退租點交檢查。
4. 登錄押金扣款項目。
5. 確認結算後完成終止。
$hgdoc$),
    ('tenant-pay-rent.md', '我要怎麼繳租、上傳憑證？', 'tenant', '/payment', $hgdoc$# 我要怎麼繳租、上傳憑證？

## 我要怎麼繳租？

1. 打開房客 App，底部點「繳租」。
2. 查看當期金額與繳費截止日。
3. 先完成銀行匯款或轉帳。
4. 點「上傳憑證」或「繳費回報」，拍下或選取匯款證明。
5. 填實際繳費金額後送出，等待房東審核。

## 送出後要等多久？

房東核可後會收到 LINE 通知。若被退回，依退回原因重傳憑證或補款。

## 金額可以少於帳單嗎？

不能。繳費總額不得低於帳單應繳金額。
$hgdoc$),
    ('tenant-repair.md', '我要怎麼報修、看進度？', 'tenant', '/maintenance,/equipment-events', $hgdoc$# 我要怎麼報修、看進度？

## 我要怎麼送出報修？

1. 底部點「報修」。
2. 點「新增報修」。
3. 選類型、填問題描述。
4. 上傳現場照片（建議）。
5. 送出。

## 送出後要去哪裡看進度？

回到「報修」列表，點開該筆工單，可看房東回覆與處理狀態。
$hgdoc$),
    ('tenant-meter.md', '電表怎麼抄、怎麼上傳？', 'tenant', '/meter', $hgdoc$# 電表怎麼抄、怎麼上傳？

## 電表在哪裡上傳？

底部「更多」進「電表」，或直接打開電表頁。

## 操作步驟

1. 拍攝電表讀數照片。
2. 輸入當期讀數。
3. 送出，供房東核算電費。

若房東沒有要求抄表，這個頁面可能不會出現待辦。
$hgdoc$),
    ('tenant-movein.md', '入住確認與起租拍照怎麼做？', 'tenant', '/check-in,/move-in-photos', $hgdoc$# 入住確認與起租拍照怎麼做？

## 入住點交確認怎麼做？

房東建立點交後，你會看到入住確認頁。

1. 查看設備清單與照片。
2. 逐項確認，有問題就提出異議。
3. 完成確認後系統留存紀錄。

## 起租拍照在哪裡？

「更多 → 起租拍照」。上傳入住時的房間狀態，之後退租可比對。
$hgdoc$),
    ('tenant-moveout.md', '退租結算怎麼確認？', 'tenant', '/move-out-agreement,/move-out-progress', $hgdoc$# 退租結算怎麼確認？

## 什麼時候會看到退租頁？

房東發起退租後，會出現退租協議或退租進度。

## 我要做什麼？

1. 查看押金扣款明細。
2. 確認或提出異議。
3. 雙方確認後完成退租。

進度可在退租進度頁持續查看。
$hgdoc$),
    ('tenant-messages.md', '怎麼留言、回覆續約？', 'tenant', '/messages', $hgdoc$# 怎麼留言、回覆續約？

## 怎麼跟房東留言？

底部點「留言」，直接傳訊息。新留言通常會有 LINE 推播。

## 續約要怎麼回覆？

收到 LINE「續約詢問」時：

- 點「願意續約」或「不續約」
- 也可回 App 查看續約狀態
$hgdoc$),
    ('manager-cc-login.md', '指揮中心怎麼用 LINE 登入？', 'manager', '/login', $hgdoc$# 指揮中心怎麼用 LINE 登入？

## 網址在哪裡？

開啟 https://cc.homigo.workers.dev ，進入登入頁。

## LINE 登入步驟

1. 選「LINE 登入」。
2. 畫面上會出現 QR Code（約 5 分鐘有效）。
3. 用手機 LINE 掃描，完成驗證。
4. 須具管理身份才會進入後台，沿用現有 LINE 身分，不必另建帳密。

## 看不到某些選單？

登入後依訂閱方案與物件權限顯示模組。沒開通的功能不會出現在左側選單。
$hgdoc$),
    ('manager-rent.md', '收租審核與催收在哪裡做？', 'manager', '/rent', $hgdoc$# 收租審核與催收在哪裡做？

## 指揮中心收租在哪裡？

左側進「收租」（路徑 `/rent`）。可用分頁切換審核、催收等。

## 怎麼審核繳租？

1. 打開收租，切到待審核。
2. 點進該筆看憑證與金額。
3. 核可或退回（退回請填原因）。

## 催收在哪裡？

同一收租中心切到催收分頁，對逾期帳單發送催繳。

房東 LINE App 的「收租總覽」也可以做日常審核；大量案件建議用指揮中心。
$hgdoc$),
    ('manager-repair.md', '報修案件怎麼看、怎麼派？', 'manager', '/repair', $hgdoc$# 報修案件怎麼看、怎麼派？

## 指揮中心報修在哪裡？

左側進「維修／報修」（路徑 `/repair`）。可看待處理與維修紀錄。

## 怎麼處理？

1. 打開待處理列表。
2. 點進案件看描述、照片與狀態。
3. 更新進度或派工。
4. 完成後結案。

LINE 房東 App 的報修管理也可處理單筆案件。
$hgdoc$),
    ('manager-listing.md', '招租刊登與帶看在哪裡？', 'manager', '/listing', $hgdoc$# 招租刊登與帶看在哪裡？

## 指揮中心招租在哪裡？

左側進「招租」（路徑 `/listing`）。可切換空房、刊登、帶看。

## 常見操作

- 空房：看哪些戶待招租
- 刊登：上架與分享
- 帶看：安排與紀錄帶看

LINE 物件詳情也有 AI 招租與分享連結。
$hgdoc$),
    ('manager-moveout.md', '退租中心怎麼處理？', 'manager', '/moveout-center', $hgdoc$# 退租中心怎麼處理？

## 指揮中心退租在哪裡？

左側進「退租中心」（路徑 `/moveout-center`）。

## 怎麼處理一筆退租？

1. 打開退租列表，點進該租約。
2. 依點交、押金結算、終止步驟往下做。
3. 雙方確認後結案。

單筆也可從 LINE「合約管理 → 租約 → 退租」走 SOP。
$hgdoc$),
    ('manager-team.md', '怎麼加團隊成員？', 'manager', '/team', $hgdoc$# 怎麼加團隊成員？

## 指揮中心團隊在哪裡？

左側進「團隊」（路徑 `/team`）。可管成員、分派、組織、移交。

## 怎麼新增成員？

1. 打開團隊 → 成員。
2. 依畫面邀請或加入成員。
3. 分派可管理的物件，並勾選可用模組（收租、報修、租客等）。
4. 之後可再編輯權限或撤銷。

需有團隊協作相關方案，選單才會出現完整成員功能。
$hgdoc$),
    ('faq-liff-blank.md', '打不開 LIFF／白畫面怎麼辦？', 'landlord,tenant,manager', '/', $hgdoc$# 打不開 LIFF／白畫面怎麼辦？

## 可能原因與做法

- 未在 LINE 內開啟：請從 LINE 對話或下方選單點連結，不要把網址貼到 Safari／Chrome。
- LINE 版本過舊：先更新 LINE。
- 網路不穩：改 Wi-Fi 或行動網路後重開。
- 快取問題：關掉視窗，再從 LINE 重新打開。
$hgdoc$),
    ('faq-phone-change.md', '換手機後租約不見了？', 'landlord,tenant,manager', '/', $hgdoc$# 換手機後租約不見了？

房客請用 App 內的「帳號移轉」，或請房東重新發邀請連結，綁到新的 LINE。

請用同一個 LINE 帳號開啟 Homigo。換了 LINE 帳號就等於新身分，舊租約不會自動出現。
$hgdoc$),
    ('faq-rent-rejected.md', '繳租審核被退回怎麼辦？', 'landlord,tenant', '/payment,/rent-overview', $hgdoc$# 繳租審核被退回怎麼辦？

## 常見原因

- 憑證模糊、裁切或看不清
- 金額低於帳單應繳
- 匯款帳號或備註不符

## 怎麼處理

1. 看房東填的退回原因。
2. 補款或重傳清楚的憑證。
3. 從「繳租」再送一次。

房東退回時請寫清楚原因，方便房客一次改對。
$hgdoc$)
    ) AS t(file_name, title, roles, page_paths, body)
  LOOP
    SELECT d.id INTO did
    FROM cs_knowledge_documents d
    WHERE d.brand_id = bid
      AND (d.file_name = rec.file_name OR d.title = rec.title)
    ORDER BY CASE WHEN d.file_name = rec.file_name THEN 0 ELSE 1 END
    LIMIT 1;

    IF did IS NULL THEN
      INSERT INTO cs_knowledge_documents (
        brand_id, title, file_name, mime_type, extracted_text,
        extract_status, publish_status, page_paths,
        uploaded_by, published_by, published_at
      ) VALUES (
        bid, rec.title, rec.file_name, 'text/markdown', rec.body,
        'ready', 'published', to_jsonb(string_to_array(rec.page_paths, ',')),
        uid, uid, now()
      ) RETURNING id INTO did;
    ELSE
      UPDATE cs_knowledge_documents SET
        title = rec.title,
        file_name = rec.file_name,
        mime_type = 'text/markdown',
        extracted_text = rec.body,
        extract_status = 'ready',
        publish_status = 'published',
        page_paths = to_jsonb(string_to_array(rec.page_paths, ',')),
        published_by = COALESCE(published_by, uid),
        published_at = COALESCE(published_at, now())
      WHERE id = did;
    END IF;

    DELETE FROM cs_knowledge_document_roles WHERE document_id = did;
    INSERT INTO cs_knowledge_document_roles (document_id, role)
    SELECT did, trim(role_name)
    FROM unnest(string_to_array(rec.roles, ',')) AS role_name;
  END LOOP;
END $$;
