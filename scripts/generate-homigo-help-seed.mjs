#!/usr/bin/env node
/**
 * 從 docs/help/homigo/*.md 產生：
 * - functions/_shared/homigo-help-docs.ts
 * - db/migrations/030_homigo_help_documents.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs/help/homigo');

const CATALOG = [
  { fileName: 'landlord-add-property.md', roles: ['landlord'], pagePaths: ['/properties', '/properties/new'], title: '我要怎麼新增物件？' },
  { fileName: 'landlord-invite-tenant.md', roles: ['landlord'], pagePaths: ['/tenants'], title: '我要怎麼邀請房客、審核綁定？' },
  { fileName: 'landlord-lease-sign.md', roles: ['landlord'], pagePaths: ['/leases', '/signatures'], title: '我要怎麼建立租約與電子簽名？' },
  { fileName: 'landlord-rent-review.md', roles: ['landlord'], pagePaths: ['/rent-overview', '/payments'], title: '我要怎麼看收租、審核繳租？' },
  { fileName: 'landlord-repair.md', roles: ['landlord'], pagePaths: ['/maintenance', '/equipment-events'], title: '房客報修後我要怎麼處理？' },
  { fileName: 'landlord-movein-moveout.md', roles: ['landlord'], pagePaths: ['/properties', '/leases'], title: '入住點交與退租怎麼走？' },
  { fileName: 'tenant-pay-rent.md', roles: ['tenant'], pagePaths: ['/payment'], title: '我要怎麼繳租、上傳憑證？' },
  { fileName: 'tenant-repair.md', roles: ['tenant'], pagePaths: ['/maintenance', '/equipment-events'], title: '我要怎麼報修、看進度？' },
  { fileName: 'tenant-meter.md', roles: ['tenant'], pagePaths: ['/meter'], title: '電表怎麼抄、怎麼上傳？' },
  { fileName: 'tenant-movein.md', roles: ['tenant'], pagePaths: ['/check-in', '/move-in-photos'], title: '入住確認與起租拍照怎麼做？' },
  { fileName: 'tenant-moveout.md', roles: ['tenant'], pagePaths: ['/move-out-agreement', '/move-out-progress'], title: '退租結算怎麼確認？' },
  { fileName: 'tenant-messages.md', roles: ['tenant'], pagePaths: ['/messages'], title: '怎麼留言、回覆續約？' },
  { fileName: 'manager-cc-login.md', roles: ['manager'], pagePaths: ['/login'], title: '指揮中心怎麼用 LINE 登入？' },
  { fileName: 'manager-rent.md', roles: ['manager'], pagePaths: ['/rent'], title: '收租審核與催收在哪裡做？' },
  { fileName: 'manager-repair.md', roles: ['manager'], pagePaths: ['/repair'], title: '報修案件怎麼看、怎麼派？' },
  { fileName: 'manager-listing.md', roles: ['manager'], pagePaths: ['/listing'], title: '招租刊登與帶看在哪裡？' },
  { fileName: 'manager-moveout.md', roles: ['manager'], pagePaths: ['/moveout-center'], title: '退租中心怎麼處理？' },
  { fileName: 'manager-team.md', roles: ['manager'], pagePaths: ['/team'], title: '怎麼加團隊成員？' },
  { fileName: 'faq-liff-blank.md', roles: ['landlord', 'tenant', 'manager'], pagePaths: ['/'], title: '打不開 LIFF／白畫面怎麼辦？' },
  { fileName: 'faq-phone-change.md', roles: ['landlord', 'tenant', 'manager'], pagePaths: ['/'], title: '換手機後租約不見了？' },
  { fileName: 'faq-rent-rejected.md', roles: ['landlord', 'tenant'], pagePaths: ['/payment', '/rent-overview'], title: '繳租審核被退回怎麼辦？' },
];

const ORIGINS = [
  'https://cc.homigo.workers.dev',
  'https://liff.line.me',
  'http://localhost:5173',
];

const docs = CATALOG.map((item) => {
  const text = readFileSync(join(docsDir, item.fileName), 'utf8').replace(/\s+$/, '') + '\n';
  if (text.includes('$hgdoc$')) {
    throw new Error(`${item.fileName} 含有 $hgdoc$ 分隔符，請改內容`);
  }
  return { ...item, text };
});

const ts = `/** 由 scripts/generate-homigo-help-seed.mjs 從 docs/help/homigo 產生。請勿手改。 */
export interface HomigoHelpDoc {
  fileName: string;
  title: string;
  roles: string[];
  pagePaths: string[];
  text: string;
}

export const HOMIGO_HELP_ORIGINS = ${JSON.stringify(ORIGINS, null, 2)} as const;

export const HOMIGO_HELP_DOCS: HomigoHelpDoc[] = ${JSON.stringify(
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

writeFileSync(join(root, 'functions/_shared/homigo-help-docs.ts'), ts);

const valueRows = docs.map((d, i) => {
  const comma = i === docs.length - 1 ? '' : ',';
  return `    (${sqlStr(d.fileName)}, ${sqlStr(d.title)}, ${sqlStr(d.roles.join(','))}, ${sqlStr(d.pagePaths.join(','))}, $hgdoc$${d.text}$hgdoc$)${comma}`;
}).join('\n');

const originValues = ORIGINS.map((o) => `  (${sqlStr(o)})`).join(',\n');

const sql = `-- ============================================================================
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
${originValues}
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

writeFileSync(join(root, 'db/migrations/030_homigo_help_documents.sql'), sql);
console.log(`generated ${docs.length} Homigo help documents`);

function sqlStr(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
