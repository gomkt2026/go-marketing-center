import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { brandBySlug, campaignsByBrand, contentsByBrand } from '@/mocks';
import type { CampaignStatus } from '@/types';

const statusTone: Record<CampaignStatus, BadgeTone> = {
  planning: 'default', active: 'primary', paused: 'accent', completed: 'secondary', cancelled: 'danger',
};
const statusLabel: Record<CampaignStatus, string> = {
  planning: '規劃中', active: '進行中', paused: '已暫停', completed: '已完成', cancelled: '已取消',
};

export function Campaigns() {
  const { brand: slug } = useParams();
  const brand = slug ? brandBySlug(slug) : undefined;
  if (!brand) return <Navigate to="/" replace />;
  const campaigns = campaignsByBrand(brand.id);
  const allContents = contentsByBrand(brand.id);

  return (
    <div>
      <PageHeader title={`${brand.name} 行銷活動`} subtitle="Campaign 是所有內容的核心,可為單品牌或多品牌活動" actions={<Button variant="primary">+ 建立活動</Button>} />
      <div style={{ display: 'grid', gap: 14 }}>
        {campaigns.map((c) => {
          const contentCount = allContents.filter((ct) => ct.campaignId === c.id).length;
          return (
            <Card key={c.id} hoverable>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{c.title}</strong>
                  {c.objective && <p style={{ fontSize: 13, marginTop: 4 }}>{c.objective}</p>}
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    {new Date(c.startDate).toLocaleDateString('zh-TW')} – {new Date(c.endDate).toLocaleDateString('zh-TW')} · {contentCount} 篇內容
                  </div>
                </div>
                <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
              </div>
            </Card>
          );
        })}
        {campaigns.length === 0 && <Card><p>尚無行銷活動</p></Card>}
      </div>
    </div>
  );
}
