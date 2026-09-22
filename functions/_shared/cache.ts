import type { Env } from './env';

const mem = new Map<string, { exp: number; value: unknown }>();

export const cacheKeys = {
  brand: (slug: string) => `brand:${slug}`,
  brandsAll: 'brands:all',
  slots: (brandId: string) => `slots:${brandId}`,
  desk: (slug: string) => `desk:${slug}`,
  workspace: (slug: string) => `workspace:${slug}`,
};

export async function cacheGet<T>(env: Env, key: string): Promise<T | null> {
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  if (hit) mem.delete(key);

  if (env.CACHE) {
    try {
      const raw = await env.CACHE.get(key, 'json');
      if (raw != null) {
        mem.set(key, { exp: Date.now() + 15_000, value: raw });
        return raw as T;
      }
    } catch (e) {
      console.warn('[cache] KV get failed', key, e);
    }
  }
  return null;
}

export async function cacheSet(env: Env, key: string, value: unknown, ttlSec: number): Promise<void> {
  mem.set(key, { exp: Date.now() + Math.min(ttlSec, 30) * 1000, value });
  if (!env.CACHE) return;
  try {
    // Workers KV 最短 expirationTtl 為 60 秒
    await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) });
  } catch (e) {
    console.warn('[cache] KV put failed', key, e);
  }
}

export async function cacheDelete(env: Env, ...keys: string[]): Promise<void> {
  for (const key of keys) mem.delete(key);
  if (!env.CACHE) return;
  await Promise.all(keys.map(async (key) => {
    try { await env.CACHE!.delete(key); } catch (e) { console.warn('[cache] KV delete failed', key, e); }
  }));
}

export async function invalidateBrandHotCache(env: Env, slug: string, brandId?: string): Promise<void> {
  const keys = [cacheKeys.brand(slug), cacheKeys.brandsAll, cacheKeys.desk(slug), cacheKeys.workspace(slug)];
  if (brandId) keys.push(cacheKeys.slots(brandId));
  await cacheDelete(env, ...keys);
}
