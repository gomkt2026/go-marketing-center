import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { getBrandBySlug, getBrandVersion } from '../../_shared/queries';
import { rowsToCamel, rowToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const version = await getBrandVersion(context.env, brand.id);
  return json({ brand, version });
};
