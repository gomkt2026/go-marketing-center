#!/usr/bin/env node
/**
 * 從 docs/help/washgo/*.md 產生：
 * - functions/_shared/washgo-help-docs.ts
 * - db/migrations/031_washgo_help_documents.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs/help/washgo');

const CATALOG = [
  { fileName: 'customer-getting-started.md', roles: ['customer'], pagePaths: ['/customer/register'], title: '第一次使用' },
  { fileName: 'customer-register.md', roles: ['customer'], pagePaths: ['/customer/register'], title: '會員登錄' },
  { fileName: 'customer-home-pickup.md', roles: ['customer'], pagePaths: ['/customer/order/new'], title: '到府送洗預約' },
  { fileName: 'customer-store-dropoff.md', roles: ['customer'], pagePaths: ['/customer/store-dropoff'], title: '門市自助送洗' },
  { fileName: 'customer-quote-confirm.md', roles: ['customer'], pagePaths: ['/customer/order/:id/confirm'], title: '報價確認與簽名' },
  { fileName: 'customer-order-progress.md', roles: ['customer'], pagePaths: ['/customer/order/:id'], title: '訂單進度' },
  { fileName: 'customer-points-topup.md', roles: ['customer'], pagePaths: ['/customer/points'], title: '點數與儲值' },
  { fileName: 'staff-join.md', roles: ['staff'], pagePaths: ['/staff/register'], title: '員工加入與帳號' },
  { fileName: 'staff-operations.md', roles: ['staff'], pagePaths: ['/dashboard/modules/operations'], title: '開班與待辦' },
  { fileName: 'staff-walkin-inbox.md', roles: ['staff'], pagePaths: ['/dashboard/modules/walkin'], title: '收件與受理' },
  { fileName: 'staff-checkin.md', roles: ['staff'], pagePaths: ['/dashboard/modules/checkin'], title: '收貨覆核' },
  { fileName: 'staff-quote.md', roles: ['staff'], pagePaths: ['/dashboard/modules/quote'], title: '報價' },
  { fileName: 'staff-qc.md', roles: ['staff'], pagePaths: ['/dashboard/modules/qc'], title: '品管' },
  { fileName: 'staff-store-pickup.md', roles: ['staff'], pagePaths: ['/dashboard/modules/store-pickup'], title: '回貨與待取件' },
  { fileName: 'staff-customers-points.md', roles: ['staff'], pagePaths: ['/dashboard/modules/points-topup'], title: '客戶與點數' },
  { fileName: 'driver-today-tasks.md', roles: ['driver'], pagePaths: ['/staff/driver/tasks'], title: '今日任務' },
  { fileName: 'driver-pickup.md', roles: ['driver'], pagePaths: ['/staff/driver/tasks'], title: '到府取件' },
  { fileName: 'driver-return.md', roles: ['driver'], pagePaths: ['/staff/driver/return-v2/:id'], title: '配送送回' },
  { fileName: 'driver-no-tasks.md', roles: ['driver'], pagePaths: ['/staff/driver/tasks'], title: '沒有任務時' },
];

const ORIGINS = [
  'https://washgo.pages.dev',
  'https://washgo-liff.pages.dev',
  'https://liff.line.me',
  'http://localhost:3000',
  'http://localhost:3001',
];

const docs = CATALOG.map((item) => {
  const text = readFileSync(join(docsDir, item.fileName), 'utf8').replace(/\s+$/, '') + '\n';
  if (text.includes('$wgdoc$')) {
    throw new Error(`${item.fileName} 含有 $wgdoc$ 分隔符，請改內容`);
  }
  return { ...item, text };
});

const ts = `/** 由 scripts/generate-washgo-help-seed.mjs 從 docs/help/washgo 產生。請勿手改。 */
export interface WashgoHelpDoc {
  fileName: string;
  title: string;
  roles: string[];
  pagePaths: string[];
  text: string;
}

export const WASHGO_HELP_ORIGINS = ${JSON.stringify(ORIGINS, null, 2)} as const;

export const WASHGO_HELP_DOCS: WashgoHelpDoc[] = ${JSON.stringify(
  docs.map((d) => ({
    fileName: d.fileName,
    title: d.title,
    roles: d.roles,
    pagePaths: d.pagePaths,
    text: d.text,
  })),
  null,
  2,
)};
`;

writeFileSync(join(root, 'functions/_shared/washgo-help-docs.ts'), ts);

const valueRows = docs.map((d, i) => {
  const comma = i === docs.length - 1 ? '' : ',';
  return `    (${sqlStr(d.fileName)}, ${sqlStr(d.title)}, ${sqlStr(d.roles.join(','))}, ${sqlStr(d.pagePaths.join(','))}, $wgdoc$${d.text}$wgdoc$)${comma}`;
}).join('\n');

const originValues = ORIGINS.map((o) => `  (${sqlStr(o)})`).join(',\n');

const sql = `-- ============================================================================
-- Migration 031: 匯入／更新 Washgo 品牌客服操作文件（19 份）
--   依 file_name 或標題 upsert，並發布。可安全重複執行。
--   來源：docs/help/washgo/ ；此檔由 scripts/generate-washgo-help-seed.mjs 產生。
-- ----------------------------------------------------------------------------
-- 執行方式: node scripts/apply-washgo-help.mjs
-- ============================================================================

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
${originValues}
) AS o(origin)
WHERE b.slug = 'washgo'
ON CONFLICT (brand_id, origin) DO NOTHING;

DO $$
DECLARE
  bid UUID;
  uid UUID;
  rec RECORD;
  did UUID;
BEGIN
  SELECT id INTO bid FROM brands WHERE slug = 'washgo';
  IF bid IS NULL THEN
    RAISE NOTICE 'skip 031: brands.slug=washgo 不存在';
    RETURN;
  END IF;

  SELECT id INTO uid FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;

  FOR rec IN
    SELECT * FROM (VALUES
${valueRows}
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
`;

writeFileSync(join(root, 'db/migrations/031_washgo_help_documents.sql'), sql);
console.log(`generated ${docs.length} Washgo help documents`);

function sqlStr(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
