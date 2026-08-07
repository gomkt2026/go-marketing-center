# GO 行銷服務中心

行銷服務中心官方網站專案。

## 技術架構

- **前端部署**：Cloudflare Pages
- **資料庫**：Neon (Serverless PostgreSQL)
- **版本控制**：GitHub

## 開發流程

```bash
# 修改程式碼後
git add .
git commit -m "描述你的修改"
git push
```

推送後 Cloudflare Pages 會自動重新部署。

## 環境變數

本地開發請建立 `.env` 檔（不會上傳到 GitHub）：

```
DATABASE_URL=postgresql://...
```
