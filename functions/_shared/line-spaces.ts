import type { Env } from './env';
import { getSql } from './db';
import type { AuthUser } from './auth';
import { rowToCamel } from './case';

const LINE_API = 'https://api.line.me/v2/bot';

export type LineSpaceType = 'group' | 'room';
export type LineSpaceStatus = 'active' | 'left';

export interface LineOpsSpace {
  id: string;
  conversationId: string;
  spaceType: LineSpaceType;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  memberCount: number | null;
  status: LineSpaceStatus;
  boundByUserId: string | null;
  boundByName: string | null;
  boundByLineUserId: string | null;
  boundAt: string | null;
  joinedAt: string;
  leftAt: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineOpsSource {
  type?: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface OpsLineUser {
  id: string;
  displayName: string;
  role: string;
  brandIds: string[];
  brandSlugs: string[];
  lineUserId: string;
}

let spacesEnsured = false;

export function isMissingRelation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist/i.test(msg);
}

export async function ensureLineOpsSpaceTables(env: Env): Promise<void> {
  if (spacesEnsured) return;
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS line_ops_spaces (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id         TEXT NOT NULL UNIQUE,
      space_type              TEXT NOT NULL,
      brand_id                UUID REFERENCES brands(id) ON DELETE SET NULL,
      display_name            TEXT,
      picture_url             TEXT,
      member_count            INTEGER,
      status                  TEXT NOT NULL DEFAULT 'active',
      bound_by_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
      bound_by_line_user_id   TEXT,
      bound_at                TIMESTAMPTZ,
      joined_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
      left_at                 TIMESTAMPTZ,
      last_event_at           TIMESTAMPTZ,
      last_event_type         TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT line_ops_spaces_type_check CHECK (space_type IN ('group', 'room')),
      CONSTRAINT line_ops_spaces_status_check CHECK (status IN ('active', 'left'))
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_ops_spaces_brand ON line_ops_spaces(brand_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_ops_spaces_status ON line_ops_spaces(status, last_event_at DESC)`;
  await sql`DROP TRIGGER IF EXISTS trg_line_ops_spaces_updated_at ON line_ops_spaces`;
  await sql`
    CREATE TRIGGER trg_line_ops_spaces_updated_at BEFORE UPDATE ON line_ops_spaces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `;
  spacesEnsured = true;
}

export function lineConversationId(source?: LineOpsSource): string | null {
  return source?.groupId || source?.roomId || null;
}

export function lineSpaceType(source?: LineOpsSource): LineSpaceType {
  if (source?.roomId && !source.groupId) return 'room';
  return 'group';
}

function mapSpace(row: Record<string, unknown>): LineOpsSpace {
  const space = rowToCamel<LineOpsSpace>(row);
  return {
    ...space,
    brandSlug: (row.brand_slug as string | null) ?? space.brandSlug ?? null,
    brandName: (row.brand_name as string | null) ?? space.brandName ?? null,
    boundByName: (row.bound_by_name as string | null) ?? space.boundByName ?? null,
  };
}

export async function getLineSpace(env: Env, conversationId: string): Promise<LineOpsSpace | null> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT
        s.id, s.conversation_id, s.space_type, s.brand_id, s.display_name, s.picture_url,
        s.member_count, s.status, s.bound_by_user_id, s.bound_by_line_user_id, s.bound_at,
        s.joined_at, s.left_at, s.last_event_at, s.last_event_type, s.created_at, s.updated_at,
        b.slug AS brand_slug, b.name AS brand_name, u.display_name AS bound_by_name
      FROM line_ops_spaces s
      LEFT JOIN brands b ON b.id = s.brand_id
      LEFT JOIN users u ON u.id = s.bound_by_user_id
      WHERE s.conversation_id = ${conversationId}
      LIMIT 1
    `;
    if (!rows.length) return null;
    return mapSpace(rows[0] as Record<string, unknown>);
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
    return null;
  }
}

async function lineGetJson(env: Env, path: string): Promise<Record<string, unknown> | null> {
  const token = env.LINE_OPS_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function refreshLineSpaceProfile(env: Env, space: {
  conversationId: string;
  spaceType: LineSpaceType;
}): Promise<{ displayName: string | null; pictureUrl: string | null; memberCount: number | null }> {
  const base = space.spaceType === 'room'
    ? `/room/${encodeURIComponent(space.conversationId)}`
    : `/group/${encodeURIComponent(space.conversationId)}`;
  const summary = space.spaceType === 'group'
    ? await lineGetJson(env, `${base}/summary`)
    : null;
  const count = await lineGetJson(env, `${base}/members/count`);
  const displayName = typeof summary?.groupName === 'string' ? summary.groupName : null;
  const pictureUrl = typeof summary?.pictureUrl === 'string' ? summary.pictureUrl : null;
  const memberCount = typeof count?.count === 'number' ? count.count : null;
  if (displayName || pictureUrl || memberCount != null) {
    const sql = getSql(env);
    await sql`
      UPDATE line_ops_spaces SET
        display_name = coalesce(${displayName}, display_name),
        picture_url = coalesce(${pictureUrl}, picture_url),
        member_count = coalesce(${memberCount}, member_count),
        updated_at = now()
      WHERE conversation_id = ${space.conversationId}
    `;
  }
  return { displayName, pictureUrl, memberCount };
}

async function upsertLineSpaceEvent(
  env: Env,
  conversationId: string,
  spaceType: LineSpaceType,
  eventType: string,
): Promise<void> {
  const sql = getSql(env);
  const left = eventType === 'leave';
  await sql`
    INSERT INTO line_ops_spaces (
      conversation_id, space_type, status, joined_at, left_at, last_event_at, last_event_type
    ) VALUES (
      ${conversationId}, ${spaceType},
      ${left ? 'left' : 'active'},
      now(), ${left ? new Date().toISOString() : null}::timestamptz,
      now(), ${eventType}
    )
    ON CONFLICT (conversation_id) DO UPDATE SET
      space_type = EXCLUDED.space_type,
      status = ${left ? 'left' : 'active'},
      left_at = CASE WHEN ${left} THEN now() ELSE NULL END,
      last_event_at = now(),
      last_event_type = ${eventType},
      updated_at = now()
  `;
}

export async function recordLineSpaceEvent(
  env: Env,
  source: LineOpsSource | undefined,
  eventType: string,
): Promise<LineOpsSpace | null> {
  const conversationId = lineConversationId(source);
  if (!conversationId) return null;
  const spaceType = lineSpaceType(source);
  try {
    await upsertLineSpaceEvent(env, conversationId, spaceType, eventType);
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
    await ensureLineOpsSpaceTables(env);
    await upsertLineSpaceEvent(env, conversationId, spaceType, eventType);
  }
  if (eventType === 'join') {
    await refreshLineSpaceProfile(env, { conversationId, spaceType }).catch(() => undefined);
  }
  return getLineSpace(env, conversationId);
}

export async function listLineSpaces(env: Env, user: AuthUser): Promise<LineOpsSpace[]> {
  const sql = getSql(env);
  try {
    const rows = user.role === 'super_admin'
      ? await sql`
          SELECT
            s.id, s.conversation_id, s.space_type, s.brand_id, s.display_name, s.picture_url,
            s.member_count, s.status, s.bound_by_user_id, s.bound_by_line_user_id, s.bound_at,
            s.joined_at, s.left_at, s.last_event_at, s.last_event_type, s.created_at, s.updated_at,
            b.slug AS brand_slug, b.name AS brand_name, u.display_name AS bound_by_name
          FROM line_ops_spaces s
          LEFT JOIN brands b ON b.id = s.brand_id
          LEFT JOIN users u ON u.id = s.bound_by_user_id
          ORDER BY s.status ASC, s.last_event_at DESC NULLS LAST, s.joined_at DESC
        `
      : await sql`
          SELECT
            s.id, s.conversation_id, s.space_type, s.brand_id, s.display_name, s.picture_url,
            s.member_count, s.status, s.bound_by_user_id, s.bound_by_line_user_id, s.bound_at,
            s.joined_at, s.left_at, s.last_event_at, s.last_event_type, s.created_at, s.updated_at,
            b.slug AS brand_slug, b.name AS brand_name, u.display_name AS bound_by_name
          FROM line_ops_spaces s
          LEFT JOIN brands b ON b.id = s.brand_id
          LEFT JOIN users u ON u.id = s.bound_by_user_id
          WHERE s.brand_id = ANY(${user.brandIds}::uuid[])
          ORDER BY s.status ASC, s.last_event_at DESC NULLS LAST, s.joined_at DESC
        `;
    return (rows as Record<string, unknown>[]).map(mapSpace);
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
    return [];
  }
}

export async function findOpsUserByLineId(env: Env, lineUserId: string): Promise<OpsLineUser | null> {
  const sql = getSql(env);
  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT u.id, u.display_name, u.role, b.line_user_id
      FROM user_line_bindings b
      JOIN users u ON u.id = b.user_id
      WHERE b.line_user_id = ${lineUserId} AND u.is_active = true
      LIMIT 1
    ` as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
    return null;
  }
  if (!rows.length) return null;
  const row = rows[0] as { id: string; display_name: string; role: string; line_user_id: string };
  const mem = await sql`
    SELECT brand_id, br.slug
    FROM brand_members m
    JOIN brands br ON br.id = m.brand_id
    WHERE m.user_id = ${row.id}::uuid AND br.is_active = true
  `;
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    brandIds: (mem as { brand_id: string }[]).map((m) => m.brand_id),
    brandSlugs: (mem as { slug: string }[]).map((m) => m.slug),
    lineUserId: row.line_user_id,
  };
}

function canManageBrand(user: { role: string; brandIds: string[] }, brandId: string | null): boolean {
  if (user.role === 'super_admin') return true;
  if (user.role !== 'brand_manager' && user.role !== 'brand_editor') return false;
  if (!brandId) return false;
  return user.brandIds.includes(brandId);
}

export async function bindLineSpace(env: Env, params: {
  conversationId: string;
  brandId: string | null;
  actor: OpsLineUser | AuthUser;
  lineUserId?: string | null;
}): Promise<LineOpsSpace> {
  try {
    await upsertLineSpaceEvent(env, params.conversationId, 'group', 'bind');
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
    await ensureLineOpsSpaceTables(env);
    await upsertLineSpaceEvent(env, params.conversationId, 'group', 'bind');
  }
  const space = await getLineSpace(env, params.conversationId);
  if (!space) throw new Error('還沒有這個群組的紀錄。請先把機器人拉進群，或等它回覆一次。');
  if (params.brandId) {
    if (!canManageBrand(params.actor, params.brandId)) {
      throw new Error('你沒有這個品牌的權限，無法綁這個群。');
    }
  } else if (space.brandId && !canManageBrand(params.actor, space.brandId) && params.actor.role !== 'super_admin') {
    throw new Error('只能解綁自己負責的品牌群。');
  }
  if (params.actor.role !== 'super_admin' && !space.brandId && params.brandId && params.actor.role !== 'brand_manager' && params.actor.role !== 'brand_editor') {
    throw new Error('請管理員綁定這個群。');
  }
  const sql = getSql(env);
  const actorId = 'id' in params.actor ? params.actor.id : null;
  await sql`
    UPDATE line_ops_spaces SET
      brand_id = ${params.brandId}::uuid,
      bound_by_user_id = ${actorId}::uuid,
      bound_by_line_user_id = ${params.lineUserId ?? null},
      bound_at = CASE WHEN ${params.brandId}::uuid IS NULL THEN NULL ELSE now() END,
      updated_at = now()
    WHERE conversation_id = ${params.conversationId}
  `;
  const next = await getLineSpace(env, params.conversationId);
  if (!next) throw new Error('綁定後找不到群組');
  return next;
}

export function parseSpaceBindCommand(text: string): { action: 'bind' | 'unbind'; brandKey: string | null } | null {
  const compact = text.replace(/\s+/g, '');
  if (/這個群解綁|解綁這個群/.test(compact)) return { action: 'unbind', brandKey: null };
  const bind = compact.match(/(?:這個群綁定?|綁定?這個群|這個群是)(.+)/i);
  if (bind) return { action: 'bind', brandKey: bind[1].trim() };
  const short = compact.match(/綁定(homigo|taskgo|washgo|小咪|匠管|阿豪|阿樂)$/i);
  if (short) return { action: 'bind', brandKey: short[1] };
  return null;
}

export function brandKeyToSlug(key: string, brands: Array<{ slug: string; name: string }>): string | null {
  const lower = key.toLowerCase().replace(/[。.!！]/g, '');
  if (/總部|全部|三品牌/.test(lower)) return null;
  const hit = brands.find((b) => {
    if (lower.includes(b.slug) || key.includes(b.name)) return true;
    if (b.slug === 'homigo' && /小咪/.test(key)) return true;
    if (b.slug === 'taskgo' && /阿豪|匠管/.test(key)) return true;
    if (b.slug === 'washgo' && /阿樂/.test(key)) return true;
    return false;
  });
  return hit?.slug ?? null;
}

