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

export function emptyUsage(): UsageTotals {
  return { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 };
}

export async function summarizeBrandUsage(env: Env, brandId: string): Promise<UsageTotals> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      coalesce(sum(input_tokens + output_tokens), 0)::int AS tokens,
      coalesce(sum(cost_usd), 0)::float AS cost_usd,
      coalesce(sum(input_tokens + output_tokens) FILTER (
        WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::int AS month_tokens,
      coalesce(sum(cost_usd) FILTER (
        WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
      ), 0)::float AS month_cost_usd
    FROM llm_usage
    WHERE brand_id = ${brandId}::uuid
  `;
  const row = rows[0] as { tokens: number; cost_usd: number; month_tokens: number; month_cost_usd: number } | undefined;
  return {
    tokens: Number(row?.tokens ?? 0),
    costUsd: Number(row?.cost_usd ?? 0),
    monthTokens: Number(row?.month_tokens ?? 0),
    monthCostUsd: Number(row?.month_cost_usd ?? 0),
  };
}
