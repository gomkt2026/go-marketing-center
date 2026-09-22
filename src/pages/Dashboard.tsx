import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { useMeta } from '@/context/MetaContext';
import { useBrand } from '@/context/BrandContext';
import { BrandMark } from '@/components/brand/BrandMark';
import { ChartCard, StackedPostsChart } from '@/components/charts/KpiCharts';

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

  if (loading && !brands.length) return <LoadingState />;
  if ((error || !data) && !brands.length) {
    return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;
  }

  const pendingProposals = data?.pendingProposals ?? [];
  const pendingContents = data?.pendingContents ?? [];
  const recentSignals = [...(data?.marketSignals ?? [])].slice(0, 3);
  const recentActivity = (data?.recentActivity ?? []).slice(0, 6);
  const labels = { ...(data?.actionLabels ?? {}), ...actionLabels };
  const brandCards = data?.brands?.length ? data.brands : brands;
  const brandStats = data?.brandStats ?? [];

  return (
    <div>
      <PageHeader title="總覽 Dashboard" subtitle="三品牌發文健康、待辦與近 7 天成敗" />

      {error && brands.length ? (
        <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--color-text-muted)' }}>
          總覽統計暫時載不進來，品牌清單仍可切換。
          <button type="button" onClick={reload} style={{ marginLeft: 8, fontWeight: 700, color: 'var(--color-primary-dark)', background: 'none', border: 'none', cursor: 'pointer' }}>重試統計</button>
        </div>
      ) : null}

      <Card delay={0} style={{ marginBottom: 20 }}>
        <ChartCard title="近 7 天跨品牌發文成敗">
          <StackedPostsChart data={data?.weekSeries ?? []} />
        </ChartCard>
      </Card>

      <Card delay={0.05} style={{ marginBottom: 20 }}>
        <strong style={{ display: 'block', marginBottom: 14 }}>三品牌行銷狀態</strong>
        <div className="grid-3" style={{ gap: 12 }}>
          {brandCards.map((b) => {
            const stats = brandStats.find((s) => s.brandId === b.id);
            return (
              <div
                key={b.id}
                style={{
                  border: '1px solid var(--color-border)', borderRadius: 12, padding: 14,
                  color: 'var(--color-text)',
                }}
              >
                <Link to={`/${b.slug}/workspace`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <BrandMark brand={b} size={22} />
                    <strong style={{ fontSize: 14 }}>{b.name}</strong>
                  </div>
                </Link>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'grid', gap: 4 }}>
                  <span>今日成功 {stats?.todayPublished ?? 0} · 失敗 {stats?.todayFailed ?? 0}</span>
                  <span>待審閱 {stats?.pendingContents ?? 0}</span>
                  <span>7 日曝光 {Number(stats?.impressions7d ?? 0).toLocaleString()}</span>
                  <span>7 日發布 {stats?.published7d ?? 0} / 失敗 {stats?.failed7d ?? 0}</span>
                </div>
                <Link
                  to={`/${b.slug}/workspace`}
                  style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', textDecoration: 'none' }}
                >
                  打開行銷儀表板 →
                </Link>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <Card delay={0.08}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>待你決策</strong>
            <Badge tone="accent">{pendingProposals.length}</Badge>
          </div>
          {pendingProposals.slice(0, 4).map((p) => (
            <Link key={p.id} to="/decisions" style={{ display: 'block', fontSize: 13, padding: '6px 0', color: 'var(--color-text)', textDecoration: 'none', borderTop: '1px solid var(--color-border)' }}>
              ▪ {p.title}
            </Link>
          ))}
          <Link to="/decisions" style={{ fontSize: 12, color: 'var(--color-primary-dark)', fontWeight: 700, textDecoration: 'none' }}>去決策 →</Link>
        </Card>

        <Card delay={0.1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>待審閱內容</strong>
            <Badge tone="accent">{pendingContents.length}</Badge>
          </div>
          {pendingContents.slice(0, 4).map((c) => (
            <div key={c.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>
              ▪ {c.title}{c.targetPlatform === 'website' ? '（官網）' : ''}
            </div>
          ))}
          <Link to={pendingContents[0] ? `/${brandById(pendingContents[0].brandId)?.slug}/contents` : '#'} style={{ fontSize: 12, color: 'var(--color-primary-dark)', fontWeight: 700, textDecoration: 'none' }}>去審閱 →</Link>
        </Card>

        <Card delay={0.12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>今日市場情報</strong>
            <Badge tone="primary">{(data?.marketSignals ?? []).filter((s) => s.status === 'new').length} 則新</Badge>
          </div>
          {recentSignals.map((s) => (
            <div key={s.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>▪ {s.title}</div>
          ))}
        </Card>
      </div>

      <Card delay={0.15}>
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
