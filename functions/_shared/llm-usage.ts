/// <reference path="./node-async-hooks.d.ts" />
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Env } from './env';
import { getSql } from './db';
import { imageCostUsd, textCostUsd } from './llm-pricing';

export interface UsageMeta {
  brandId?: string | null;
  brandSlug?: string | null;
  feature: string;
}

interface UsageStore {
  meta: UsageMeta;
}

const storage = new AsyncLocalStorage<UsageStore>();
const slugToId = new Map<string, string | null>();

export function usageActive(): boolean {
  return Boolean(storage.getStore());
}

export function runWithUsage<T>(meta: UsageMeta, fn: () => Promise<T>): Promise<T> {
  return storage.run({ meta }, fn);
}

async function resolveBrandId(env: Env, meta: UsageMeta | undefined): Promise<string | null> {
  if (meta?.brandId) return meta.brandId;
  const slug = meta?.brandSlug?.trim();
  if (!slug) return null;
  if (slugToId.has(slug)) return slugToId.get(slug) ?? null;
  try {
    const sql = getSql(env);
    const rows = await sql`SELECT id FROM brands WHERE slug = ${slug} LIMIT 1`;
    const id = (rows[0] as { id: string } | undefined)?.id ?? null;
    slugToId.set(slug, id);
    return id;
  } catch {
    return null;
  }
}

/** 記一筆呼叫。沒有品牌上下文時 brand_id 留空，歸在管理者的跨品牌列。失敗不影響發文。 */
export async function noteLlmCall(env: Env, call: {
  provider: string;
  model: string;
  feature?: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
}): Promise<void> {
  const meta = storage.getStore()?.meta;
  const inputTokens = Math.max(0, Math.round(call.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(call.outputTokens ?? 0));
  const imageCount = Math.max(0, Math.round(call.imageCount ?? 0));
  if (inputTokens === 0 && outputTokens === 0 && imageCount === 0) return;
  const feature = (call.feature || meta?.feature || 'llm').slice(0, 64);
  const cost = textCostUsd(call.model, inputTokens, outputTokens) + imageCostUsd(imageCount);
  try {
    const brandId = await resolveBrandId(env, meta);
    const sql = getSql(env);
    if (brandId) {
      await sql`
        INSERT INTO llm_usage (
          brand_id, provider, model, feature, input_tokens, output_tokens, image_count, cost_usd
        )
        VALUES (
          ${brandId}::uuid, ${call.provider}, ${call.model}, ${feature},
          ${inputTokens}, ${outputTokens}, ${imageCount}, ${cost}
        )
      `;
    } else {
      await sql`
        INSERT INTO llm_usage (
          provider, model, feature, input_tokens, output_tokens, image_count, cost_usd
        )
        VALUES (
          ${call.provider}, ${call.model}, ${feature},
          ${inputTokens}, ${outputTokens}, ${imageCount}, ${cost}
        )
      `;
    }
  } catch (e) {
    console.error('[llm-usage] 記帳失敗', e instanceof Error ? e.message : e);
  }
}

export interface UsageTotals {
  tokens: number;
  costUsd: number;
  monthTokens: number;
  monthCostUsd: number;
}

/** 每個品牌每個月的 AI 花費上限（美元）。達到或超過就在儀表板示警。 */
export const BRAND_MONTHLY_USD_CAP = 40;

/** 直接產出要發出去的社群貼文與配圖。 */
const POST_FEATURES = [
  'generate_post',
  'generate_offtopic',
  'generate_traffic',
  'generate_from_image',
  'generate_game_promo',
  'image',
  'image_prompt',
  'ecosystem_x',
  'generate_reply',
];

/** 寫成文章或品牌資料，不是這一則要發出的社群貼。 */
const COPY_FEATURES = [
  'generate_seo',
  'onboard_seo',
  'brand_compile',
  'editor_chat',
];

const PODCAST_FEATURES = ['podcast'];

export type UsageBucket = 'post' | 'copy' | 'podcast' | 'other';

export interface UsageParts {
  post: UsageTotals;
  copy: UsageTotals;
  podcast: UsageTotals;
  other: UsageTotals;
}

export function emptyUsage(): UsageTotals {
  return { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 };
}

export function emptyParts(): UsageParts {
  return {
    post: emptyUsage(),
    copy: emptyUsage(),
    podcast: emptyUsage(),
    other: emptyUsage(),
  };
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    tokens: a.tokens + b.tokens,
    costUsd: a.costUsd + b.costUsd,
    monthTokens: a.monthTokens + b.monthTokens,
    monthCostUsd: a.monthCostUsd + b.monthCostUsd,
  };
}

export function sumParts(parts: UsageParts): UsageTotals {
  return addUsage(addUsage(parts.post, parts.copy), addUsage(parts.podcast, parts.other));
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asBucket(value: unknown): UsageBucket {
  if (value === 'post' || value === 'copy' || value === 'podcast') return value;
  return 'other';
}

function rowToUsage(row: Record<string, unknown> | undefined): UsageTotals {
  return {
    tokens: num(row?.tokens),
    costUsd: num(row?.cost_usd),
    monthTokens: num(row?.month_tokens),
    monthCostUsd: num(row?.month_cost_usd),
  };
}

interface UsageBucketRow extends Record<string, unknown> {
  brand_id: string | null;
  bucket: string;
}

async function queryUsageBuckets(env: Env, brandId?: string): Promise<UsageBucketRow[]> {
  const sql = getSql(env);
  if (brandId) {
    return await sql`
      SELECT
        brand_id::text AS brand_id,
        CASE
          WHEN feature = ANY(${POST_FEATURES}::text[]) THEN 'post'
          WHEN feature = ANY(${COPY_FEATURES}::text[]) THEN 'copy'
          WHEN feature = ANY(${PODCAST_FEATURES}::text[]) THEN 'podcast'
          ELSE 'other'
        END AS bucket,
        coalesce(sum(input_tokens + output_tokens), 0)::float AS tokens,
        coalesce(sum(cost_usd), 0)::float AS cost_usd,
        coalesce(sum(input_tokens + output_tokens) FILTER (
          WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
        ), 0)::float AS month_tokens,
        coalesce(sum(cost_usd) FILTER (
          WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
        ), 0)::float AS month_cost_usd
      FROM llm_usage
      WHERE brand_id = ${brandId}::uuid
      GROUP BY brand_id, 2
    ` as UsageBucketRow[];
  }
  return await sql`
    SELECT
      brand_id::text AS brand_id,
      CASE
        WHEN feature = ANY(${POST_FEATURES}::text[]) THEN 'post'
        WHEN feature = ANY(${COPY_FEATURES}::text[]) THEN 'copy'
        WHEN feature = ANY(${PODCAST_FEATURES}::text[]) THEN 'podcast'
        ELSE 'other'
      END AS bucket,
      coalesce(sum(input_tokens + output_tokens), 0)::float AS tokens,
      coalesce(sum(cost_usd), 0)::float AS cost_usd,
      coalesce(sum(input_tokens + output_tokens) FILTER (
        WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::float AS month_tokens,
      coalesce(sum(cost_usd) FILTER (
        WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::float AS month_cost_usd
    FROM llm_usage
    GROUP BY brand_id, 2
  ` as UsageBucketRow[];
}

function partsFromRows(rows: UsageBucketRow[]): UsageParts {
  const parts = emptyParts();
  for (const row of rows) {
    const bucket = asBucket(row.bucket);
    parts[bucket] = addUsage(parts[bucket], rowToUsage(row));
  }
  return parts;
}

export async function summarizeBrandParts(env: Env, brandId: string): Promise<UsageParts> {
  return partsFromRows(await queryUsageBuckets(env, brandId));
}

export async function summarizeBrandUsage(env: Env, brandId: string): Promise<UsageTotals> {
  return sumParts(await summarizeBrandParts(env, brandId));
}

export interface UsageRollup {
  byBrand: Map<string, UsageParts>;
  cross: UsageParts;
}

export async function summarizeAllUsage(env: Env): Promise<UsageRollup> {
  const rows = await queryUsageBuckets(env);
  const byBrand = new Map<string, UsageBucketRow[]>();
  const crossRows: UsageBucketRow[] = [];
  for (const row of rows) {
    if (!row.brand_id) {
      crossRows.push(row);
      continue;
    }
    const list = byBrand.get(row.brand_id) ?? [];
    list.push(row);
    byBrand.set(row.brand_id, list);
  }
  const grouped = new Map<string, UsageParts>();
  for (const [id, list] of byBrand) grouped.set(id, partsFromRows(list));
  return { byBrand: grouped, cross: partsFromRows(crossRows) };
}

/** 行銷中心晨會沒有單一品牌，併進跨品牌的「其他」。 */
export async function summarizeOfficeUsage(env: Env): Promise<UsageTotals> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      coalesce(sum(input_tokens + output_tokens), 0)::float AS tokens,
      coalesce(sum(cost_usd), 0)::float AS cost_usd,
      coalesce(sum(input_tokens + output_tokens) FILTER (
        WHERE timezone('Asia/Taipei', started_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::float AS month_tokens,
      coalesce(sum(cost_usd) FILTER (
        WHERE timezone('Asia/Taipei', started_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::float AS month_cost_usd
    FROM office_standups
  `.catch(() => []);
  return rowToUsage(rows[0] as Record<string, unknown> | undefined);
}
