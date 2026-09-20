import type {
  SeoAudit,
  SeoFindingCategory,
  SeoPriority,
  SeoRecommendation,
} from '@/types';

const OWNER_LABEL: Record<SeoRecommendation['owner'], string> = {
  engineering: '工程',
  content: '內容',
  brand: '品牌',
};

const CATEGORY_LABEL: Record<SeoFindingCategory, string> = {
  indexability: '收錄／indexability',
  on_page: '頁面 SEO',
  content: '內容',
  structured_data: '結構化資料',
  aeo: 'AEO／AI 引用',
  trust: '信任／不可宣稱',
  internal_linking: '內鏈',
};

const PRIORITIES: SeoPriority[] = ['P0', 'P1', 'P2', 'P3'];

export interface SeoBriefInput {
  brandName: string;
  brandSlug: string;
  siteUrl: string | null;
  productUrl?: string | null;
  audit: SeoAudit;
}

function stamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl(text: string) {
  return text.replace(/\r\n/g, '\n').trim();
}

function demoteHeadings(text: string) {
  return text.replace(/^### /gm, '#### ').replace(/^## /gm, '### ');
}

export function seoBriefFilename(brandSlug: string, createdAt?: string) {
  return `${brandSlug}-官網SEO優化清單-${stamp(createdAt ? new Date(createdAt) : new Date())}.md`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown') {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function buildSeoDeveloperMarkdown(input: SeoBriefInput): string {
  const { brandName, brandSlug, siteUrl, productUrl, audit } = input;
  const auditedAt = new Date(audit.createdAt).toLocaleString('zh-TW');
  const recs = [...audit.recommendations].sort((a, b) => a.priority.localeCompare(b.priority));
  const lines: string[] = [
    `# ${brandName} 官網 SEO 優化清單（給官網開發者）`,
    '',
    `- 品牌：${brandName}（\`${brandSlug}\`）`,
    `- 行銷官網：${siteUrl || '尚未設定'}`,
    productUrl ? `- 產品入口：${productUrl}` : '',
    `- 健檢時間：${auditedAt}`,
    `- 健康分數：${audit.healthScore} / 100`,
    `- 來源：GO 行銷中心 Open SEO Advisor 顧問模式（唯讀健檢，不會改站）`,
    '',
    '> 本文件給官網工程與內容負責人。請依 **P0 → P1 → P2** 處理。未核實的客戶數、滿意度、排名、保證效果等數字禁止上線。分數是技術與內容診斷，不保證 Google 排名或 AI 引用。',
    '',
    '## 白話摘要',
    '',
    demoteHeadings(nl(audit.beginnerReport) || audit.summary),
    '',
    '## 1. 優化待辦（請依負責人拆票）',
    '',
  ];

  if (!recs.length) {
    lines.push('目前沒有待辦。');
  } else {
    for (const rec of recs) {
      lines.push(`### ${rec.priority}｜${OWNER_LABEL[rec.owner]}｜${rec.title}`);
      lines.push('');
      lines.push(nl(rec.detail));
      lines.push('');
      lines.push(`- 負責人：${OWNER_LABEL[rec.owner]}`);
      lines.push(`- 優先級：${rec.priority}`);
      lines.push('');
    }
  }

  lines.push('## 2. 完整 Finding（含證據與建議）', '');

  for (const priority of PRIORITIES) {
    const list = audit.findings.filter((f) => f.priority === priority);
    if (!list.length) continue;
    lines.push(`### ${priority}`, '');
    for (const finding of list) {
      lines.push(`#### ${finding.id} ${finding.title}`);
      lines.push('');
      lines.push(`- 分類：${CATEGORY_LABEL[finding.category]}`);
      lines.push(`- 影響：${nl(finding.impact)}`);
      lines.push(`- 證據：${nl(finding.evidence)}`);
      lines.push(`- 建議：${nl(finding.recommendation)}`);
      if (finding.url) lines.push(`- URL：${finding.url}`);
      if (finding.contentTopic) lines.push(`- 對應產文主題：${finding.contentTopic}`);
      lines.push('');
    }
  }

  lines.push('## 3. 抽查頁面快照', '');
  lines.push('| URL | 狀態 | Title | H1 | JSON-LD | 字數 | canonical |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const page of audit.pages) {
    const status = page.error ? page.error : String(page.status ?? '—');
    const title = (page.title || '—').replace(/\|/g, '\\|');
    const h1 = (page.h1[0] || '—').replace(/\|/g, '\\|');
    const jsonLd = page.jsonLdTypes.join(', ') || '—';
    lines.push(`| ${page.url} | ${status} | ${title} | ${h1} | ${jsonLd} | ${page.wordCount || '—'} | ${page.canonical || '—'} |`);
  }

  lines.push('', '## 4. 內容缺口（行銷產文，非工程必改）', '');
  if (!audit.contentGaps.length) {
    lines.push('主題庫主力搜尋題已有對應長文或草稿。');
  } else {
    for (const gap of audit.contentGaps) {
      lines.push(`### ${gap.priority}｜${gap.topic}`);
      lines.push('');
      lines.push(nl(gap.reason));
      lines.push('');
      if (gap.primaryKeyword) lines.push(`- 主關鍵字：${gap.primaryKeyword}`);
      if (gap.relatedTerms?.length) lines.push(`- 相關詞：${gap.relatedTerms.join('、')}`);
      if (gap.audience) lines.push(`- 受眾：${gap.audience === 'merchant' ? '業者' : '消費者'}`);
      lines.push('');
    }
  }

  lines.push('## 5. 工程驗收清單', '');
  lines.push('- [ ] 正式網域使用 HTTPS，staging／dev 子網域不要當行銷官網對外。');
  lines.push('- [ ] 首頁 `<link rel="canonical">` 指向品牌指定的正式 HTTPS 網址。');
  lines.push('- [ ] 首頁有 Organization 或 LocalBusiness JSON-LD（僅限真實營業地）。文章頁再加 Article。');
  lines.push('- [ ] FAQ 可標記，但不要期待 Google FAQ rich result。');
  lines.push('- [ ] Title／H1 使用品牌正確寫法，不要出現後台代號或未發布站名。');
  lines.push('- [ ] 拿掉未核實的客戶數、滿意度、保證效果；改成可查證的產品能力描述。');
  lines.push('- [ ] robots.txt 與 sitemap 可被抓取，sitemap 內 URL 與正式網域一致。');
  lines.push('- [ ] 官網長文走 answer-first + FAQ，發布在 `/blog/{slug}`。');
  lines.push('');
  lines.push('## 免責', '');
  lines.push('本清單由 GO 行銷中心依當下抓到的 HTML、robots、sitemap 與官網文章區產生。上線前請開發者以瀏覽器與 Search Console 再驗一次。');
  lines.push('');

  return lines.filter((line, i, arr) => !(line === '' && arr[i - 1] === '') || i === 0).join('\n');
}

export function buildSeoDeveloperHtml(input: SeoBriefInput): string {
  const { brandName, audit } = input;
  const recs = [...audit.recommendations].sort((a, b) => a.priority.localeCompare(b.priority));
  const recHtml = recs.map((rec) => `
    <article class="item">
      <div class="meta">
        <span class="p ${rec.priority}">${rec.priority}</span>
        <span class="owner">${OWNER_LABEL[rec.owner]}</span>
      </div>
      <h3>${escapeHtml(rec.title)}</h3>
      <p>${escapeHtml(nl(rec.detail))}</p>
    </article>
  `).join('');

  const findingHtml = PRIORITIES.map((priority) => {
    const list = audit.findings.filter((f) => f.priority === priority);
    if (!list.length) return '';
    return `
      <h2>${priority} Finding</h2>
      ${list.map((f) => `
        <article class="item">
          <div class="meta">
            <span class="p ${f.priority}">${f.priority}</span>
            <span class="owner">${escapeHtml(CATEGORY_LABEL[f.category])}</span>
            <code>${escapeHtml(f.id)}</code>
          </div>
          <h3>${escapeHtml(f.title)}</h3>
          <p><strong>影響：</strong>${escapeHtml(nl(f.impact))}</p>
          <p><strong>證據：</strong>${escapeHtml(nl(f.evidence))}</p>
          <p><strong>建議：</strong>${escapeHtml(nl(f.recommendation))}</p>
          ${f.url ? `<p><a href="${escapeHtml(f.url)}">${escapeHtml(f.url)}</a></p>` : ''}
        </article>
      `).join('')}
    `;
  }).join('');

  const pageRows = audit.pages.map((page) => `
    <tr>
      <td>${escapeHtml(page.url)}</td>
      <td>${escapeHtml(page.error ? page.error : String(page.status ?? '—'))}</td>
      <td>${escapeHtml(page.title || '—')}</td>
      <td>${escapeHtml(page.h1[0] || '—')}</td>
      <td>${escapeHtml(page.jsonLdTypes.join(', ') || '—')}</td>
      <td>${page.wordCount || '—'}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(brandName)} 官網 SEO 優化清單</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif; color: #1f2a1c; line-height: 1.65; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; border-bottom: 1px solid #d8e0d2; padding-bottom: 6px; margin: 28px 0 12px; }
    h3 { font-size: 14px; margin: 0 0 6px; }
    .sub { color: #5b6756; font-size: 13px; margin-bottom: 18px; }
    .item { border: 1px solid #d8e0d2; border-radius: 10px; padding: 12px 14px; margin: 0 0 10px; break-inside: avoid; }
    .meta { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 12px; }
    .p { font-weight: 700; padding: 1px 8px; border-radius: 999px; }
    .P0 { background: #f8d4d4; color: #8c2f2f; }
    .P1 { background: #fde8c8; color: #8a5a12; }
    .P2 { background: #dce8f8; color: #2b5c8a; }
    .P3 { background: #ececec; color: #555; }
    .owner { color: #5b6756; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d8e0d2; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f7f1; }
    .note { font-size: 12px; color: #5b6756; margin-top: 24px; }
    pre { white-space: pre-wrap; font-family: inherit; background: #f4f7f1; padding: 12px; border-radius: 8px; }
    @media print { button { display: none !important; } body { margin: 0; } }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;font-weight:700;cursor:pointer;">列印／另存 PDF</button>
  <h1>${escapeHtml(brandName)} 官網 SEO 優化清單</h1>
  <div class="sub">給官網開發者　·　健康分數 ${audit.healthScore} / 100　·　${escapeHtml(new Date(audit.createdAt).toLocaleString('zh-TW'))}</div>
  <pre>${escapeHtml(nl(audit.beginnerReport) || audit.summary)}</pre>
  <h2>1. 優化待辦</h2>
  ${recHtml || '<p>目前沒有待辦。</p>'}
  ${findingHtml}
  <h2>抽查頁面</h2>
  <table>
    <thead><tr><th>URL</th><th>狀態</th><th>Title</th><th>H1</th><th>JSON-LD</th><th>字數</th></tr></thead>
    <tbody>${pageRows}</tbody>
  </table>
  <p class="note">請在列印對話框選擇「儲存為 PDF」。本清單為唯讀健檢結果，上線前請再以瀏覽器與 Search Console 驗收。</p>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;
}

export function printSeoDeveloperPdf(input: SeoBriefInput): boolean {
  const html = buildSeoDeveloperHtml(input);
  const popup = window.open('', '_blank', 'width=960,height=800');
  if (!popup) {
    downloadTextFile(
      seoBriefFilename(input.brandSlug, input.audit.createdAt).replace(/\.md$/, '.html'),
      html,
      'text/html',
    );
    return false;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return true;
}
