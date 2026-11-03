import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth, requireBrandAccess } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { error, json } from '../../../_shared/response';

const PROFILE_TITLE = '和居家居公司資料';

export interface CompanyProfile {
  companyName: string;
  showroom: string;
  phone: string;
  mobile: string;
  line: string;
  website: string;
  note: string;
}

const DEFAULT_PROFILE: CompanyProfile = {
  companyName: '和居家居股份有限公司',
  showroom: '臺中市北屯區環中路一段1111號之1',
  phone: '04-2355-0256',
  mobile: '0906-102-200',
  line: '@BBBOX',
  website: 'https://bbbox-shop.com/zh/',
  note: '',
};

const LIMITS: Record<keyof CompanyProfile, number> = {
  companyName: 80,
  showroom: 120,
  phone: 40,
  mobile: 40,
  line: 40,
  website: 200,
  note: 2000,
};

function cleanProfile(input: unknown): CompanyProfile | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const next = { ...DEFAULT_PROFILE };
  for (const key of Object.keys(LIMITS) as Array<keyof CompanyProfile>) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    next[key] = value.trim().slice(0, LIMITS[key]);
  }
  if (!next.companyName) return null;
  return next;
}

function readableProfile(profile: CompanyProfile): string {
  return [
    `公司名稱：${profile.companyName}`,
    `展示中心：${profile.showroom}`,
    `電話：${profile.phone}`,
    `手機：${profile.mobile}`,
    `LINE：${profile.line}`,
    `官網：${profile.website}`,
    profile.note ? `補充：${profile.note}` : '',
  ].filter(Boolean).join('\n');
}

function parseStored(raw: string | null, metadata: unknown): CompanyProfile {
  const fromMeta = metadata && typeof metadata === 'object'
    ? cleanProfile((metadata as { profile?: unknown }).profile ?? metadata)
    : null;
  if (fromMeta) return fromMeta;
  if (!raw) return { ...DEFAULT_PROFILE };
  try {
    const parsed = cleanProfile(JSON.parse(raw));
    return parsed ?? { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE, note: raw.slice(0, LIMITS.note) };
  }
}

async function loadBbbox(context: { request: Request; env: Env; params: { slug?: string } }) {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug ?? '';
  if (slug !== 'bbbox') return error('這個公司資料只給和居家居', 404);
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access instanceof Response) return access;
  return brand;
}

/** 和居家居自己的公司資料。三個品牌的公開簡報頁不走這裡。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const brand = await loadBbbox(context);
  if (brand instanceof Response) return brand;
  const sql = getSql(context.env);
  const rows = await sql`
    SELECT raw_content, metadata FROM brand_documents
    WHERE brand_id = ${brand.id}::uuid
      AND source_type = 'brand_manual'
      AND title = ${PROFILE_TITLE}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return json({
    profile: parseStored(
      (rows[0]?.raw_content as string | null) ?? null,
      rows[0]?.metadata ?? null,
    ),
  });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const brand = await loadBbbox(context);
  if (brand instanceof Response) return brand;
  const profile = cleanProfile(await context.request.json().catch(() => null));
  if (!profile) return error('請填公司名稱');
  const sql = getSql(context.env);
  const payload = JSON.stringify({ profile });
  const summary = readableProfile(profile);
  const existing = await sql`
    SELECT id FROM brand_documents
    WHERE brand_id = ${brand.id}::uuid
      AND source_type = 'brand_manual'
      AND title = ${PROFILE_TITLE}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existing[0]?.id) {
    await sql`
      UPDATE brand_documents
      SET raw_content = ${summary}, metadata = ${payload}::jsonb, extract_status = 'ready'
      WHERE id = ${String(existing[0].id)}::uuid
    `;
  } else {
    await sql`
      INSERT INTO brand_documents (brand_id, source_type, title, raw_content, metadata, extract_status)
      VALUES (${brand.id}::uuid, 'brand_manual', ${PROFILE_TITLE}, ${summary}, ${payload}::jsonb, 'ready')
    `;
  }
  return json({ profile });
};
