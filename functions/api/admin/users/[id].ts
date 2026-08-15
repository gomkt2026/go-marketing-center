import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth, isSuperAdmin, forbidden } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { hashPassword } from '../../../_shared/password';

const ASSIGNABLE_ROLES = new Set(['brand_manager', 'brand_editor', 'viewer']);

interface UpdateBody {
  displayName?: string;
  username?: string;
  password?: string;
  email?: string;
  role?: string;
  brandIds?: string[];
  isActive?: boolean;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return forbidden();

  const id = context.params.id as string;
  let body: UpdateBody;
  try {
    body = await context.request.json() as UpdateBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT id, email, username, display_name, role, is_active, password_hash, created_at
    FROM users WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!existing.length) return error('使用者不存在', 404);
  const current = existing[0] as Record<string, unknown>;
  if (current.role === 'super_admin') return error('不能從後台修改集團管理者帳號', 400);

  const displayName = body.displayName?.trim() ?? (current.display_name as string);
  const username = body.username !== undefined ? body.username.trim() : (current.username as string | null);
  const email = body.email !== undefined
    ? (body.email.trim() || `${username ?? id}@login.go-mkt.tw`)
    : (current.email as string);
  const role = body.role ?? (current.role as string);
  const isActive = body.isActive ?? (current.is_active as boolean);

  if (!displayName) return error('請填寫顯示名稱', 400);
  if (username && username.length < 3) return error('登入帳號至少 3 個字元', 400);
  if (body.password !== undefined && body.password.length > 0 && body.password.length < 6) {
    return error('密碼至少 6 個字元', 400);
  }
  if (!ASSIGNABLE_ROLES.has(role)) return error('角色僅能是品牌負責人、編輯或唯讀', 400);

  let passwordHash = current.password_hash as string | null;
  if (body.password) passwordHash = await hashPassword(body.password);

  try {
    const updated = await sql`
      UPDATE users SET
        display_name = ${displayName},
        username = ${username || null},
        email = ${email},
        role = ${role}::user_role,
        is_active = ${isActive},
        password_hash = ${passwordHash}
      WHERE id = ${id}::uuid
      RETURNING id, email, username, display_name, role, is_active, password_hash, created_at
    `;
    const row = updated[0] as Record<string, unknown>;

    let brandIds: string[] = [];
    if (Array.isArray(body.brandIds)) {
      brandIds = body.brandIds.filter(Boolean);
      if (!brandIds.length) return error('請至少指定一個品牌', 400);
      const validBrands = await sql`SELECT id FROM brands WHERE is_active = true`;
      const valid = new Set((validBrands as { id: string }[]).map((b) => b.id));
      if (brandIds.some((bid) => !valid.has(bid))) return error('指定的品牌不存在', 400);
      await sql`DELETE FROM brand_members WHERE user_id = ${id}::uuid`;
      for (const brandId of brandIds) {
        await sql`
          INSERT INTO brand_members (brand_id, user_id, role)
          VALUES (${brandId}::uuid, ${id}::uuid, ${role}::user_role)
        `;
      }
    } else {
      const mem = await sql`SELECT brand_id FROM brand_members WHERE user_id = ${id}::uuid`;
      brandIds = (mem as { brand_id: string }[]).map((m) => m.brand_id);
    }

    const slugRows = brandIds.length
      ? await sql`SELECT id, slug FROM brands WHERE is_active = true`
      : [];
    const slugById = new Map((slugRows as { id: string; slug: string }[]).map((b) => [b.id, b.slug]));

    return json({
      user: {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        username: row.username ?? null,
        role: row.role,
        isActive: row.is_active,
        hasPassword: Boolean(row.password_hash),
        brandIds,
        brandSlugs: brandIds.map((bid) => slugById.get(bid)).filter((s): s is string => Boolean(s)),
        createdAt: row.created_at,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('users_username') || message.includes('idx_users_username')) {
      return error('此登入帳號已被使用', 409);
    }
    if (message.includes('users_email') || message.includes('email')) {
      return error('此 Email 已被使用', 409);
    }
    return error(message || '更新帳號失敗', 500);
  }
};
