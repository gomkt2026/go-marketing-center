import type { Env } from './env';
import { getSql } from './db';

export type PostingSlotPlatform = 'facebook' | 'instagram' | 'threads';
export type PostingSlotKind = 'daily_theme' | 'threads_hourly' | 'threads_offtopic';

export interface PostingSlot {
  id: string;
  brandId: string;
  brandSlug: string;
  platform: PostingSlotPlatform;
  hourTw: number;
  slotKind: PostingSlotKind;
  enabled: boolean;
}

export const DEFAULT_SLOT_DEFS: Array<{
  platform: PostingSlotPlatform;
  hourTw: number;
  slotKind: PostingSlotKind;
}> = [
  { platform: 'facebook', hourTw: 19, slotKind: 'daily_theme' },
  { platform: 'instagram', hourTw: 19, slotKind: 'daily_theme' },
  { platform: 'threads', hourTw: 0, slotKind: 'threads_hourly' },
  { platform: 'threads', hourTw: 6, slotKind: 'threads_hourly' },
  { platform: 'threads', hourTw: 12, slotKind: 'threads_hourly' },
  { platform: 'threads', hourTw: 18, slotKind: 'threads_hourly' },
  { platform: 'threads', hourTw: 9, slotKind: 'threads_offtopic' },
  { platform: 'threads', hourTw: 21, slotKind: 'threads_offtopic' },
];

export function slotKindLabel(kind: PostingSlotKind): string {
  if (kind === 'threads_hourly') return '熱議跟風';
  if (kind === 'threads_offtopic') return '生活哏文';
  return '每日主題';
}

export function formatHourTw(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function summarizeFrequency(slots: PostingSlot[]): Record<PostingSlotPlatform, string> {
  const enabled = slots.filter((s) => s.enabled);
  const hours = (platform: PostingSlotPlatform, kind?: PostingSlotKind) =>
    enabled
      .filter((s) => s.platform === platform && (!kind || s.slotKind === kind))
      .map((s) => formatHourTw(s.hourTw))
      .sort();
  const fb = hours('facebook');
  const ig = hours('instagram');
  const hourly = hours('threads', 'threads_hourly');
  const offtopic = hours('threads', 'threads_offtopic');
  return {
    facebook: fb.length ? `每天台灣 ${fb.join('、')} 業者主題` : '未設定時段',
    instagram: ig.length ? `每天台灣 ${ig.join('、')} 業者主題` : '未設定時段',
    threads: [
      hourly.length ? `${hourly.join('/')} 熱議跟風` : '',
      offtopic.length ? `${offtopic.join('/')} 生活哏文` : '',
    ].filter(Boolean).join(' + ') || '未設定時段',
  };
}

function isMissingSlots(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?brand_posting_slots["']? does not exist/i.test(msg);
}

export async function ensurePostingOpsTables(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS brand_posting_slots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      platform    publishing_platform NOT NULL,
      hour_tw     SMALLINT NOT NULL,
      slot_kind   TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT brand_posting_slots_hour_check CHECK (hour_tw >= 0 AND hour_tw <= 23),
      CONSTRAINT brand_posting_slots_kind_check CHECK (slot_kind IN ('daily_theme', 'threads_hourly', 'threads_offtopic')),
      CONSTRAINT brand_posting_slots_platform_check CHECK (platform IN ('facebook', 'instagram', 'threads')),
      UNIQUE (brand_id, platform, hour_tw, slot_kind)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_brand_posting_slots_brand ON brand_posting_slots(brand_id, platform, enabled)`;
  await sql`DROP TRIGGER IF EXISTS trg_brand_posting_slots_updated_at ON brand_posting_slots`;
  await sql`
    CREATE TRIGGER trg_brand_posting_slots_updated_at BEFORE UPDATE ON brand_posting_slots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `;

  for (const def of DEFAULT_SLOT_DEFS) {
    await sql`
      INSERT INTO brand_posting_slots (brand_id, platform, hour_tw, slot_kind, enabled)
      SELECT b.id, ${def.platform}::publishing_platform, ${def.hourTw}, ${def.slotKind}, true
      FROM brands b
      WHERE b.slug IN ('homigo', 'taskgo', 'washgo')
      ON CONFLICT (brand_id, platform, hour_tw, slot_kind) DO NOTHING
    `;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS user_line_bindings (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      line_user_id    TEXT NOT NULL UNIQUE,
      display_name    TEXT,
      notify_review   BOOLEAN NOT NULL DEFAULT true,
      notify_failed   BOOLEAN NOT NULL DEFAULT true,
      bound_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_line_bindings_user ON user_line_bindings(user_id)`;
  await sql`DROP TRIGGER IF EXISTS trg_user_line_bindings_updated_at ON user_line_bindings`;
  await sql`
    CREATE TRIGGER trg_user_line_bindings_updated_at BEFORE UPDATE ON user_line_bindings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS line_bind_codes (
      code        TEXT PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_line_bind_codes_user ON line_bind_codes(user_id, expires_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS line_review_digests (
      brand_id           UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
      pending_count      INTEGER NOT NULL DEFAULT 0,
      last_notified_at   TIMESTAMPTZ
    )
  `;
}

function mapSlotRow(row: Record<string, unknown>): PostingSlot {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    brandSlug: String(row.brand_slug ?? ''),
    platform: row.platform as PostingSlotPlatform,
    hourTw: Number(row.hour_tw),
    slotKind: row.slot_kind as PostingSlotKind,
    enabled: Boolean(row.enabled),
  };
}

function fallbackSlots(brands: Array<{ id: string; slug: string }>): PostingSlot[] {
  const out: PostingSlot[] = [];
  for (const brand of brands) {
    for (const def of DEFAULT_SLOT_DEFS) {
      out.push({
        id: `${brand.id}-${def.platform}-${def.hourTw}-${def.slotKind}`,
        brandId: brand.id,
        brandSlug: brand.slug,
        platform: def.platform,
        hourTw: def.hourTw,
        slotKind: def.slotKind,
        enabled: true,
      });
    }
  }
  return out;
}

export async function listAllPostingSlots(env: Env, opts?: { enabledOnly?: boolean }): Promise<PostingSlot[]> {
  const sql = getSql(env);
  try {
    await ensurePostingOpsTables(env);
    const rows = opts?.enabledOnly
      ? await sql`
          SELECT s.id, s.brand_id, b.slug AS brand_slug, s.platform, s.hour_tw, s.slot_kind, s.enabled
          FROM brand_posting_slots s
          JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled = true AND b.is_active = true
          ORDER BY b.slug, s.platform, s.hour_tw
        `
      : await sql`
          SELECT s.id, s.brand_id, b.slug AS brand_slug, s.platform, s.hour_tw, s.slot_kind, s.enabled
          FROM brand_posting_slots s
          JOIN brands b ON b.id = s.brand_id
          WHERE b.is_active = true
          ORDER BY b.slug, s.platform, s.hour_tw
        `;
    return (rows as Record<string, unknown>[]).map(mapSlotRow);
  } catch (e) {
    if (!isMissingSlots(e)) throw e;
    const brands = await sql`SELECT id, slug FROM brands WHERE slug IN ('homigo', 'taskgo', 'washgo') AND is_active = true`;
    return fallbackSlots(brands as Array<{ id: string; slug: string }>);
  }
}

export async function listBrandPostingSlots(env: Env, brandId: string): Promise<PostingSlot[]> {
  const all = await listAllPostingSlots(env);
  return all.filter((s) => s.brandId === brandId);
}

export async function listEnabledSlotsAtHour(
  env: Env,
  hourTw: number,
  kind?: PostingSlotKind,
): Promise<PostingSlot[]> {
  const slots = await listAllPostingSlots(env, { enabledOnly: true });
  return slots.filter((s) => s.hourTw === hourTw && (!kind || s.slotKind === kind));
}

export async function listBrandThreadHours(env: Env, brandId: string): Promise<number[]> {
  const slots = (await listBrandPostingSlots(env, brandId))
    .filter((s) => s.platform === 'threads' && s.enabled);
  const hours = [...new Set(slots.map((s) => s.hourTw))].sort((a, b) => a - b);
  return hours.length ? hours : [0, 6, 9, 12, 18, 21];
}

export async function sourceForBrandHour(
  env: Env,
  brandId: string,
  hourTw: number,
): Promise<PostingSlotKind> {
  const slots = await listBrandPostingSlots(env, brandId);
  const hit = slots.find((s) => s.platform === 'threads' && s.enabled && s.hourTw === hourTw);
  if (hit) return hit.slotKind;
  return hourTw === 9 || hourTw === 21 ? 'threads_offtopic' : 'threads_hourly';
}

export async function countSlotsByBrand(
  env: Env,
  platform: PostingSlotPlatform,
  kind: PostingSlotKind,
): Promise<Record<string, number>> {
  const slots = await listAllPostingSlots(env, { enabledOnly: true });
  const out: Record<string, number> = {};
  for (const s of slots) {
    if (s.platform !== platform || s.slotKind !== kind) continue;
    out[s.brandId] = (out[s.brandId] ?? 0) + 1;
  }
  return out;
}

export async function replaceBrandPostingSlots(
  env: Env,
  brandId: string,
  incoming: Array<{ platform: PostingSlotPlatform; hourTw: number; slotKind: PostingSlotKind; enabled?: boolean }>,
): Promise<PostingSlot[]> {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const seen = new Set<string>();
  for (const item of incoming) {
    if (!['facebook', 'instagram', 'threads'].includes(item.platform)) {
      throw new Error(`不支援的平台:${item.platform}`);
    }
    if (!Number.isInteger(item.hourTw) || item.hourTw < 0 || item.hourTw > 23) {
      throw new Error('時段必須是 0-23 的整點');
    }
    if (item.platform === 'threads') {
      if (item.slotKind !== 'threads_hourly' && item.slotKind !== 'threads_offtopic') {
        throw new Error('Threads 時段種類必須是熱議跟風或生活哏文');
      }
    } else if (item.slotKind !== 'daily_theme') {
      throw new Error('Facebook / Instagram 時段種類必須是每日主題');
    }
    const key = `${item.platform}|${item.hourTw}|${item.slotKind}`;
    if (seen.has(key)) throw new Error(`重複時段:${item.platform} ${formatHourTw(item.hourTw)}`);
    seen.add(key);
  }

  await sql`DELETE FROM brand_posting_slots WHERE brand_id = ${brandId}::uuid`;
  for (const item of incoming) {
    await sql`
      INSERT INTO brand_posting_slots (brand_id, platform, hour_tw, slot_kind, enabled)
      VALUES (
        ${brandId}::uuid,
        ${item.platform}::publishing_platform,
        ${item.hourTw},
        ${item.slotKind},
        ${item.enabled !== false}
      )
    `;
  }

  const slots = await listBrandPostingSlots(env, brandId);
  const summary = summarizeFrequency(slots);
  for (const [platform, text] of Object.entries(summary)) {
    await sql`
      UPDATE brand_channels
      SET posting_frequency = ${text}, updated_at = now()
      WHERE brand_id = ${brandId}::uuid AND platform = ${platform}::publishing_platform
    `;
  }
  return slots;
}

export function hoursForKind(slots: PostingSlot[], kind: PostingSlotKind): number[] {
  return [...new Set(slots.filter((s) => s.enabled && s.slotKind === kind).map((s) => s.hourTw))]
    .sort((a, b) => a - b);
}
