import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json } from '../../_shared/response';

async function loadProposals(env: Env) {
  const sql = getSql(env);
  const proposalRows = await sql`SELECT * FROM proposals ORDER BY created_at DESC`;
  const proposals = [];
  for (const row of proposalRows as Record<string, unknown>[]) {
    const p = rowsToCamel([row])[0] as Record<string, unknown>;
    const options = await sql`SELECT * FROM proposal_options WHERE proposal_id = ${p.id}::uuid ORDER BY sort_order, created_at`;
    proposals.push({
      ...p,
      options: rowsToCamel(options as Record<string, unknown>[]),
    });
  }
  return proposals;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const decisions = isSuperAdmin(auth)
    ? await sql`SELECT * FROM decisions ORDER BY decided_at DESC`
    : auth.brandIds.length === 0
      ? []
      : await sql`
          SELECT d.*
          FROM decisions d
          JOIN proposals p ON p.id = d.proposal_id
          WHERE p.brand_id = ANY(${auth.brandIds}::uuid[])
             OR EXISTS (
               SELECT 1 FROM collaboration_brands cb
               WHERE cb.collaboration_id = p.collaboration_id
                 AND cb.brand_id = ANY(${auth.brandIds}::uuid[])
             )
          ORDER BY d.decided_at DESC
        `;
  const proposals = await loadProposals(context.env);

  const allowed = new Set(auth.brandIds);
  const scopedProposals = isSuperAdmin(auth)
    ? proposals
    : (proposals as { brandId?: string }[]).filter((p) => p.brandId && allowed.has(p.brandId));

  return json({
    proposals: scopedProposals,
    decisions: rowsToCamel(decisions as Record<string, unknown>[]),
  });
};
