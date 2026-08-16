import { useParams, Link, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';

export function BrandWorkspace() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;

  const brandQuery = useAsyncData(() => slug ? api.brand(slug) : Promise.reject(new Error('no slug')), [slug]);
  const workspaceQuery = useAsyncData(() => slug ? api.brandWorkspace(slug) : Promise.reject(new Error('no slug')), [slug]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (brandQuery.loading || workspaceQuery.loading) return <LoadingState />;
  if (brandQuery.error || workspaceQuery.error || !workspaceQuery.data) {
    return <ErrorState message={brandQuery.error ?? workspaceQuery.error ?? '載入失敗'} onRetry={() => { brandQuery.reload(); workspaceQuery.reload(); }} />;
  }

  const version = brandQuery.data?.version;
  const { stats, histories, pressCoverages = [] } = workspaceQuery.data;

  return (
    <div>
      <PageHeader
        title={`${brand.name} 品牌工作區`}
        subtitle={brand.tagline}
        actions={<Badge tone="primary">v{version?.versionNumber ?? '-'} 已發布</Badge>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Card delay={0}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>進行中活動</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.activeCampaigns}</div>
        </Card>
        <Card delay={0.03}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>待審閱內容</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.pendingContents}</div>
        </Card>
        <Card delay={0.06}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>市場情報</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.marketSignals}</div>
        </Card>
        <Card delay={0.09}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>學習觀察</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.learningRecords}</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card delay={0.12}>
          <strong style={{ display: 'block', marginBottom: 12 }}>快速前往</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to={`/${brand.slug}/intelligence`} style={linkStyle}>品牌智慧(知識庫 + 版本歷史) →</Link>
            <Link to={`/${brand.slug}/market`} style={linkStyle}>市場情報 →</Link>
            <Link to={`/${brand.slug}/campaigns`} style={linkStyle}>行銷活動 →</Link>
            <Link to={`/${brand.slug}/contents`} style={linkStyle}>內容中心 + Final Review →</Link>
            <Link to={`/${brand.slug}/analytics`} style={linkStyle}>成效分析 →</Link>
          </div>
        </Card>

        <Card delay={0.15}>
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
      </div>

      <Card delay={0.18} style={{ marginTop: 16 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>最新媒體露出</strong>
        {pressCoverages.map((c) => (
          <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {c.publishedOn ? new Date(c.publishedOn).toLocaleDateString('zh-TW') : ''} · {c.outlet}
              {c.isPrimary ? ' · 主稿' : ' · 轉載'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{c.headline}</div>
            {c.articleUrl && (
              <a href={c.articleUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>原文 →</a>
            )}
          </div>
        ))}
        {pressCoverages.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無已核准的媒體報導</p>}
      </Card>
    </div>
  );
}

const linkStyle = {
  fontSize: 14, color: 'var(--color-text)', textDecoration: 'none',
  padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg-soft)',
};
