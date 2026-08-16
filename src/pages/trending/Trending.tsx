import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { TrendingItem } from '@/types';

// 文字雲配色(依詞 hash 固定,重新整理不會亂跳)
const CLOUD_COLORS = ['#7A9B57', '#B85454', '#5B7FC7', '#C78A3B', '#8B6BB5', '#3E8E7E', '#C75B8A', '#6B6B4E'];

function colorFor(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return CLOUD_COLORS[h % CLOUD_COLORS.length];
}

const SOURCE_LABELS: Record<string, string> = {
  ptt: 'PTT', dcard: 'Dcard', rss: '新聞', google_trends: 'Google 趨勢', news: '新聞', '即時新聞': '即時新聞',
};

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} 小時前`;
  return `${Math.floor(diffMin / 1440)} 天前`;
}

function HotItemRow({ item, platforms, platformLabel }: {
  item: TrendingItem;
  platforms: string[];
  platformLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    if (!item.signalId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.generateFromSignal(item.signalId, { platforms });
      setMsg(`✓ 已生成 ${res.created.length} 篇,請到「${item.brandName ?? ''} 內容中心」審閱`);
    } catch (e) {
      setMsg(`生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', padding: '10px 2px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>
                {item.title} ↗
              </a>
            ) : item.title}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge tone="default">{SOURCE_LABELS[item.source] ?? item.source}</Badge>
            {item.brandName && <Badge tone="secondary">{item.brandName}</Badge>}
            {item.relevance != null && <Badge tone="accent">關聯 {Math.round(item.relevance * 100)}%</Badge>}
            {item.discoveredAt && <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{timeLabel(item.discoveredAt)}</span>}
          </div>
          {msg && <p style={{ fontSize: 12, marginTop: 5, color: msg.startsWith('✓') ? 'var(--color-primary-dark)' : '#B85454' }}>{msg}</p>}
        </div>
        {item.signalId && (
          <Button
            variant="ghost"
            disabled={busy}
            style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}
            onClick={() => void generate()}
          >
            {busy ? '生成中…' : `⚡ 生成${platformLabel}`}
          </Button>
        )}
      </div>
    </div>
  );
}

export function Trending() {
  const query = useAsyncData(() => api.trending(), []);

  if (query.loading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />;
  const data = query.data!;

  const maxWeight = Math.max(1, ...data.keywords.map((k) => k.weight));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>即時熱門</h1>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            自動抓取 Google 趨勢、台灣新聞、PTT、Dcard;讓小編知道現在大家在聊什麼、下一篇該寫什麼
          </p>
        </div>
        <Button variant="secondary" onClick={query.reload}>↻ 重新整理</Button>
      </div>

      {/* 熱門關鍵字雲 */}
      <Card style={{ marginBottom: 16 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>🔥 現在的熱門關鍵字</strong>
        {data.keywords.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'baseline', justifyContent: 'center', padding: '6px 0 10px' }}>
            {data.keywords.map((k, i) => {
              const size = 13 + Math.round((k.weight / maxWeight) * 22);
              return (
                <motion.span
                  key={k.text}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.6) }}
                  title={`出現 ${k.weight} 次`}
                  style={{ fontSize: size, fontWeight: size > 24 ? 800 : 600, color: colorFor(k.text), lineHeight: 1.2, cursor: 'default' }}
                >
                  {k.text}
                </motion.span>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>資料累積中,稍後再來看看。</p>
        )}
      </Card>

      {/* 雙欄:FB/IG 題材 vs Threads 題材 */}
      <div className="grid-2">
        <Card>
          <strong style={{ display: 'block', marginBottom: 4 }}>📰 FB / IG 題材:熱門新聞</strong>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            有標品牌的是 AI 已判定跟品牌相關的精選情報,可以一鍵生成圖文
          </p>
          {data.news.length ? data.news.map((item, i) => (
            <HotItemRow key={`${item.signalId ?? item.title}-${i}`} item={item} platforms={['facebook', 'instagram']} platformLabel="圖文" />
          )) : <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>目前沒有新聞資料。</p>}
        </Card>

        <Card>
          <strong style={{ display: 'block', marginBottom: 4 }}>🧵 Threads 題材:即時熱搜與社群風向</strong>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Google 即時熱搜 + PTT/Dcard 上大家正在討論的行業話題
          </p>

          {data.trends.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6 }}>Google 即時熱搜</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.trends.map((t, i) => (
                  <a
                    key={i}
                    href={t.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12.5, padding: '4px 12px', borderRadius: 999,
                      background: i < 5 ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)',
                      color: 'var(--color-text)', textDecoration: 'none',
                      fontWeight: i < 5 ? 700 : 500,
                    }}
                  >
                    {i + 1}. {t.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 2 }}>社群熱議(PTT / Dcard)</div>
          {data.community.length ? data.community.map((item, i) => (
            <HotItemRow key={`${item.signalId ?? item.title}-${i}`} item={item} platforms={['threads']} platformLabel=" Threads 文" />
          )) : <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>近兩天沒有抓到社群熱議,情報蒐集每 3 小時跑一次。</p>}
        </Card>
      </div>
    </div>
  );
}
