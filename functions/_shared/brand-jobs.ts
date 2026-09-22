import type { Env } from './env';

export type BrandJobMessage =
  | { kind: 'generate_threads'; slug: string; slotAt: string; slotKind?: string }
  | { kind: 'generate_offtopic'; slug: string; slotAt: string; slotKind?: string }
  | { kind: 'generate_theme'; brandId: string; slug: string; name: string; slotAt: string; platforms: Array<'facebook' | 'instagram'> }
  | { kind: 'catchup_brand'; slug: string }
  | { kind: 'reply_round'; brandId: string; slug: string; name: string }
  | { kind: 'publish' };

export async function enqueueBrandJobs(env: Env, jobs: BrandJobMessage[]): Promise<boolean> {
  if (!env.BRAND_JOBS || !jobs.length) return false;
  const chunk = 100;
  for (let i = 0; i < jobs.length; i += chunk) {
    const slice = jobs.slice(i, i + chunk);
    await env.BRAND_JOBS.sendBatch(slice.map((body) => ({ body })));
  }
  console.log(`[brand-jobs] enqueued ${jobs.length}`);
  return true;
}
