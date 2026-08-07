# 08. Brand Knowledge Markdown 產出規格

## 定位

此 Markdown **不是**管理者編輯的來源，而是系統在每次發布 `brand_version` 時，將結構化知識條目自動編譯出的**唯讀成品**，用途：

1. 餵給 AI 作為 Context（Meeting、Content Generation 時載入）
2. 供外部系統/人員匯出閱讀
3. 作為版本快照，永久保存於 `brand_versions.compiled_markdown`

規格由 Homigo、TaskGo、Washgo 三份既有品牌文件的章節結構取聯集制定，確保未來 Brand Onboarding AI 產出的新品牌也遵循同一格式，便於 AI 統一解析。

## 標準章節結構

```markdown
# {品牌名稱} 品牌知識庫(Brand Knowledge Base)

> 版本: v{version_number} | 狀態: {published}
> 發布時間: {published_at} | 信心分數: {confidence_score}
> 本檔案由系統自動編譯,不可手動修改。如需修改請至 Brand Intelligence 頁面編輯結構化條目。

## 0. 使用規則(給 AI 的規則,優先級最高)
- 事實邊界摘要
- 機敏/禁止事項摘要
- CTA 規範
- 內容比例與生成骨架

## 1. 品牌總覽
- 一句話定位
- 品牌故事
- Slogan / 標語庫
- 生態系品牌關係(如有 Collaboration)

## 2. 品牌價值與定位
- 核心價值主張
- 差異化優勢

## 3. 目標受眾(Audience / Persona)
- 逐一列出 brand_audiences / brand_personas

## 4. 語調與文案風格指南(Voice)
- 整體語氣
- 常用關鍵訊息

## 5. 各平台調性(Channels)
- 逐平台:受眾傾向、語氣、格式建議、Hashtag 數量

## 6. 內容支柱與熱點主題庫(Content Strategy)
- brand_examples(category = content_pillar / hot_topic_bank)

## 7. 品牌規則(Marketing Rules / Negative Rules)
- ✅ 可宣稱條目(含條件與驗證狀態)
- ⛔ 不可宣稱條目
- ⚠️ 時效性內容(含到期日)

## 8. 視覺識別(Visual)
- 色票、圖卡規格

## 9. 敘事素材(Storytelling Bank)
- Before/After、情境故事種子、里程碑

## 10. Hashtag / CTA / 關鍵字庫

## 附錄:原始資料索引
- 列出對應的 brand_documents(不內嵌全文,僅索引與連結)
```

## 編譯規則

- 每個章節對應固定的資料表查詢，依 `brand_version_id` 過濾，確保只反映該版本的知識
- `verification_status = pending` 的條目在編譯時加註 `⚠️ 未驗證`，`verified` 加註 `✅`
- `valid_until` 已過期的規則不編入正式內容，改列入「已失效(存查)」附錄
- 章節標題採固定格式（`## {數字}. {中文標題}({英文})`），確保 AI 與程式都能用穩定的 heading 規則解析

## AI 讀取方式

AI Task 啟動時，依 `brand_id` 找到 `brands.current_version_id`，讀取該版本的 `compiled_markdown` 作為 System Prompt 的品牌知識區塊；若 Task 屬於 Collaboration，改讀取對應的 `collaboration_briefs.content_markdown`，兩者不可疊加混讀（對應 Principle 2/3）。

## 與既有三份品牌文件的對應

| 既有文件章節 | 本規格對應章節 |
|---|---|
| Homigo：品牌總覽/Slogan/信念 | 1. 品牌總覽 |
| Homigo：目標受眾 | 3. 目標受眾 |
| Homigo：語調與文案風格 / 各平台調性 | 4. Voice / 5. Channels |
| Homigo：事實邊界 | 7. 品牌規則 |
| TaskGo：Persona P1~P6 | 3. 目標受眾 |
| TaskGo：可用數據與事實 | 7. 品牌規則(核准數據以 verified 標記) |
| TaskGo：禁止事項 | 0. 使用規則 + 7. 品牌規則 |
| Washgo：✅產品事實 / ⚠️行銷宣稱 | 對應 `verification_status` 欄位 |
| Washgo：GoCoin 與現行優惠 | 7. 品牌規則(帶 `valid_until`) |
| Washgo：術語表與色票 | 8. 視覺識別 |
