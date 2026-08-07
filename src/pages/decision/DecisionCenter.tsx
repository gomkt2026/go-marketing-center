import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { Proposal, ProposalStatus } from '@/types';

const statusTone: Record<ProposalStatus, BadgeTone> = {
  pending_decision: 'accent', approved: 'primary', rejected: 'danger', needs_revision: 'secondary', withdrawn: 'default',
};
const statusLabel: Record<ProposalStatus, string> = {
  pending_decision: '⏳ 等待決策', approved: '✓ 已批准', rejected: '✗ 已否決', needs_revision: '↩ 需修改', withdrawn: '已撤回',
};
const riskTone: Record<string, BadgeTone> = { low: 'primary', medium: 'accent', high: 'danger' };
const riskLabel: Record<string, string> = { low: '低', medium: '中', high: '高' };

export function DecisionCenter() {
  const { user } = useAuth();
  const { brandById } = useBrand();
  const { data, loading, error, reload } = useAsyncData(() => api.proposals(), []);
  const collaborationsQuery = useAsyncData(() => api.collaborations(), []);
  const [flash, setFlash] = useState<{ id: string; kind: 'approve' | 'reject' } | null>(null);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const items = data.proposals;
  const decisions = data.decisions;
  const collaborations = collaborationsQuery.data?.collaborations ?? [];

  async function act(proposalId: string, kind: 'approve' | 'reject' | 'return') {
    setFlash({ id: proposalId, kind: kind === 'reject' ? 'reject' : 'approve' });
    try {
      await api.decideProposal(proposalId, {
        action: kind === 'return' ? 'return' : kind,
        note: kind === 'approve' ? '管理者批准' : kind === 'reject' ? '管理者否決' : '退回討論',
      });
      await reload();
    } finally {
      setTimeout(() => setFlash(null), 350);
    }
  }

  const pending = items.filter((p) => p.status === 'pending_decision');
  const resolved = items.filter((p) => p.status !== 'pending_decision');

  function scopeLabel(p: Proposal): string {
    if (p.brandId) return brandById(p.brandId)?.name ?? '';
    if (p.collaborationId) return collaborations.find((c) => c.id === p.collaborationId)?.title ?? '合作案';
    return '';
  }

  return (
    <div>
      <PageHeader
        title="決策中心"
        subtitle="AI 討論後只能形成提案(方案 A/B/C);批准、修改、退回、否決永遠由管理者執行"
      />

      <div style={{ display: 'grid', gap: 16 }}>
        {pending.map((p) => (
          <ProposalCard key={p.id} proposal={p} scopeLabel={scopeLabel(p)} flash={flash?.id === p.id ? flash.kind : null} onAct={act} />
        ))}
      </div>

      {resolved.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, margin: '28px 0 12px', color: 'var(--color-text-muted)' }}>已決策</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {resolved.map((p) => {
              const decision = decisions.find((d) => d.proposalId === p.id);
              return (
                <Card key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{scopeLabel(p)}</div>
                    <strong style={{ fontSize: 14 }}>{p.title}</strong>
                    {decision && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{decision.note}</div>}
                  </div>
                  <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {user && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 20 }}>
          目前操作身分:{user.displayName}({user.role}) · 所有決策將記錄於 activity_logs
        </p>
      )}
    </div>
  );
}

function ProposalCard({
  proposal, scopeLabel: scope, flash, onAct,
}: { proposal: Proposal; scopeLabel: string; flash: 'approve' | 'reject' | null; onAct: (id: string, kind: 'approve' | 'reject' | 'return') => void }) {
  return (
    <motion.div layout>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{scope} · 來自 AI 會議</div>
            <strong style={{ fontSize: 16 }}>{proposal.title}</strong>
          </div>
          <Badge tone={statusTone[proposal.status]}>{statusLabel[proposal.status]}</Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${proposal.options.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
          {proposal.options.map((opt) => (
            <motion.div
              key={opt.id}
              whileHover={{ y: -2 }}
              style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}
            >
              <strong style={{ fontSize: 14 }}>{opt.label}</strong>
              <p style={{ fontSize: 13, margin: '4px 0 10px' }}>{opt.description}</p>
              <MiniList label="優點" items={opt.pros} />
              <MiniList label="缺點" items={opt.cons} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <Badge tone={riskTone[opt.riskLevel]}>風險:{riskLabel[opt.riskLevel]}</Badge>
                <Badge tone="secondary">符合度 {opt.brandFitScore}%</Badge>
              </div>
            </motion.div>
          ))}
        </div>

        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                textAlign: 'center', padding: '8px 0', fontWeight: 700, fontSize: 13,
                color: flash === 'approve' ? 'var(--color-primary-dark)' : '#B85454',
              }}
            >
              {flash === 'approve' ? '✓ 已記錄決策' : '✗ 已否決並記錄'}
            </motion.div>
          )}
        </AnimatePresence>

        {proposal.status === 'pending_decision' && !flash && (
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <Button variant="primary" onClick={() => void onAct(proposal.id, 'approve')}>✓ 批准方案 A</Button>
            <Button variant="secondary" onClick={() => void onAct(proposal.id, 'return')}>↩ 退回討論</Button>
            <Button variant="danger" onClick={() => void onAct(proposal.id, 'reject')}>✗ 否決</Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function MiniList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ fontSize: 12, marginBottom: 4 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}:</span> {items.join('、')}
    </div>
  );
}
