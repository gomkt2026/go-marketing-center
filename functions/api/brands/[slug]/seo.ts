import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import { SEO_TOPIC_BANK } from '../../../_shared/prompts';
import {
  listSeoAudits,
  runBrandSeoAudit,
  saveSeoAudit,
} from '../../../_shared/seo-audit';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const history = await listSeoAudits(context.env, brand.id);
  return json({
    siteUrl: brand.blogBaseUrl,
    productUrl: brand.websiteUrl,
    topics: SEO_TOPIC_BANK[slug] ?? [],
    audit: history[0] ?? null,
    history,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    const draft = await runBrandSeoAudit(context.env, brand);
    const audit = await saveSeoAudit(context.env, draft);
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'seo.audit',
      entityType: 'seo_audit',
      entityId: audit.id,
      afterState: {
        healthScore: audit.healthScore,
        findingCount: audit.findings.length,
        siteUrl: audit.siteUrl,
      },
    });
    return json({
      siteUrl: brand.blogBaseUrl,
      productUrl: brand.websiteUrl,
      topics: SEO_TOPIC_BANK[slug] ?? [],
      audit,
      history: [audit, ...(await listSeoAudits(context.env, brand.id)).filter((row) => row.id !== audit.id).slice(0, 7)],
    }, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'SEO 健檢失敗', 500);
  }
};
