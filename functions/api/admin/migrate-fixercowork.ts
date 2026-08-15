import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

const FORM_FIELDS = JSON.stringify([
  { key: 'company', label: '公司名稱', type: 'text', required: true },
  { key: 'industry', label: '產業別', type: 'select', required: true, options: ['房仲業', '包租代管業', '室內裝修', '油漆防水', '水電工程', '清潔除蟲', '拆除清運', '工程整合', '居服', '社區大樓管理', '其他'] },
  { key: 'expertise', label: '專長', type: 'text', required: true },
  { key: 'years_experience', label: '該產業年資（年）', type: 'number', required: true },
  { key: 'how_heard', label: '如何得知商會', type: 'select', required: true, options: ['朋友介紹', '商會成員轉介', 'LINE 或社群', 'EDM 或傳單', '其他'] },
  { key: 'chambers', label: '現行加入的商會', type: 'checkbox', required: true, options: ['扶輪社', '獅子會', 'BNI', '21克拉工程聯盟', '其他', '尚未加入'] },
  { key: 'chambers_other', label: '其他商會名稱', type: 'text', required: false },
  { key: 'introducer', label: '本次活動介紹人', type: 'text', required: false },
  { key: 'amway_heard', label: '是否聽過安麗課程或內容（含淨水器、空氣清淨機）', type: 'select', required: true, options: ['是', '略有聽過', '否'] },
  { key: 'amway_branch', label: '安麗分會', type: 'text', required: false },
  { key: 'accept_repair_jobs', label: '是否願意承接修繕中心派案', type: 'select', required: true, options: ['是', '再考慮', '否'] },
  { key: 'uses_site_system', label: '是否用系統做案場管理', type: 'select', required: true, options: ['是', '否'] },
  { key: 'site_system_name', label: '使用的系統名稱', type: 'text', required: false },
]);

const EVENT_DESCRIPTION = [
  '攜手合作 · 共創商機 · 共贏未來',
  '',
  '會議流程',
  '1. 商會介紹與本次交流目的',
  '2. 目前合作產業說明',
  '3. 共同產業鏈的建立',
  '4. 報價方式與分潤模式',
  '5. 與會者自我介紹',
  '6. 各產業優惠與廣告行銷策略',
  '7. 市場開發與未來展望',
  '',
  '市場焦點',
  '已成熟市場：包租代管、社宅',
  '積極開發中：居服、社區大樓',
].join('\n');

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const sql = getSql(context.env);
  const steps: string[] = [];

  try {
    await sql`
      INSERT INTO users (email, display_name, role)
      VALUES ('manager@fixercowork.tw', 'FIXERCOWORK 品牌負責人', 'brand_manager')
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        is_active = true
    `;
    steps.push('user:manager@fixercowork.tw');

    await sql`
      INSERT INTO brands (slug, name, tagline, primary_color, logo_url, is_active)
      VALUES (
        'fixercowork', 'FIXERCOWORK', 'REPAIR & MAINTAIN SOLUTIONS',
        '#1A2F4B', '/brands/fixercowork-logo.png', true
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        tagline = EXCLUDED.tagline,
        primary_color = EXCLUDED.primary_color,
        logo_url = EXCLUDED.logo_url,
        is_active = true
    `;
    steps.push('brand:fixercowork');

    await sql`
      INSERT INTO brand_members (brand_id, user_id, role)
      SELECT b.id, u.id, 'brand_manager'::user_role
      FROM brands b
      JOIN users u ON u.email = 'manager@fixercowork.tw'
      WHERE b.slug = 'fixercowork'
      ON CONFLICT (brand_id, user_id) DO NOTHING
    `;
    await sql`
      INSERT INTO brand_members (brand_id, user_id, role)
      SELECT b.id, u.id, 'super_admin'::user_role
      FROM brands b
      CROSS JOIN LATERAL (
        SELECT id FROM users
        WHERE role = 'super_admin' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      ) u
      WHERE b.slug = 'fixercowork'
      ON CONFLICT (brand_id, user_id) DO NOTHING
    `;
    steps.push('brand_members');

    await sql`
      INSERT INTO brand_versions (
        brand_id, version_number, status, summary_of_changes, confidence_score, published_by, published_at
      )
      SELECT
        b.id, 1, 'published',
        '首版:FIXERCOWORK 修繕共創品牌',
        0.90, u.id, now()
      FROM brands b
      JOIN users u ON u.email = 'manager@fixercowork.tw'
      WHERE b.slug = 'fixercowork'
        AND NOT EXISTS (
          SELECT 1 FROM brand_versions v WHERE v.brand_id = b.id AND v.version_number = 1
        )
    `;
    await sql`
      UPDATE brands
      SET current_version_id = v.id
      FROM brand_versions v
      WHERE brands.slug = 'fixercowork'
        AND v.brand_id = brands.id
        AND v.version_number = 1
        AND brands.current_version_id IS NULL
    `;
    steps.push('brand_version:v1');

    const existing = await sql`SELECT id FROM events WHERE slug = 'fixercowork-biz-exchange-0828' LIMIT 1`;
    if (!existing.length) {
      await sql`
        INSERT INTO events (
          brand_id, slug, title, description, location, event_date, status,
          staff_token, form_fields, created_by
        )
        SELECT
          b.id,
          'fixercowork-biz-exchange-0828',
          '商業交流會議',
          ${EVENT_DESCRIPTION},
          '台中市五權西路二段666號15樓',
          TIMESTAMPTZ '2026-08-28 13:30:00+08',
          'open',
          encode(gen_random_bytes(24), 'hex'),
          ${FORM_FIELDS}::jsonb,
          u.id
        FROM brands b
        JOIN users u ON u.email = 'manager@fixercowork.tw'
        WHERE b.slug = 'fixercowork'
      `;
      await sql`
        INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
        SELECT
          e.id,
          '8/28（五）13:30 入場 · 16:30 結束',
          TIMESTAMPTZ '2026-08-28 13:30:00+08',
          NULL,
          1
        FROM events e
        WHERE e.slug = 'fixercowork-biz-exchange-0828'
          AND NOT EXISTS (SELECT 1 FROM event_sessions s WHERE s.event_id = e.id)
      `;
      steps.push('event:fixercowork-biz-exchange-0828');
    } else {
      steps.push('event:fixercowork-biz-exchange-0828(already exists, skipped)');
    }

    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? `${e.message} (after steps: ${steps.join(', ')})` : 'Migration failed', 500);
  }
};
