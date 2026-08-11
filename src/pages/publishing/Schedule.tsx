import { useMemo, useState, type ReactNode } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { PublishingJobStatus, ScheduleItem } from '@/types';

const statusTone: Record<PublishingJobStatus, BadgeTone> = {
  queued: 'default', scheduled: 'accent', publishing: 'accent', published: 'primary', failed: 'danger', cancelled: 'default',
};
const statusLabel: Record<PublishingJobStatus, string> = {
  queued: '排隊中', scheduled: '已排定', publishing: '發布中', published: '已發布', failed: '失敗', cancelled: '已取消',
};
const platformLabel: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' };
const genSourceLabel: Record<string, string> = {
  threads_hourly: '熱議跟風', threads_offtopic: '生活哏文', daily_theme: '每日主題',
  auto_signal: '情報自動', market_signal: '市場情報', meeting_plan: '會議計畫',
};

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function itemTime(item: ScheduleItem): Date {
  return new Date(item.scheduledAt ?? item.publishedAt ?? item.createdAt);
}

export function Schedule() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const weekStart = useMemo(() => {
    const s = startOfWeek(new Date());
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [weekOffset]);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 7);
    return e;
  }, [weekStart]);

  const { data, loading, error, reload } = useAsyncData(
    () => (slug ? api.schedule(slug, { from: weekStart.toISOString(), to: weekEnd.toISOString() }) : Promise.reject(new Error('no slug'))),
    [slug, weekStart.getTime()],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRetry(jobId: string) {
    if (!slug) return;
    setRetrying((prev) => new Set(prev).add(jobId));
    try {
      await api.retrySchedule(slug, jobId);
      reload();
    } catch (e) {
      console.error(e);
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const items = data.items;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  return (
    <div>
      <PageHeader
        title={`${brand.name} 行程表`}
        subtitle="提早看到已排定要發布的內容(通常提前 1 小時生成),到了時間才真正發布,成功/失敗都會回寫在這裡"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <NavButton onClick={() => setWeekOffset((n) => n - 1)}>‹ 上一週</NavButton>
            <NavButton onClick={() => setWeekOffset(0)}>本週</NavButton>
            <NavButton onClick={() => setWeekOffset((n) => n + 1)}>下一週 ›</NavButton>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))', gap: 10, overflowX: 'auto' }}>
        {days.map((date, i) => {
          const dayItems = items
            .filter((it) => sameDay(itemTime(it), date))
            .sort((a, b) => itemTime(a).getTime() - itemTime(b).getTime());
          const isToday = sameDay(date, new Date());
          return (
            <div key={i} style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  textAlign: 'center', padding: '6px 0', borderRadius: 8,
                  background: isToday ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)',
                  fontWeight: 600, fontSize: 12.5,
                }}
              >
                {WEEKDAY_LABELS[i]} {date.getMonth() + 1}/{date.getDate()}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {dayItems.length === 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textAlign: 'center' }}>—</p>
                )}
                {dayItems.map((item) => {
                  const isOpen = expanded.has(item.id);
                  const time = itemTime(item).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <Card key={item.id} style={{ padding: 12, cursor: 'pointer' }} onClick={() => toggle(item.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{time}</span>
                        <Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge tone="secondary">{platformLabel[item.platform] ?? item.platform}</Badge>
                        {item.genSource && <Badge tone="default">{genSourceLabel[item.genSource] ?? item.genSource}</Badge>}
                      </div>
                      <p
                        style={{
                          fontSize: 12.5, marginTop: 6, fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title ?? '(無標題)'}
                      </p>
                      {isOpen && (
                        <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="配圖" style={{ width: '100%', borderRadius: 8, marginBottom: 6 }} />
                          )}
                          {item.body && <p style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body}</p>}
                          {item.status === 'failed' && (
                            <div style={{ marginTop: 8 }}>
                              {item.lastLogDetail && (
                                <p style={{ fontSize: 11.5, color: '#B85454' }}>失敗原因:{item.lastLogDetail}</p>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRetry(item.id); }}
                                disabled={retrying.has(item.id)}
                                style={{
                                  marginTop: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                  border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', cursor: 'pointer',
                                }}
                              >
                                {retrying.has(item.id) ? '重新排入中…' : '重新排入發布'}
                              </button>
                            </div>
                          )}
                          {item.status === 'published' && item.externalPostId && (
                            <div style={{ marginTop: 6 }}>
                              {item.externalPostId.startsWith('http') ? (
                                <a
                                  href={item.externalPostId}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontSize: 12 }}
                                >
                                  查看貼文 ↗
                                </a>
                              ) : (
                                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>貼文 ID:{item.externalPostId}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: '1px solid var(--color-border)', background: 'var(--color-bg)',
      }}
    >
      {children}
    </button>
  );
}
