#!/usr/bin/env node
/**
 * 從 docs/help/taskgo/*.md 產生：
 * - functions/_shared/taskgo-help-docs.ts
 * - db/migrations/029_taskgo_help_documents.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs/help/taskgo');

const CATALOG = [
  { fileName: 'office-login-workspace.md', role: 'office', pagePath: '/workspace', title: '登入與工作台' },
  { fileName: 'office-organize-staff.md', role: 'office', pagePath: '/staff', title: '組織與人員' },
  { fileName: 'office-project.md', role: 'office', pagePath: '/project', title: '專案管理' },
  { fileName: 'office-dispatch.md', role: 'office', pagePath: '/dispatch', title: '派工行事曆' },
  { fileName: 'office-task-records.md', role: 'office', pagePath: '/task-records', title: '派工紀錄與審核' },
  { fileName: 'office-improvement.md', role: 'office', pagePath: '/improvement-tasks', title: '改善任務' },
  { fileName: 'office-daily-attendance.md', role: 'office', pagePath: '/daily-summary', title: '每日報表與出勤' },
  { fileName: 'office-engineering.md', role: 'office', pagePath: '/engineering-settings', title: '工程設置' },
  { fileName: 'office-customers-quotations.md', role: 'office', pagePath: '/quotations', title: '客戶與估價單' },
  { fileName: 'office-cost-finance.md', role: 'office', pagePath: '/cost', title: '成本與財務' },
  { fileName: 'office-warehouse.md', role: 'office', pagePath: '/material-requisitions', title: '倉儲與叫料' },
  { fileName: 'office-freight.md', role: 'office', pagePath: '/freight-planner', title: '運費管理' },
  { fileName: 'office-payroll-leave.md', role: 'office', pagePath: '/payroll', title: '薪資與請假' },
  { fileName: 'office-repair.md', role: 'office', pagePath: '/repair-admin', title: '修繕管理' },
  { fileName: 'office-maintenance.md', role: 'office', pagePath: '/maintenance', title: '維護合約' },
  { fileName: 'office-moving.md', role: 'office', pagePath: '/moving-admin', title: '搬家管理' },
  { fileName: 'office-customer-accounts.md', role: 'office', pagePath: '/customer-accounts', title: '客戶帳號' },
  { fileName: 'office-subscription.md', role: 'office', pagePath: '/payments', title: '訂閱與付款' },
  { fileName: 'office-linebot-invite.md', role: 'office', pagePath: '/line-bot-invite', title: '邀請工班加入 LINE' },
  { fileName: 'office-mobile.md', role: 'office', pagePath: '/mobile', title: '後勤手機版' },
  { fileName: 'crew-linebot-join.md', role: 'crew', pagePath: '/line-bot-invite', title: '工班加入 LINE' },
  { fileName: 'crew-linebot-work.md', role: 'crew', pagePath: '/mobile/tasks', title: 'LINE 報工與完工' },
  { fileName: 'crew-mobile.md', role: 'crew', pagePath: '/mobile', title: '工班手機版' },
  { fileName: 'crew-repair-work.md', role: 'crew', pagePath: '/repair-work', title: '場勘與施工回報' },
  { fileName: 'crew-repair-status.md', role: 'crew', pagePath: '/repair-crew-status', title: '工班查修繕進度' },
  { fileName: 'crew-liff-leave.md', role: 'crew', pagePath: '/liff/leave-request', title: '請假申請' },
  { fileName: 'crew-liff-material.md', role: 'crew', pagePath: '/liff/material-requisition', title: '叫料與材料檢查' },
  { fileName: 'client-customer-view.md', role: 'client', pagePath: '/customer-view', title: '業主查看專案' },
  { fileName: 'client-repair-login.md', role: 'client', pagePath: '/repair-client', title: '修繕案件登入查詢' },
  { fileName: 'client-repair-sign.md', role: 'client', pagePath: '/repair-doc', title: '報價與驗收簽名' },
  { fileName: 'client-quotation-sign.md', role: 'client', pagePath: '/contractor-ai-quotation', title: '智能報價簽名' },
  { fileName: 'client-freight-sign.md', role: 'client', pagePath: '/freight-sign', title: '運費結算簽名' },
];

const ORIGINS = [
  'https://app.taskgo.com.tw',
  'https://dev.taskgo.com.tw',
  'http://localhost:5173',
  'https://liff.line.me',
];

const docs = CATALOG.map((item) => {
  const text = readFileSync(join(docsDir, item.fileName), 'utf8').replace(/\s+$/, '') + '\n';
  if (text.includes('$tgdoc$')) {
    throw new Error(`${item.fileName} 含有 $tgdoc$ 分隔符，請改內容`);
  }
  return { ...item, text };
});

const ts = `/** 由 scripts/generate-taskgo-help-seed.mjs 從 docs/help/taskgo 產生。請勿手改。 */
export interface TaskgoHelpDoc {
  fileName: string;
  title: string;
  roles: string[];
  pagePaths: string[];
  text: string;
}

export const TASKGO_HELP_ORIGINS = ${JSON.stringify(ORIGINS, null, 2)} as const;

export const TASKGO_HELP_DOCS: TaskgoHelpDoc[] = ${JSON.stringify(
  docs.map((d) => ({
    fileName: d.fileName,
    title: d.title,
    roles: [d.role],
    pagePaths: [d.pagePath],
    text: d.text,
  })),
  null,
  2,
)};
`;

writeFileSync(join(root, 'functions/_shared/taskgo-help-docs.ts'), ts);

const valueRows = docs.map((d, i) => {
  const comma = i === docs.length - 1 ? '' : ',';
  return `    (${sqlStr(d.fileName)}, ${sqlStr(d.title)}, ${sqlStr(d.role)}, ${sqlStr(d.pagePath)}, $tgdoc$${d.text}$tgdoc$)${comma}`;
}).join('\n');

const sql = `-- ============================================================================
-- Migration 029: 匯入／更新 TaskGo 品牌客服操作文件（32 份）
--   依 file_name 或標題 upsert，並發布。可安全重複執行。
--   來源：docs/help/taskgo/ ；此檔由 scripts/generate-taskgo-help-seed.mjs 產生。
-- ----------------------------------------------------------------------------
-- 執行方式: node scripts/apply-taskgo-help.mjs
-- ============================================================================

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://app.taskgo.com.tw'),
  ('https://dev.taskgo.com.tw'),
  ('http://localhost:5173'),
  ('https://liff.line.me')
) AS o(origin)
WHERE b.slug = 'taskgo'
ON CONFLICT (brand_id, origin) DO NOTHING;

DO $$
DECLARE
  bid UUID;
  uid UUID;
  rec RECORD;
  did UUID;
BEGIN
  SELECT id INTO bid FROM brands WHERE slug = 'taskgo';
  IF bid IS NULL THEN
    RAISE NOTICE 'skip 029: brands.slug=taskgo 不存在';
    RETURN;
  END IF;

  SELECT id INTO uid FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;

  FOR rec IN
    SELECT * FROM (VALUES
${valueRows}
    ) AS t(file_name, title, role, page_path, body)
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
        'ready', 'published', jsonb_build_array(rec.page_path),
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
        page_paths = jsonb_build_array(rec.page_path),
        published_by = COALESCE(published_by, uid),
        published_at = COALESCE(published_at, now())
      WHERE id = did;
    END IF;

    DELETE FROM cs_knowledge_document_roles WHERE document_id = did;
    INSERT INTO cs_knowledge_document_roles (document_id, role)
    VALUES (did, rec.role);
  END LOOP;
END $$;
`;

writeFileSync(join(root, 'db/migrations/029_taskgo_help_documents.sql'), sql);
console.log(`generated ${docs.length} TaskGo help documents`);

function sqlStr(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
