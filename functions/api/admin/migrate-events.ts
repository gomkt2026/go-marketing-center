import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

// 一次性遷移端點:在生產環境套用「活動報名與報到」模組的資料庫結構
// (無法直接取得生產 DATABASE_URL,故透過已部署的 Worker 執行遷移)。
// 僅限 super_admin 呼叫,且所有 DDL 皆為 idempotent,可重複執行不出錯。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const sql = getSql(context.env);
  const steps: string[] = [];

  try {
    await sql`DO $$ BEGIN
      CREATE TYPE event_status AS ENUM ('draft', 'open', 'closed', 'completed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:event_status');

    await sql`DO $$ BEGIN
      CREATE TYPE event_registration_status AS ENUM ('registered', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:event_registration_status');

    await sql`DO $$ BEGIN
      CREATE TYPE event_registration_source AS ENUM ('web', 'manual');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:event_registration_source');

    await sql`DO $$ BEGIN
      CREATE TYPE event_referrer_commission_type AS ENUM ('percentage', 'fixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:event_referrer_commission_type');

    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,
        slug                CITEXT NOT NULL UNIQUE,
        title               TEXT NOT NULL,
        description         TEXT,
        location            TEXT,
        event_date          TIMESTAMPTZ,
        status              event_status NOT NULL DEFAULT 'draft',
        staff_token         VARCHAR(64) NOT NULL,
        form_fields         JSONB NOT NULL DEFAULT '[]',
        price               NUMERIC(10,2),
        price_label         TEXT,
        line_add_friend_url TEXT,
        created_by          UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('table:events');

    await sql`CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id, status)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_staff_token ON events(staff_token)`;
    await sql`DROP TRIGGER IF EXISTS trg_events_updated_at ON events`;
    await sql`CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
    steps.push('events:indexes+trigger');

    await sql`
      CREATE TABLE IF NOT EXISTS event_sessions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        starts_at   TIMESTAMPTZ,
        capacity    INTEGER,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON event_sessions(event_id)`;
    steps.push('table:event_sessions');

    await sql`
      CREATE TABLE IF NOT EXISTS event_referrers (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name              TEXT NOT NULL,
        commission_type   event_referrer_commission_type NOT NULL DEFAULT 'percentage',
        commission_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_active         BOOLEAN NOT NULL DEFAULT true,
        sort_order        INTEGER NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_referrers_event ON event_referrers(event_id)`;
    await sql`DROP TRIGGER IF EXISTS trg_event_referrers_updated_at ON event_referrers`;
    await sql`CREATE TRIGGER trg_event_referrers_updated_at BEFORE UPDATE ON event_referrers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
    steps.push('table:event_referrers');

    await sql`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        session_id      UUID REFERENCES event_sessions(id) ON DELETE SET NULL,
        name            TEXT NOT NULL,
        phone           TEXT NOT NULL,
        email           TEXT,
        line_id         TEXT,
        referrer_id     UUID REFERENCES event_referrers(id) ON DELETE SET NULL,
        referrer_name   TEXT,
        custom_answers  JSONB NOT NULL DEFAULT '{}',
        qr_token        VARCHAR(64) NOT NULL UNIQUE,
        status          event_registration_status NOT NULL DEFAULT 'registered',
        source          event_registration_source NOT NULL DEFAULT 'web',
        checked_in_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_registrations_event_phone ON event_registrations(event_id, phone)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_registrations_qr ON event_registrations(qr_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_registrations_referrer ON event_registrations(referrer_id)`;
    await sql`DROP TRIGGER IF EXISTS trg_event_registrations_updated_at ON event_registrations`;
    await sql`CREATE TRIGGER trg_event_registrations_updated_at BEFORE UPDATE ON event_registrations
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
    steps.push('table:event_registrations');

    // Demo seed:Washgo × 洗楽 小小洗衣師(僅在尚不存在時建立)
    const existing = await sql`SELECT id FROM events WHERE slug = 'senraku-little-laundry-master' LIMIT 1`;
    if (!existing.length) {
      const brandRows = await sql`SELECT id FROM brands WHERE slug = 'washgo' LIMIT 1`;
      if (brandRows.length) {
        const brandId = (brandRows[0] as { id: string }).id;
        const adminRows = await sql`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`;
        const createdBy = adminRows.length ? (adminRows[0] as { id: string }).id : null;

        const eventRows = await sql`
          INSERT INTO events (
            brand_id, slug, title, description, location, event_date, status,
            staff_token, form_fields, price, price_label, line_add_friend_url, created_by
          ) VALUES (
            ${brandId}::uuid, 'senraku-little-laundry-master',
            '洗楽 小小洗衣師職人體驗營',
            '認識洗劑、衣物分類、晾衣體驗、摺衣闖關,寓教於樂的親子洗衣職人體驗。每組限一位大人＋一位小朋友。',
            '洗楽 SENRAKU 門市',
            (now() + interval '7 days' + interval '10 hours'),
            'open',
            encode(gen_random_bytes(24), 'hex'),
            '[
              {"key":"childName","label":"小朋友姓名","type":"text","required":true},
              {"key":"childAge","label":"小朋友年齡","type":"number","required":true}
            ]'::jsonb,
            499, 'NT$499(原價 699)', 'https://line.me/R/ti/p/@washgo', ${createdBy}::uuid
          )
          RETURNING id
        `;
        const eventId = (eventRows[0] as { id: string }).id;

        await sql`
          INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order) VALUES
          (${eventId}::uuid, '上午場 10:00', (now() + interval '7 days' + interval '10 hours'), 8, 1),
          (${eventId}::uuid, '下午場 15:00', (now() + interval '7 days' + interval '15 hours'), 8, 2)
        `;

        await sql`
          INSERT INTO event_referrers (event_id, name, commission_type, commission_value, sort_order) VALUES
          (${eventId}::uuid, '洗楽門市自然到店', 'percentage', 10, 1),
          (${eventId}::uuid, 'Washgo 官方 LINE 導流', 'fixed', 50, 2)
        `;
        steps.push('seed:senraku-demo-event');
      }
    } else {
      steps.push('seed:senraku-demo-event(already exists, skipped)');
    }

    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edm_images JSONB NOT NULL DEFAULT '[]'`;
    steps.push('column:events.edm_images');

    await sql`
      UPDATE events
      SET edm_images = ${JSON.stringify([{
        id: 'meeting-0903',
        label: '商業交流會議',
        url: '/events/fixercowork-edm-0903.jpg',
      }])}::jsonb
      WHERE COALESCE(jsonb_array_length(edm_images), 0) = 0
        AND (
          slug = ${'商業交流會議-高雄-09-03-ba1035'}
          OR title ILIKE ${'%9/03%'}
          OR title ILIKE ${'%09/03%'}
        )
    `;
    steps.push('seed:kaohsiung-0903-edm');

    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? `${e.message} (after steps: ${steps.join(', ')})` : 'Migration failed', 500);
  }
};
