import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { brandBySlug, signalsByBrand } from '@/mocks';
import type { MarketSignalStatus, MarketSignalType } from '@/types';

const typeLabel: Record<MarketSignalType, string> = {
  news: '新聞', policy: '政策', current_event: '時事', trending_topic: '熱門話題',
  industry_trend: '產業趨勢', social_content: '社群內容', evergreen: 'Evergreen',
};
const statusTone: Record<MarketSignalStatus, BadgeTone> = {
  new: 'accent', discussed: 'primary', used: 'secondary', dismissed: 'default',
};
const statusLabel: Record<MarketSignalStatus, string> = {
  new: '新發現', discussed: '討論中', used: '已使用', dismissed: '已忽略',
};

export function MarketIntelligence() {
  const { brand: slug } = useParams();
  const brand = slug ? brandBySlug(slug) : undefined;
  if (!brand) return <Navigate to="/" replace />;
  const signals = signalsByBrand(brand.id);

  return (
    <div>
      <PageHeader
        title={`${brand.name} 市場情報`}
        subtitle="AI 每日依品牌定位、客群、關鍵字搜尋新聞/政策/時事/熱門話題;無適合新聞時自動改為 Evergreen 內容"
      />
      <div style={{ display: 'grid', gap: 12 }}>
        {signals.map((s) => (
          <Card key={s.id} hoverable>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge tone="secondary">{typeLabel[s.signalType]}</Badge>
                <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                相關性 {(s.relevanceScore * 100).toFixed(0)}%
              </div>
            </div>
            <strong style={{ fontSize: 15 }}>{s.title}</strong>
            <p style={{ fontSize: 13, marginTop: 4 }}>{s.summary}</p>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
              由 Market Analyst 發現・{new Date(s.discoveredAt).toLocaleString('zh-TW')}
            </div>
          </Card>
        ))}
        {signals.length === 0 && (
          <Card><p>目前尚無市場情報,AI 將自動改為 Evergreen 互動內容。</p></Card>
        )}
      </div>
    </div>
  );
}
