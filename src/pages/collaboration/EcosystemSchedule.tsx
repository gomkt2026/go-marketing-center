import { useMemo, useState, type ReactNode } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { CollaborationScheduleItem, PublishingJobStatus } from '@/types';

// jobStatus 為 null 代表這篇還沒有 publishing_jobs(通常是 auto_publish 關閉時的 pending_review 草稿),
// 用一個額外的「待審核」視覺狀態呈現,不強套一個假的 PublishingJobStatus 值進資料型別。
const statusTone: Record<PublishingJobStatus, BadgeTone> = {
  queued: 'default', scheduled: 'accent', publishing: 'accent', published: 'primary', failed: 'danger', cancelled: 'default',
};
const statusLabel: Record<PublishingJobStatus, string> = {
  queued: '排隊中', scheduled: '已排定', publishing: '發布中', published: '已發布', failed: '失敗', cancelled: '已取消',
};
const platformLabel: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', x: 'X (Twitter)' };
const genSourceLabel: Record<string, string> = { ecosystem_x: 'Go 生態系 X 貼文', ecosystem_cross_promo: '跨品牌導流' };
const genCategoryLabel: Record<string, string> = {
  single_insight: '單推觀點', thread_narrative: 'Thread 產業敘事', thread_builder_pov: 'Thread 操盤手視角',
};

function formatFullTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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

function itemTime(item: CollaborationScheduleItem): Date {
  return new Date(item.scheduledAt ?? item.publishedAt ?? item.contentCreatedAt);
}

export function EcosystemSchedule() {
  const { id } = useParams();
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());

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
    () => (id ? api.collaborationSchedule(id, { from: weekStart.toISOString(), to: weekEnd.toISOString() }) : Promise.reject(new Error('no id'))),
    [id, weekStart.getTime()],
  );

  function toggle(contentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  }

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy((prev) => new Set(prev).add(key));
    try {
      await fn();
      reload();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (!id) return <Navigate to="/collaborations" replace />;
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
        title="Go 生態系 X 行程表"
        subtitle="生成後的貼文都會列在這裡:待審核 / 已排定 / 已發布 / 失敗,點開卡片可以看到完整文案、配圖與發布結果連結"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/collaborations" style={{ fontSize: 13, alignSelf: 'center' }}>← 回品牌合作</Link>
            <NavButton onClick={() => setWeekOffset((n) => n - 1)}>‹ 上一週</NavButton>
            <NavButton onClick={() => setWeekOffset(0)}>本週</NavButton>
            <NavButton onClick={() => setWeekOffset((n) => n + 1)}>下一週 ›</NavButton>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(200px, 1fr))', gap: 10, overflowX: 'auto', alignItems: 'start' }}>
        {days.map((date, i) => {
          const dayItems = items
            .filter((it) => sameDay(itemTime(it), date))
            .sort((a, b) => itemTime(a).getTime() - itemTime(b).getTime());
          const isToday = sameDay(date, new Date());
          return (
            <div key={i} style={{ display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
              <div
                style={{
                  textAlign: 'center', padding: '6px 0', borderRadius: 8,
                  background: isToday ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)',
                  fontWeight: 600, fontSize: 12.5,
                }}
              >
                {WEEKDAY_LABELS[i]} {date.getMonth() + 1}/{date.getDate()}
              </div>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
                {dayItems.length === 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textAlign: 'center' }}>—</p>
                )}
                {dayItems.map((item) => {
                  const isOpen = expanded.has(item.contentId);
                  const time = itemTime(item).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                  const isPending = !item.jobStatus;
                  const isBusy = busy.has(item.contentId) || (item.jobId ? busy.has(item.jobId) : false);
                  return (
                    <Card
                      key={item.contentId}
                      style={{ padding: 12, cursor: 'pointer', minWidth: 0, overflow: 'hidden' }}
                      onClick={() => toggle(item.contentId)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{time}</span>
                        {isPending ? (
                          <Badge tone="default">待審核</Badge>
                        ) : (
                          <Badge tone={statusTone[item.jobStatus as PublishingJobStatus]}>{statusLabel[item.jobStatus as PublishingJobStatus]}</Badge>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge tone="secondary">{platformLabel[item.platform] ?? item.platform}</Badge>
                        {item.genSource && <Badge tone="default">{genSourceLabel[item.genSource] ?? item.genSource}</Badge>}
                        {item.genCategory && <Badge tone="accent">{genCategoryLabel[item.genCategory] ?? item.genCategory}</Badge>}
                      </div>
                      <p style={{ fontSize: 12.5, marginTop: 6, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title ?? '(無標題)'}
                      </p>
                      {isOpen && (
                        <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', display: 'grid', gap: 2, marginBottom: 6 }}>
                            {item.scheduledAt && <span>排定發布:{formatFullTime(item.scheduledAt)}</span>}
                            {item.publishedAt && <span>實際發布:{formatFullTime(item.publishedAt)}</span>}
                            <span>建立時間:{formatFullTime(item.contentCreatedAt)}</span>
                          </div>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="配圖" style={{ width: '100%', borderRadius: 8, marginBottom: 6 }} />
                          )}
                          {item.body && (
                            <p style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, wordBreak: 'break-word' }}>
                              {item.body.split('\n---\n').map((tweet, idx) => (
                                <span key={idx} style={{ display: 'block', marginBottom: idx < item.body!.split('\n---\n').length - 1 ? 8 : 0 }}>
                                  {item.body!.split('\n---\n').length > 1 && (
                                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{idx + 1}/{item.body!.split('\n---\n').length}{'  '}</span>
                                  )}
                                  {tweet}
                                </span>
                              ))}
                            </p>
                          )}
                          {isPending && (
                            <div style={{ marginTop: 8 }}>
                              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                這篇還沒有排入發布,審核沒問題後可以直接核准,下一個 30 分鐘 tick 會自動發布到 X。
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); void withBusy(item.contentId, () => api.approveCollaborationContent(id, item.contentId).then(() => {})); }}
                                disabled={isBusy}
                                style={{
                                  marginTop: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                  border: '1px solid var(--color-border)', background: 'var(--color-primary-soft)', cursor: 'pointer',
                                }}
                              >
                                {isBusy ? '處理中…' : '核准並排入發布'}
                              </button>
                            </div>
                          )}
                          {item.jobStatus === 'failed' && (
                            <div style={{ marginTop: 8 }}>
                              {item.lastLogDetail && <p style={{ fontSize: 11.5, color: '#B85454' }}>失敗原因:{item.lastLogDetail}</p>}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!item.jobId) return;
                                  void withBusy(item.jobId, () => api.retryCollaborationSchedule(id, item.jobId!).then(() => {}));
                                }}
                                disabled={isBusy}
                                style={{
                                  marginTop: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                  border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', cursor: 'pointer',
                                }}
                              >
                                {isBusy ? '重新排入中…' : '重新排入發布'}
                              </button>
                            </div>
                          )}
                          {item.jobStatus === 'published' && item.externalPostId && (
                            <div style={{ marginTop: 6 }}>
                              {item.externalPostId.startsWith('http') ? (
                                <a href={item.externalPostId} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 12 }}>
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
