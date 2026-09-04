/** 由 scripts/generate-homigo-help-seed.mjs 從 docs/help/homigo 產生。請勿手改。 */
export interface HomigoHelpDoc {
  fileName: string;
  title: string;
  roles: string[];
  pagePaths: string[];
  text: string;
}

export const HOMIGO_HELP_ORIGINS = [
  "https://cc.homigo.workers.dev",
  "https://liff.line.me",
  "http://localhost:5173"
] as const;

export const HOMIGO_HELP_DOCS: HomigoHelpDoc[] = [
  {
    "fileName": "landlord-add-property.md",
    "title": "我要怎麼新增物件？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/properties",
      "/properties/new"
    ],
    "text": "# 我要怎麼新增物件？\n\n## 我要怎麼新增物件？\n\n1. 打開房東 App，底部點「物件」。\n2. 點右下角「＋」或進入「新增物件」。\n3. 填寫標題、類型、地址、坪數、房型。\n4. 設定月租金、繳費日、水電費方式。\n5. 上傳至少 1 張照片。\n6. 點「儲存」。\n\n## 物件類型怎麼選？\n\n整租、雅房或套房。多戶型可再填房號。\n\n## 儲存後要去哪裡看？\n\n底部「物件」列表點進去，可看詳情、編輯，或走收租、報修、邀請房客。\n"
  },
  {
    "fileName": "landlord-invite-tenant.md",
    "title": "我要怎麼邀請房客、審核綁定？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/tenants"
    ],
    "text": "# 我要怎麼邀請房客、審核綁定？\n\n## 我要怎麼邀請房客？\n\n1. 打開「更多 → 租客申請」，或從物件詳情點「邀請租客」。\n2. 選擇物件，點「產生邀請連結」。\n3. 用 LINE 或簡訊把連結傳給房客。\n4. 請房客在 LINE 內點開連結完成綁定。\n\n## 房客申請後我要怎麼審核？\n\n1. 會收到 LINE「房客申請綁定」推播。\n2. 點推播或進入租客申請頁。\n3. 查看資料後點「核准」或「拒絕」。\n\n## 房客說收不到連結？\n\n請重新產生連結。請對方一定要在 LINE 裡點開，不要貼到外部瀏覽器。也可改用手機號碼綁定。\n"
  },
  {
    "fileName": "landlord-lease-sign.md",
    "title": "我要怎麼建立租約與電子簽名？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/leases",
      "/signatures"
    ],
    "text": "# 我要怎麼建立租約與電子簽名？\n\n## 我要怎麼建立租約？\n\n1. 打開「更多 → 合約管理」。\n2. 點「新增租約」。\n3. 選擇物件與已綁定房客。\n4. 設定租期、月租金、押金、繳費日後儲存。\n5. 點「啟用」，系統會通知房客。\n\n## 租約狀態代表什麼？\n\n- 草稿：尚未生效\n- 進行中：正常租期中\n- 已終止：退租完成\n- 已到期：租期屆滿\n\n## 電子簽名在哪裡？\n\n「更多 → 電子簽名」。房東與房客可線上簽署，完成後可下載 PDF。\n\n## 續約怎麼問房客？\n\n在合約管理發送續約詢問。房客可在 LINE 或 App 回覆願意／不續約，確認後再建立新租期。\n"
  },
  {
    "fileName": "landlord-rent-review.md",
    "title": "我要怎麼看收租、審核繳租？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/rent-overview",
      "/payments"
    ],
    "text": "# 我要怎麼看收租、審核繳租？\n\n## 收租總覽在哪裡？\n\n底部 Tab「收租總覽」。可看本月應收、本月實收、逾期繳納。\n\n## 我要怎麼審核房客繳租？\n\n1. 收到 LINE「繳租待審核」推播，或進入收租總覽。\n2. 點待審項目，查看匯款憑證。\n3. 點「核可」，或「退回」並填原因。\n4. 也可在 LINE 推播卡點「查看並核可」。\n\n## 逾期帳單怎麼催收？\n\n在收租總覽點逾期項目，確認後系統會發催繳通知給房客。\n"
  },
  {
    "fileName": "landlord-repair.md",
    "title": "房客報修後我要怎麼處理？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/maintenance",
      "/equipment-events"
    ],
    "text": "# 房客報修後我要怎麼處理？\n\n## 報修工單在哪裡看？\n\n「更多 → 報修管理」，或從物件詳情進入報修。\n\n## 處理步驟是什麼？\n\n1. 打開報修工單列表。\n2. 點進詳情看描述與照片。\n3. 更新處理狀態，並回覆房客。\n4. 完成後標記結案。\n\n## 房客會知道進度嗎？\n\n會。狀態更新與回覆會讓房客在報修頁看到，通常也會有 LINE 通知。\n"
  },
  {
    "fileName": "landlord-movein-moveout.md",
    "title": "入住點交與退租怎麼走？",
    "roles": [
      "landlord"
    ],
    "pagePaths": [
      "/properties",
      "/leases"
    ],
    "text": "# 入住點交與退租怎麼走？\n\n## 入住點交怎麼做？\n\n1. 在物件或租約建立入住點交清單（設備勾選 + 照片）。\n2. 請房客在 App 內確認。\n3. 雙方確認後系統留存紀錄。\n\n## 退租 SOP 怎麼走？\n\n1. 到「合約管理」選租約，進入退租。\n2. 房東或房客發起退租申請。\n3. 做退租點交檢查。\n4. 登錄押金扣款項目。\n5. 確認結算後完成終止。\n"
  },
  {
    "fileName": "tenant-pay-rent.md",
    "title": "我要怎麼繳租、上傳憑證？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/payment"
    ],
    "text": "# 我要怎麼繳租、上傳憑證？\n\n## 我要怎麼繳租？\n\n1. 打開房客 App，底部點「繳租」。\n2. 查看當期金額與繳費截止日。\n3. 先完成銀行匯款或轉帳。\n4. 點「上傳憑證」或「繳費回報」，拍下或選取匯款證明。\n5. 填實際繳費金額後送出，等待房東審核。\n\n## 送出後要等多久？\n\n房東核可後會收到 LINE 通知。若被退回，依退回原因重傳憑證或補款。\n\n## 金額可以少於帳單嗎？\n\n不能。繳費總額不得低於帳單應繳金額。\n"
  },
  {
    "fileName": "tenant-repair.md",
    "title": "我要怎麼報修、看進度？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/maintenance",
      "/equipment-events"
    ],
    "text": "# 我要怎麼報修、看進度？\n\n## 我要怎麼送出報修？\n\n1. 底部點「報修」。\n2. 點「新增報修」。\n3. 選類型、填問題描述。\n4. 上傳現場照片（建議）。\n5. 送出。\n\n## 送出後要去哪裡看進度？\n\n回到「報修」列表，點開該筆工單，可看房東回覆與處理狀態。\n"
  },
  {
    "fileName": "tenant-meter.md",
    "title": "電表怎麼抄、怎麼上傳？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/meter"
    ],
    "text": "# 電表怎麼抄、怎麼上傳？\n\n## 電表在哪裡上傳？\n\n底部「更多」進「電表」，或直接打開電表頁。\n\n## 操作步驟\n\n1. 拍攝電表讀數照片。\n2. 輸入當期讀數。\n3. 送出，供房東核算電費。\n\n若房東沒有要求抄表，這個頁面可能不會出現待辦。\n"
  },
  {
    "fileName": "tenant-movein.md",
    "title": "入住確認與起租拍照怎麼做？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/check-in",
      "/move-in-photos"
    ],
    "text": "# 入住確認與起租拍照怎麼做？\n\n## 入住點交確認怎麼做？\n\n房東建立點交後，你會看到入住確認頁。\n\n1. 查看設備清單與照片。\n2. 逐項確認，有問題就提出異議。\n3. 完成確認後系統留存紀錄。\n\n## 起租拍照在哪裡？\n\n「更多 → 起租拍照」。上傳入住時的房間狀態，之後退租可比對。\n"
  },
  {
    "fileName": "tenant-moveout.md",
    "title": "退租結算怎麼確認？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/move-out-agreement",
      "/move-out-progress"
    ],
    "text": "# 退租結算怎麼確認？\n\n## 什麼時候會看到退租頁？\n\n房東發起退租後，會出現退租協議或退租進度。\n\n## 我要做什麼？\n\n1. 查看押金扣款明細。\n2. 確認或提出異議。\n3. 雙方確認後完成退租。\n\n進度可在退租進度頁持續查看。\n"
  },
  {
    "fileName": "tenant-messages.md",
    "title": "怎麼留言、回覆續約？",
    "roles": [
      "tenant"
    ],
    "pagePaths": [
      "/messages"
    ],
    "text": "# 怎麼留言、回覆續約？\n\n## 怎麼跟房東留言？\n\n底部點「留言」，直接傳訊息。新留言通常會有 LINE 推播。\n\n## 續約要怎麼回覆？\n\n收到 LINE「續約詢問」時：\n\n- 點「願意續約」或「不續約」\n- 也可回 App 查看續約狀態\n"
  },
  {
    "fileName": "manager-cc-login.md",
    "title": "指揮中心怎麼用 LINE 登入？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/login"
    ],
    "text": "# 指揮中心怎麼用 LINE 登入？\n\n## 網址在哪裡？\n\n開啟 https://cc.homigo.workers.dev ，進入登入頁。\n\n## LINE 登入步驟\n\n1. 選「LINE 登入」。\n2. 畫面上會出現 QR Code（約 5 分鐘有效）。\n3. 用手機 LINE 掃描，完成驗證。\n4. 須具管理身份才會進入後台，沿用現有 LINE 身分，不必另建帳密。\n\n## 看不到某些選單？\n\n登入後依訂閱方案與物件權限顯示模組。沒開通的功能不會出現在左側選單。\n"
  },
  {
    "fileName": "manager-rent.md",
    "title": "收租審核與催收在哪裡做？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/rent"
    ],
    "text": "# 收租審核與催收在哪裡做？\n\n## 指揮中心收租在哪裡？\n\n左側進「收租」（路徑 `/rent`）。可用分頁切換審核、催收等。\n\n## 怎麼審核繳租？\n\n1. 打開收租，切到待審核。\n2. 點進該筆看憑證與金額。\n3. 核可或退回（退回請填原因）。\n\n## 催收在哪裡？\n\n同一收租中心切到催收分頁，對逾期帳單發送催繳。\n\n房東 LINE App 的「收租總覽」也可以做日常審核；大量案件建議用指揮中心。\n"
  },
  {
    "fileName": "manager-repair.md",
    "title": "報修案件怎麼看、怎麼派？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/repair"
    ],
    "text": "# 報修案件怎麼看、怎麼派？\n\n## 指揮中心報修在哪裡？\n\n左側進「維修／報修」（路徑 `/repair`）。可看待處理與維修紀錄。\n\n## 怎麼處理？\n\n1. 打開待處理列表。\n2. 點進案件看描述、照片與狀態。\n3. 更新進度或派工。\n4. 完成後結案。\n\nLINE 房東 App 的報修管理也可處理單筆案件。\n"
  },
  {
    "fileName": "manager-listing.md",
    "title": "招租刊登與帶看在哪裡？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/listing"
    ],
    "text": "# 招租刊登與帶看在哪裡？\n\n## 指揮中心招租在哪裡？\n\n左側進「招租」（路徑 `/listing`）。可切換空房、刊登、帶看。\n\n## 常見操作\n\n- 空房：看哪些戶待招租\n- 刊登：上架與分享\n- 帶看：安排與紀錄帶看\n\nLINE 物件詳情也有 AI 招租與分享連結。\n"
  },
  {
    "fileName": "manager-moveout.md",
    "title": "退租中心怎麼處理？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/moveout-center"
    ],
    "text": "# 退租中心怎麼處理？\n\n## 指揮中心退租在哪裡？\n\n左側進「退租中心」（路徑 `/moveout-center`）。\n\n## 怎麼處理一筆退租？\n\n1. 打開退租列表，點進該租約。\n2. 依點交、押金結算、終止步驟往下做。\n3. 雙方確認後結案。\n\n單筆也可從 LINE「合約管理 → 租約 → 退租」走 SOP。\n"
  },
  {
    "fileName": "manager-team.md",
    "title": "怎麼加團隊成員？",
    "roles": [
      "manager"
    ],
    "pagePaths": [
      "/team"
    ],
    "text": "# 怎麼加團隊成員？\n\n## 指揮中心團隊在哪裡？\n\n左側進「團隊」（路徑 `/team`）。可管成員、分派、組織、移交。\n\n## 怎麼新增成員？\n\n1. 打開團隊 → 成員。\n2. 依畫面邀請或加入成員。\n3. 分派可管理的物件，並勾選可用模組（收租、報修、租客等）。\n4. 之後可再編輯權限或撤銷。\n\n需有團隊協作相關方案，選單才會出現完整成員功能。\n"
  },
  {
    "fileName": "faq-liff-blank.md",
    "title": "打不開 LIFF／白畫面怎麼辦？",
    "roles": [
      "landlord",
      "tenant",
      "manager"
    ],
    "pagePaths": [
      "/"
    ],
    "text": "# 打不開 LIFF／白畫面怎麼辦？\n\n## 可能原因與做法\n\n- 未在 LINE 內開啟：請從 LINE 對話或下方選單點連結，不要把網址貼到 Safari／Chrome。\n- LINE 版本過舊：先更新 LINE。\n- 網路不穩：改 Wi-Fi 或行動網路後重開。\n- 快取問題：關掉視窗，再從 LINE 重新打開。\n"
  },
  {
    "fileName": "faq-phone-change.md",
    "title": "換手機後租約不見了？",
    "roles": [
      "landlord",
      "tenant",
      "manager"
    ],
    "pagePaths": [
      "/"
    ],
    "text": "# 換手機後租約不見了？\n\n房客請用 App 內的「帳號移轉」，或請房東重新發邀請連結，綁到新的 LINE。\n\n請用同一個 LINE 帳號開啟 Homigo。換了 LINE 帳號就等於新身分，舊租約不會自動出現。\n"
  },
  {
    "fileName": "faq-rent-rejected.md",
    "title": "繳租審核被退回怎麼辦？",
    "roles": [
      "landlord",
      "tenant"
    ],
    "pagePaths": [
      "/payment",
      "/rent-overview"
    ],
    "text": "# 繳租審核被退回怎麼辦？\n\n## 常見原因\n\n- 憑證模糊、裁切或看不清\n- 金額低於帳單應繳\n- 匯款帳號或備註不符\n\n## 怎麼處理\n\n1. 看房東填的退回原因。\n2. 補款或重傳清楚的憑證。\n3. 從「繳租」再送一次。\n\n房東退回時請寫清楚原因，方便房客一次改對。\n"
  }
];
