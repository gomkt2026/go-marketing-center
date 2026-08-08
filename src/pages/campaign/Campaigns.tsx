import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { CampaignStatus } from '@/types';

const statusTone: Record<CampaignStatus, BadgeTone> = {
  planning: 'default', active: 'primary', paused: 'accent', completed: 'secondary', cancelled: 'danger',
};
const statusLabel: Record<CampaignStatus, string> = {
  planning: '規劃中', active: '進行中', paused: '已暫停', completed: '已完成', cancelled: '已取消',
};

export function Campaigns() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const contentsQuery = useAsyncData(() => slug ? api.contents(slug) : Promise.reject(new Error('no slug')), [slug]);
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.campaigns(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );
  const [creating, setCreating] = useState(false);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading || contentsQuery.loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const allContents = contentsQuery.data?.contents ?? [];

  async function createCampaign() {
    const title = window.prompt('活動名稱');
    if (!title?.trim() || !slug) return;
    setCreating(true);
    try {
      await api.createCampaign(slug, { title: title.trim() });
      reload();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 行銷活動`}
        subtitle="Campaign 是所有內容的核心,可為單品牌或多品牌活動"
        actions={<Button variant="primary" disabled={creating} onClick={() => void createCampaign()}>+ 建立活動</Button>}
      />
      <div style={{ display: 'grid', gap: 14 }}>
        {data.campaigns.map((c) => {
          const contentCount = allContents.filter((ct) => ct.campaignId === c.id).length;
          return (
            <Card key={c.id} hoverable>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{c.title}</strong>
                  {c.objective && <p style={{ fontSize: 13, marginTop: 4 }}>{c.objective}</p>}
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    {c.startDate && new Date(c.startDate).toLocaleDateString('zh-TW')}
                    {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString('zh-TW')}`}
                    {' · '}{contentCount} 篇內容
                  </div>
                </div>
                <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
              </div>
            </Card>
          );
        })}
        {data.campaigns.length === 0 && <Card><p>尚無行銷活動</p></Card>}
      </div>
    </div>
  );
}
