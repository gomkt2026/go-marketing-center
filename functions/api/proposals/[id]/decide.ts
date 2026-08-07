import { Pool, neonConfig } from '@neondatabase/serverless';
import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';

neonConfig.fetchConnectionCache = true;

interface DecideBody {
  action?: 'approve' | 'reject' | 'return';
  chosenOptionId?: string;
  note?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const proposalId = context.params.id as string;
  let body: DecideBody;
  try {
    body = await context.request.json() as DecideBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const action = body.action ?? 'approve';
  if (!['approve', 'reject', 'return'].includes(action)) {
    return error('Invalid action', 400);
  }

  const pool = new Pool({ connectionString: context.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const proposalRes = await client.query(
      'SELECT * FROM proposals WHERE id = $1 FOR UPDATE',
      [proposalId],
    );
    if (!proposalRes.rows.length) {
      await client.query('ROLLBACK');
      return error('Proposal not found', 404);
    }
    const proposal = proposalRes.rows[0];

    let newStatus = 'pending_decision';
    let decisionAction = 'defer';
    if (action === 'approve') {
      newStatus = 'approved';
      decisionAction = 'approve';
    } else if (action === 'reject') {
      newStatus = 'rejected';
      decisionAction = 'reject';
    } else {
      newStatus = 'needs_revision';
      decisionAction = 'return_for_discussion';
    }

    let chosenOptionId = body.chosenOptionId ?? null;
    if (action === 'approve' && !chosenOptionId) {
      const optRes = await client.query(
        'SELECT id FROM proposal_options WHERE proposal_id = $1 ORDER BY sort_order LIMIT 1',
        [proposalId],
      );
      chosenOptionId = optRes.rows[0]?.id ?? null;
    }

    const decisionRes = await client.query(
      `INSERT INTO decisions (proposal_id, chosen_option_id, action, decided_by, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [proposalId, chosenOptionId, decisionAction, auth.id, body.note ?? ''],
    );

    await client.query(
      'UPDATE proposals SET status = $1, updated_at = now() WHERE id = $2',
      [newStatus, proposalId],
    );

    if (action === 'approve' && proposal.brand_id) {
      const campRes = await client.query(
        `INSERT INTO campaigns (primary_brand_id, decision_id, title, status, start_date)
         VALUES ($1, $2, $3, 'planning', CURRENT_DATE) RETURNING id`,
        [proposal.brand_id, decisionRes.rows[0].id, proposal.title],
      );
      await client.query(
        'INSERT INTO campaign_brands (campaign_id, brand_id) VALUES ($1, $2)',
        [campRes.rows[0].id, proposal.brand_id],
      );
    }

    await client.query('COMMIT');

    const activityAction = action === 'approve' ? 'decision.approved'
      : action === 'reject' ? 'decision.rejected' : 'decision.returned';

    await logActivity(context.env, {
      brandId: proposal.brand_id,
      collaborationId: proposal.collaboration_id,
      actorType: 'user',
      actorUserId: auth.id,
      action: activityAction,
      entityType: 'proposal',
      entityId: proposalId,
      afterState: { status: newStatus, decisionId: decisionRes.rows[0].id },
    });

    return json({ ok: true, status: newStatus, decision: decisionRes.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    return error(e instanceof Error ? e.message : 'Decision failed', 500);
  } finally {
    client.release();
    await pool.end();
  }
};
