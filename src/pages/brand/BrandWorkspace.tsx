import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { HubShortcuts } from '@/components/layout/HubShortcuts';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import {
  ChartCard, DonutChart, PipelineBarChart, PlatformBarChart, StackedPostsChart, CHART,
} from '@/components/charts/KpiCharts';

const platformLabel: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', website: '官網',
};

export function BrandWorkspace() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [retrying, setRetrying] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const brandQuery = useAsyncData(() => slug ? api.brand(slug) : Promise.reject(new Error('no slug')), [slug]);
  const workspaceQuery = useAsyncData(() => slug ? api.brandWorkspace(slug) : Promise.reject(new Error('no slug')), [slug]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if ((brandQuery.error || workspaceQuery.error) && !workspaceQuery.data) {
    return <ErrorState message={brandQuery.error ?? workspaceQuery.error ?? '載入失敗'} onRetry={() => { brandQuery.reload(); workspaceQuery.reload(); }} />;
  }
  if (!workspaceQuery.data) {
    return (
      <div>
        <PageHeader title={`${brand.name} 行銷儀表板`} subtitle="正在載入發文成敗…" />
        <LoadingState label="載入儀表板…" />
      </div>
    );
  }

  const version = brandQuery.data?.version;
  const data = workspaceQuery.data;
  const { stats, histories, pressCoverages = [] } = data;

  async function retry(jobId: string) {
    if (!slug) return;
    setRetrying(jobId);
    try {
      await api.retrySchedule(slug, jobId);
      workspaceQuery.reload();
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 行銷儀表板`}
        subtitle="一眼看發文成敗、待審與近月互動。時段與單篇時間分別在發文時段、行程表調整。"
        actions={<Badge tone="primary">v{version?.versionNumber ?? '-'} 已發布</Badge>}
      />
      <HubShortcuts
        items={[
          { to: `/${brand.slug}/contents`, label: '工作台' },
          { to: `/${brand.slug}/threads`, label: 'Threads' },
          { to: `/${brand.slug}/publishing`, label: '發布' },
          { to: `/${brand.slug}/schedule`, label: '行程表' },
          { to: `/${brand.slug}/analytics`, label: '成果' },
          { to: `/${brand.slug}/intelligence`, label: '品牌智慧' },
        ]}
      />

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard label="本月已發" value={stats.publishedMonth ?? 0} delay={0} tone="var(--color-primary-dark)" />
        <StatCard label="本月失敗" value={stats.failedMonth ?? 0} delay={0.03} tone="var(--color-danger)" />
        <StatCard label="待審閱" value={stats.pendingContents} delay={0.06} tone="var(--color-accent)" />
        <StatCard label="近 28 天曝光" value={data.last28?.impressions ?? 0} delay={0.09} />
      </div>

      <div className="grid-3" style={{ gap: 16, marginBottom: 16 }}>
        <Card>
          <ChartCard title="本月每日發文">
            <StackedPostsChart data={data.monthDaily ?? []} />
          </ChartCard>
        </Card>
        <Card>
          <ChartCard title="本月各平台互動">
            <PlatformBarChart data={data.platformEngagement ?? []} />
          </ChartCard>
        </Card>
        <Card>
          <ChartCard title="本月發布成功率">
            <DonutChart
              value={data.monthOutcome?.published ?? 0}
              total={(data.monthOutcome?.published ?? 0) + (data.monthOutcome?.failed ?? 0)}
              label="成功"
              color={CHART.primary}
            />
          </ChartCard>
        </Card>
        <Card>
          <ChartCard title="今日管線">
            <PipelineBarChart data={[{
              name: '今天',
              published: data.todayPipeline?.published ?? 0,
              scheduled: data.todayPipeline?.scheduled ?? 0,
              pending: data.todayPipeline?.pending ?? 0,
              failed: data.todayPipeline?.failed ?? 0,
            }]} />
          </ChartCard>
        </Card>
        <Card>
          <strong style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>近 28 天互動</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <span>按讚 {Number(data.last28?.likes ?? 0).toLocaleString()}</span>
            <span>留言 {Number(data.last28?.comments ?? 0).toLocaleString()}</span>
            <span>分享 {Number(data.last28?.shares ?? 0).toLocaleString()}</span>
            <span>收藏 {Number(data.last28?.saves ?? 0).toLocaleString()}</span>
          </div>
        </Card>
        <Card>
          <ChartCard title="今日時段覆蓋">
            <DonutChart
              value={data.slotCoverage?.filled ?? 0}
              total={data.slotCoverage?.expected || 1}
              label={`${data.slotCoverage?.filled ?? 0}/${data.slotCoverage?.expected ?? 0} 檔`}
              color={CHART.accent}
            />
          </ChartCard>
        </Card>
      </div>

      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong>待審閱內容</strong>
            <Link to={`/${brand.slug}/contents`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', textDecoration: 'none' }}>去審閱 →</Link>
          </div>
          {(data.pendingItems ?? []).map((item) => (
            <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
              {item.title ?? '(無標題)'}
              <span style={{ color: 'var(--color-text-muted)' }}> · {platformLabel[item.platform ?? ''] ?? item.platform}</span>
            </div>
          ))}
          {(data.pendingItems ?? []).length === 0 && <p style={{ fontSize: 13 }}>目前沒有待審內容。</p>}
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong>最近發文失敗</strong>
            <Link to={`/${brand.slug}/schedule`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', textDecoration: 'none' }}>看行程表 →</Link>
          </div>
          {(data.failedItems ?? []).map((item) => (
            <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title ?? '(無標題)'} · {platformLabel[item.platform] ?? item.platform}</div>
              {item.lastLogDetail && (
                <p style={{ fontSize: 12, marginTop: 4 }}>{item.lastLogDetail.slice(0, 140)}</p>
              )}
              <Button
                variant="ghost"
                style={{ marginTop: 6 }}
                disabled={retrying === item.id}
                onClick={() => retry(item.id)}
              >
                {retrying === item.id ? '重試中…' : '重新排入'}
              </Button>
            </div>
          ))}
          {(data.failedItems ?? []).length === 0 && <p style={{ fontSize: 13 }}>近期待發都成功。</p>}
        </Card>
      </div>

      <button
        type="button"
        onClick={() => setHistoryOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}
      >
        {historyOpen ? '收合里程碑與媒體露出' : '展開里程碑與媒體露出'}
      </button>
      {historyOpen && (
        <div className="grid-2" style={{ gap: 16 }}>
          <Card>
            <strong style={{ display: 'block', marginBottom: 12 }}>品牌里程碑</strong>
            {histories.map((h) => (
              <div key={h.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(h.happenedOn).toLocaleDateString('zh-TW')}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{h.description}</div>
              </div>
            ))}
            {histories.length === 0 && <p>尚無里程碑紀錄</p>}
          </Card>
          <Card>
            <strong style={{ display: 'block', marginBottom: 12 }}>最新媒體露出</strong>
            {pressCoverages.map((c) => (
              <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {c.publishedOn ? new Date(c.publishedOn).toLocaleDateString('zh-TW') : ''} · {c.outlet}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.headline}</div>
              </div>
            ))}
            {pressCoverages.length === 0 && <p style={{ fontSize: 13 }}>尚無已核准的媒體報導</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
