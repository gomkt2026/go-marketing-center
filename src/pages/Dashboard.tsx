import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { useMeta } from '@/context/MetaContext';
import { useBrand } from '@/context/BrandContext';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function Dashboard() {
  const { data, loading, error, reload } = useAsyncData(() => api.dashboard(), []);
  const { agentById, userName, actionLabels, setActionLabels } = useMeta();
  const { brands, brandById } = useBrand();

  useEffect(() => {
    if (data?.actionLabels) setActionLabels(data.actionLabels);
  }, [data?.actionLabels, setActionLabels]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const pendingProposals = data.pendingProposals;
  const pendingContents = data.pendingContents;
  const recentSignals = [...data.marketSignals].slice(0, 3);
  const recentActivity = data.recentActivity.slice(0, 6);
  const labels = { ...data.actionLabels, ...actionLabels };

  return (
    <div>
      <PageHeader title="總覽 Dashboard" subtitle="跨品牌的待辦事項與最新動態" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <Card delay={0}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>待你決策</strong>
            <Badge tone="accent">{pendingProposals.length}</Badge>
          </div>
          {pendingProposals.map((p) => (
            <Link key={p.id} to="/decisions" style={{ display: 'block', fontSize: 13, padding: '6px 0', color: 'var(--color-text)', textDecoration: 'none', borderTop: '1px solid var(--color-border)' }}>
              ▪ {p.title}
            </Link>
          ))}
          <Link to="/decisions" style={{ fontSize: 12, color: 'var(--color-primary-dark)', fontWeight: 700, textDecoration: 'none' }}>去決策 →</Link>
        </Card>

        <Card delay={0.05}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>待審閱內容</strong>
            <Badge tone="accent">{pendingContents.length}</Badge>
          </div>
          {pendingContents.map((c) => (
            <div key={c.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>▪ {c.title}</div>
          ))}
          <Link to={pendingContents[0] ? `/${brandById(pendingContents[0].brandId)?.slug}/contents` : '#'} style={{ fontSize: 12, color: 'var(--color-primary-dark)', fontWeight: 700, textDecoration: 'none' }}>去審閱 →</Link>
        </Card>

        <Card delay={0.1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>今日市場情報</strong>
            <Badge tone="primary">{data.marketSignals.filter((s) => s.status === 'new').length} 則新</Badge>
          </div>
          {recentSignals.map((s) => (
            <div key={s.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>▪ {s.title}</div>
          ))}
        </Card>
      </div>

      <Card delay={0.15} style={{ marginBottom: 20 }}>
        <strong style={{ display: 'block', marginBottom: 14 }}>三品牌狀態總覽</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(data.brands.length ? data.brands : brands).map((b) => {
            const stats = data.brandStats.find((s) => s.brandId === b.id);
            return (
              <Link
                key={b.id}
                to={`/${b.slug}/workspace`}
                style={{
                  border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, textDecoration: 'none',
                  color: 'var(--color-text)', display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: b.primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{b.logoInitial}</div>
                  <strong style={{ fontSize: 14 }}>{b.name}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 12 }}>
                  <span>進行中活動 {stats?.activeCampaigns ?? 0}</span>
                  <span>待審閱 {stats?.pendingContents ?? 0}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card delay={0.2}>
        <strong style={{ display: 'block', marginBottom: 14 }}>最新動態</strong>
        {recentActivity.map((a) => {
          const agent = a.actorAgentId ? agentById(a.actorAgentId) : undefined;
          const actorLabel = a.actorType === 'ai_agent' ? agent?.displayName : userName(a.actorUserId);
          return (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)', minWidth: 68 }}>{timeAgo(a.createdAt)}</span>
              <span>{a.actorType === 'ai_agent' ? '🤖' : '👤'}</span>
              <span><strong>{actorLabel}</strong> {labels[a.action] ?? a.action}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
