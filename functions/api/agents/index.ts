import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json } from '../../_shared/response';

// 列出所有啟用中的 AI Agent(含人設),供人設編輯頁與會議室使用
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT a.id, a.display_name, a.persona, a.is_active, a.brand_id,
           r.code AS role_code, b.slug AS brand_slug, b.name AS brand_name
    FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    LEFT JOIN brands b ON b.id = a.brand_id
    WHERE a.is_active = true
    ORDER BY b.name NULLS LAST, a.display_name
  `;

  const agents = (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    roleCode: r.role_code,
    brandId: r.brand_id,
    brandSlug: r.brand_slug,
    brandName: r.brand_name,
    persona: r.persona ?? {},
  }));

  return json({ agents });
};
