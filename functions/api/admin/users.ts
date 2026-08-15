import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin, forbidden } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';
import { hashPassword } from '../../_shared/password';

const ASSIGNABLE_ROLES = new Set(['brand_manager', 'brand_editor', 'viewer']);

interface CreateBody {
  displayName?: string;
  username?: string;
  password?: string;
  email?: string;
  role?: string;
  brandIds?: string[];
}

function mapManagedUser(row: Record<string, unknown>, brandIds: string[], brandSlugs: string[]) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    username: row.username ?? null,
    role: row.role,
    isActive: row.is_active,
    hasPassword: Boolean(row.password_hash),
    brandIds,
    brandSlugs,
    createdAt: row.created_at,
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return forbidden();

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, email, username, display_name, role, is_active, password_hash, created_at
    FROM users
    ORDER BY created_at ASC
  `;
  const memberRows = await sql`
    SELECT m.user_id, b.id AS brand_id, b.slug
    FROM brand_members m
    JOIN brands b ON b.id = m.brand_id
    WHERE b.is_active = true
    ORDER BY b.name
  `;
  const byUser = new Map<string, { brandIds: string[]; brandSlugs: string[] }>();
  for (const m of memberRows as { user_id: string; brand_id: string; slug: string }[]) {
    const cur = byUser.get(m.user_id) ?? { brandIds: [], brandSlugs: [] };
    cur.brandIds.push(m.brand_id);
    cur.brandSlugs.push(m.slug);
    byUser.set(m.user_id, cur);
  }

  const users = (rows as Record<string, unknown>[]).map((row) => {
    const mem = byUser.get(row.id as string) ?? { brandIds: [], brandSlugs: [] };
    return mapManagedUser(row, mem.brandIds, mem.brandSlugs);
  });

  return json({ users });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return forbidden();

  let body: CreateBody;
  try {
    body = await context.request.json() as CreateBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const displayName = body.displayName?.trim() ?? '';
  const username = body.username?.trim() ?? '';
  const password = body.password ?? '';
  const role = body.role ?? 'brand_manager';
  const brandIds = Array.isArray(body.brandIds) ? body.brandIds.filter(Boolean) : [];

  if (!displayName) return error('請填寫顯示名稱', 400);
  if (!username) return error('請填寫登入帳號', 400);
  if (username.length < 3) return error('登入帳號至少 3 個字元', 400);
  if (!password || password.length < 6) return error('密碼至少 6 個字元', 400);
  if (!ASSIGNABLE_ROLES.has(role)) return error('角色僅能是品牌負責人、編輯或唯讀', 400);
  if (!brandIds.length) return error('請至少指定一個品牌', 400);

  const email = (body.email?.trim() || `${username}@login.go-mkt.tw`).toLowerCase();
  const sql = getSql(context.env);

  const brandRows = await sql`SELECT id, slug FROM brands WHERE is_active = true`;
  const brandById = new Map((brandRows as { id: string; slug: string }[]).map((b) => [b.id, b.slug]));
  if (brandIds.some((id) => !brandById.has(id))) {
    return error('指定的品牌不存在', 400);
  }

  const passwordHash = await hashPassword(password);

  try {
    const inserted = await sql`
      INSERT INTO users (email, username, password_hash, display_name, role)
      VALUES (${email}, ${username}, ${passwordHash}, ${displayName}, ${role}::user_role)
      RETURNING id, email, username, display_name, role, is_active, password_hash, created_at
    `;
    const row = inserted[0] as Record<string, unknown>;
    const userId = row.id as string;

    for (const brandId of brandIds) {
      await sql`
        INSERT INTO brand_members (brand_id, user_id, role)
        VALUES (${brandId}::uuid, ${userId}::uuid, ${role}::user_role)
        ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role
      `;
    }

    return json({
      user: mapManagedUser(
        row,
        brandIds,
        brandIds.map((id) => brandById.get(id)).filter((s): s is string => Boolean(s)),
      ),
    }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('users_username') || message.includes('idx_users_username')) {
      return error('此登入帳號已被使用', 409);
    }
    if (message.includes('users_email') || message.includes('email')) {
      return error('此 Email 已被使用', 409);
    }
    return error(message || '建立帳號失敗', 500);
  }
};
