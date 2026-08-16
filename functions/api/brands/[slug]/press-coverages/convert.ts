import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { insertPressCoverage, slugifyStoryKey } from '../../../../_shared/press';
import { parsePressUrl } from '../../../../_shared/press-parse';

// POST /api/brands/:slug/press-coverages/convert
// 把解析結果或原文連結轉換寫入 press_coverages。不存第三方全文。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    url?: string;
    outlet?: string;
    headline?: string;
    articleUrl?: string;
    publishedOn?: string;
    summary?: string;
    keyQuotes?: string[];
    claimableFacts?: string[];
    storyKey?: string;
    status?: string;
  };

  const url = body.articleUrl?.trim() || body.url?.trim() || '';
  let outlet = body.outlet?.trim() || '';
  let headline = body.headline?.trim() || '';
  let publishedOn = body.publishedOn?.trim() || '';
  let summary = body.summary?.trim() || '';
  let keyQuotes = body.keyQuotes ?? [];
  let claimableFacts = body.claimableFacts ?? [];
  let storyKey = body.storyKey?.trim() || '';
  let parseNotes: string[] = [];

  if (url && (!outlet || !headline || !publishedOn || !summary)) {
    try {
      const parsed = await parsePressUrl(context.env, url, { name: brand.name, slug: brand.slug });
      outlet = outlet || parsed.outlet;
      headline = headline || parsed.headline;
      publishedOn = publishedOn || parsed.publishedOn || '';
      summary = summary || parsed.summary;
      if (!keyQuotes.length) keyQuotes = parsed.keyQuotes;
      if (!claimableFacts.length) claimableFacts = parsed.claimableFacts;
      storyKey = storyKey || parsed.storyKey;
      parseNotes = parsed.parseNotes;
    } catch (e) {
      if (!outlet || !headline) {
        return error(e instanceof Error ? e.message : '解析失敗，請改手動填寫', 400);
      }
      parseNotes = [e instanceof Error ? e.message : '頁面解析失敗，已改用清單上的標題與出處'];
    }
  }

  if (!outlet || !headline) {
    return error('轉換前需要媒體名稱與標題。請先解析連結或手動填寫', 400);
  }

  const status = body.status === 'inbox' || body.status === 'syndicated' ? body.status : 'published';

  try {
    const coverage = await insertPressCoverage(context.env, {
      brandId: brand.id,
      storyKey: storyKey || slugifyStoryKey(`${slug}-${headline}`),
      outlet,
      headline,
      articleUrl: url || null,
      publishedOn: publishedOn || null,
      status,
      discoverySource: 'manual',
      summary: summary || null,
      keyQuotes,
      claimableFacts,
    });
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'press_coverage.converted',
      entityType: 'press_coverage',
      entityId: coverage.id,
      afterState: { outlet: coverage.outlet, headline: coverage.headline, articleUrl: coverage.articleUrl },
    });
    return json({ coverage, parseNotes }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '轉換失敗';
    if (msg.includes('idx_press_coverages_url')) return error('這個原文連結已經存在', 409);
    return error(msg, 500);
  }
};
