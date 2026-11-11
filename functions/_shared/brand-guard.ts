import type { Env } from './env';
import {
  canAccessAnyBrand,
  canAccessBrandSlug,
  forbidden,
  isSuperAdmin,
  requireAuth,
  type AuthUser,
} from './auth';
import { getSql } from './db';
import { error } from './response';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function apiParts(url: string): string[] {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return parts[0] === 'api' ? parts.slice(1) : parts;
}

/** /api/<group>/<uuid>/... 的 uuid；不是 uuid 就回 null，讓列表路由自己過濾。 */
export function resourceUuid(url: string, group: string): string | null {
  const parts = apiParts(url);
  if (parts[0] !== group) return null;
  const id = parts[1];
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

async function authorize(request: Request, env: Env): Promise<AuthUser | Response> {
  return requireAuth(request, env);
}

function allowBrands(user: AuthUser, brandIds: Array<string | null | undefined>, missingMessage: string, found: boolean): Response | null {
  if (!found) return error(missingMessage, 404);
  if (canAccessAnyBrand(user, brandIds)) return null;
  return forbidden();
}

export async function guardContent(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'contents');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM contents WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], '找不到內容', rows.length > 0);
}

export async function guardVideoJob(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'video-jobs');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM video_jobs WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], '找不到短影音', rows.length > 0);
}

export async function guardMeeting(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'meetings');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM meetings WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], 'Meeting not found', rows.length > 0);
}

export async function guardAgent(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'agents');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM ai_agents WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], '找不到 Agent', rows.length > 0);
}

export async function guardBrandRule(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'brand-rules');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM brand_rules WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], 'Not found', rows.length > 0);
}

export async function guardMarketSignal(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'market-signals');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`SELECT brand_id FROM market_signals WHERE id = ${id}::uuid LIMIT 1`;
  const brandId = (rows[0] as { brand_id: string | null } | undefined)?.brand_id ?? null;
  return allowBrands(auth, [brandId], 'Not found', rows.length > 0);
}

export async function guardProposal(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'proposals');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const sql = getSql(env);
  const rows = await sql`
    SELECT brand_id, collaboration_id FROM proposals WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('Proposal not found', 404);
  if (isSuperAdmin(auth)) return null;
  const row = rows[0] as { brand_id: string | null; collaboration_id: string | null };
  if (row.brand_id && canAccessAnyBrand(auth, [row.brand_id])) return null;
  if (row.collaboration_id) {
    const brands = await sql`
      SELECT brand_id FROM collaboration_brands WHERE collaboration_id = ${row.collaboration_id}::uuid
    `;
    if (canAccessAnyBrand(auth, (brands as { brand_id: string }[]).map((b) => b.brand_id))) return null;
  }
  return forbidden();
}

export async function guardCollaboration(request: Request, env: Env): Promise<Response | null> {
  const id = resourceUuid(request.url, 'collaborations');
  if (!id) return null;
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  if (isSuperAdmin(auth)) return null;
  const sql = getSql(env);
  const rows = await sql`SELECT id FROM collaborations WHERE id = ${id}::uuid LIMIT 1`;
  if (!rows.length) return error('Collaboration not found', 404);
  const brands = await sql`
    SELECT brand_id FROM collaboration_brands WHERE collaboration_id = ${id}::uuid
  `;
  if (canAccessAnyBrand(auth, (brands as { brand_id: string }[]).map((b) => b.brand_id))) return null;
  return forbidden();
}

export async function guardPodcast(request: Request, env: Env): Promise<Response | null> {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  if (isSuperAdmin(auth)) return null;

  const parts = apiParts(request.url);
  if (parts[0] !== 'podcast') return null;
  const head = parts[1];
  const bbbox = canAccessBrandSlug(auth, 'bbbox');

  if (head === 'theme' || head === 'interview') return forbidden();
  if (head === 'guests') return bbbox ? null : forbidden();

  const id = head && UUID_RE.test(head) ? head : null;
  if (!id) return null;

  const sql = getSql(env);
  const rows = await sql`SELECT show_slug FROM podcast_episodes WHERE id = ${id}::uuid LIMIT 1`;
  if (!rows.length) return error('找不到節目', 404);
  const show = (rows[0] as { show_slug: string | null }).show_slug ?? 'trio';
  if (show === 'bbbox' && bbbox) return null;
  return forbidden();
}
