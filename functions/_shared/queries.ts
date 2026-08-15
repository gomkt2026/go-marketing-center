import type { Env } from './env';
import { getSql } from './db';
import { rowsToCamel, rowToCamel } from './case';

export interface DbBrand {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  currentVersionId: string | null;
  versionNumber?: number | null;
}

export function mapBrand(row: Record<string, unknown>): DbBrand & { logoInitial: string } {
  const b = rowToCamel<DbBrand>(row);
  return {
    ...b,
    tagline: b.tagline ?? '',
    primaryColor: b.primaryColor ?? '#888',
    logoInitial: b.name.charAt(0).toUpperCase(),
  };
}

export async function getAllBrands(env: Env) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT b.id, b.slug, b.name, b.tagline, b.primary_color, b.logo_url, b.current_version_id,
           v.version_number
    FROM brands b
    LEFT JOIN brand_versions v ON v.id = b.current_version_id
    WHERE b.is_active = true
    ORDER BY b.name
  `;
  return (rows as Record<string, unknown>[]).map(mapBrand);
}

export async function getBrandsForUser(env: Env, user: { role: string; brandIds: string[] }) {
  const all = await getAllBrands(env);
  if (user.role === 'super_admin') return all;
  const allowed = new Set(user.brandIds);
  return all.filter((b) => allowed.has(b.id));
}

export async function getBrandBySlug(env: Env, slug: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, slug, name, tagline, primary_color, logo_url, current_version_id
    FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1
  `;
  if (!rows.length) return null;
  return mapBrand(rows[0] as Record<string, unknown>);
}

export async function getBrandVersion(env: Env, brandId: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, brand_id, version_number, status, summary_of_changes, confidence_score, published_by, published_at
    FROM brand_versions
    WHERE brand_id = ${brandId}::uuid AND status = 'published'
    ORDER BY version_number DESC LIMIT 1
  `;
  if (!rows.length) return null;
  return rowToCamel(rows[0] as Record<string, unknown>);
}

export async function getUsers(env: Env) {
  const sql = getSql(env);
  const rows = await sql`SELECT id, email, display_name, role, avatar_url FROM users WHERE is_active = true`;
  return rowsToCamel(rows as Record<string, unknown>[]);
}

export async function getAgents(env: Env) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.brand_id, a.display_name, a.avatar_color, r.code AS role_code
    FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.is_active = true
  `;
  return rowsToCamel(rows as Record<string, unknown>[]);
}
