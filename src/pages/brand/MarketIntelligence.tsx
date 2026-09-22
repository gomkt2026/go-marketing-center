import { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
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
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const navigate = useNavigate();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.marketSignals(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  useEffect(() => {
    if (!slug) return undefined;
    const timer = window.setInterval(() => {
      void reload();
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [slug, reload]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (!data) {
    if (loading) return <LoadingState />;
    return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;
  }

  const signals = data.signals;
  const latest = signals[0]?.discoveredAt
    ? new Date(signals[0].discoveredAt).toLocaleString('zh-TW')
    : '尚無';

  async function updateStatus(id: string, status: MarketSignalStatus) {
    await api.updateMarketSignal(id, status);
    reload();
  }

  async function generatePosts(signalId: string) {
    setGeneratingId(signalId);
    setGenMessage('⏳ AI 正在依序為 FB / IG / Threads 生成貼文與配圖,請留在此頁等待完成…');
    try {
      const res = await api.generateFromSignal(signalId);
      const okCount = res.created.length;
      const failNote = res.failures.length
        ? `;失敗:${res.failures.map((f) => f.platform).join('、')}`
        : '';
      setGenMessage(`已生成 ${okCount} 篇貼文草稿(FB/IG/Threads 差異化)${failNote},請至內容中心審閱。`);
      reload();
    } catch (e) {
      setGenMessage(`生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setGeneratingId(null);
    }
  }

  async function refreshNow() {
    if (!slug) return;
    setRefreshing(true);
    setRefreshNote('正在從新聞／PTT／Dcard／Google Trends 蒐集…');
    try {
      const res = await api.refreshMarketSignals(slug);
      setRefreshNote(res.message);
      reload();
    } catch (e) {
      setRefreshNote(e instanceof ApiError ? e.message : '更新失敗');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 市場情報`}
        subtitle="排程每 3 小時自動蒐集；也可立即更新。依品牌定位篩新聞／政策／時事，可一鍵生成 FB／IG／Threads 貼文"
        actions={
          <Button variant="primary" disabled={refreshing} onClick={() => void refreshNow()}>
            {refreshing ? '蒐集中…' : '立即更新情報'}
          </Button>
        }
      />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          自動排程：每 3 小時蒐集一次。最新一則：{latest}。此頁每 90 秒會自動重整列表。
          {refreshNote ? ` ${refreshNote}` : ''}
        </div>
      </Card>
      {genMessage && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <div className="card-row" style={{ alignItems: 'center' }}>
            <p style={{ fontSize: 13 }}>{genMessage}</p>
            <Button variant="primary" style={{ fontSize: 12, padding: '4px 12px', flexShrink: 0 }} onClick={() => navigate(`/${brand.slug}/contents`)}>
              前往內容中心
            </Button>
          </div>
        </Card>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {signals.map((s) => (
          <Card key={s.id} hoverable>
            <div className="card-row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge tone="secondary">{typeLabel[s.signalType]}</Badge>
                <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                {s.sourcePlatform && <Badge tone="default">{s.sourcePlatform}</Badge>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                相關性 {(Number(s.relevanceScore) * 100).toFixed(0)}%
              </div>
            </div>
            <strong style={{ fontSize: 15 }}>{s.title}</strong>
            <p style={{ fontSize: 13, marginTop: 4 }}>{s.summary}</p>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
              {s.sourceUrl ? (
                <a href={s.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-muted)' }}>來源連結</a>
              ) : '由 Market Analyst 發現'}
              ・{new Date(s.discoveredAt).toLocaleString('zh-TW')}
            </div>
            {s.status !== 'dismissed' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  disabled={generatingId !== null}
                  onClick={() => void generatePosts(s.id)}
                >
                  {generatingId === s.id ? '⏳ AI 生成中(約 30 秒)...' : '✨ 生成三平台貼文'}
                </Button>
                {s.status === 'new' && (
                  <>
                    <Button variant="secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => void updateStatus(s.id, 'discussed')}>標記討論中</Button>
                    <Button variant="ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => void updateStatus(s.id, 'dismissed')}>忽略</Button>
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
        {signals.length === 0 && (
          <Card>
            <p>目前尚無市場情報。可按上方「立即更新情報」，或等待每 3 小時的自動蒐集。</p>
          </Card>
        )}
      </div>
    </div>
  );
}
