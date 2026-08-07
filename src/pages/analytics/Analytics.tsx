import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';

export function Analytics() {
  const { brand: slug } = useParams();
  const { brandBySlug } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.analytics(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  if (!brand) return <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const { reports, totals } = data;

  return (
    <div>
      <PageHeader title={`${brand.name} 成效分析`} subtitle="依平台追蹤曝光、點擊、留言、分享、收藏與互動率" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="曝光" value={totals.impressions} delay={0} tone="var(--color-primary-dark)" />
        <StatCard label="點擊" value={totals.clicks} delay={0.03} />
        <StatCard label="留言" value={totals.comments} delay={0.06} />
        <StatCard label="分享" value={totals.shares} delay={0.09} />
        <StatCard label="收藏" value={totals.saves} delay={0.12} />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {reports.map(({ content, perf }) => (
          <Card key={perf.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>{content.title}</strong>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                互動率 {(Number(perf.engagementRate) * 100).toFixed(2)}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--color-text-muted)' }}>
              <span>曝光 {Number(perf.impressions).toLocaleString()}</span>
              <span>點擊 {Number(perf.clicks).toLocaleString()}</span>
              <span>留言 {perf.comments}</span>
              <span>分享 {perf.shares}</span>
              <span>收藏 {perf.saves}</span>
            </div>
          </Card>
        ))}
        {reports.length === 0 && <Card><p>尚無成效資料</p></Card>}
      </div>
    </div>
  );
}
