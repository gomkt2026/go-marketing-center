import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
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
const platformLabel: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', website: '官網' };
const genSourceLabel: Record<string, string> = {
  threads_hourly: '熱議跟風', threads_offtopic: '生活梗文',
  threads_love: '感情散文', threads_weather: '天氣季節', threads_entertainment: '娛樂影視',
  threads_sports: '運動賽事', threads_emotion: '人際視角',
  threads_workplace: '行業現場', threads_qa: '互動提問', threads_image: '實績畫面',
  daily_theme: '每日主題',
  auto_signal: '情報自動', market_signal: '市場情報', meeting_plan: '會議計畫',
};
const genCategoryLabel: Record<string, string> = {
  seasonal_trend: '時事跟風', emotion: '感情視角', weather: '天氣話題',
  entertainment: '娛樂話題', sports: '運動話題', image_inspired: '圖片靈感',
  workplace: '行業現場', qa: '互動提問',
  love_story: '愛情散文', life_gag: '生活梗文', reflection: '生活省思', love_view: '感情觀點',
};
const contentStatusLabel: Record<string, string> = {
  draft: '草稿', pending_review: '待審閱', approved: '已批准', needs_revision: '修改中',
  rejected: '已退回', scheduled: '排程中', published: '已發布', archived: '已封存',
};

const fieldStyle: CSSProperties = {
  display: 'block', width: '100%', marginTop: 4, padding: '6px 8px',
  borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12,
  fontFamily: 'inherit', background: 'var(--color-bg)', boxSizing: 'border-box',
};
const actionBtnStyle: CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', cursor: 'pointer',
};

function formatFullTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
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

function itemTime(item: ScheduleItem): Date {
  return new Date(item.scheduledAt ?? item.publishedAt ?? item.createdAt);
}

function formatFailureReason(raw: string): string {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return raw;
  const prefix = raw.slice(0, jsonStart).trim();
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { error_user_msg?: string; message?: string; error_user_title?: string };
    };
    const friendly = parsed.error?.error_user_msg ?? parsed.error?.message;
    if (friendly) return prefix ? `${prefix} ${friendly}` : friendly;
  } catch { /* 不是預期的 JSON 格式,原樣顯示 */ }
  return raw;
}

function formatHashtagInput(tags: string[] | null | undefined): string {
  return (tags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
}

export function Schedule() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [rescheduleAt, setRescheduleAt] = useState<Record<string, string>>({});
  const [rescheduling, setRescheduling] = useState<Set<string>>(new Set());
  const [editDrafts, setEditDrafts] = useState<Record<string, { title: string; body: string; hashtags: string }>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [unscheduling, setUnscheduling] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<Record<string, string>>({});

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

  const { data, error, reload } = useAsyncData(
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

  function toLocalInput(iso: string | null | undefined): string {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function itemsById(id: string): ScheduleItem | undefined {
    return data?.items.find((it) => it.id === id);
  }

  function draftOf(item: ScheduleItem) {
    return editDrafts[item.id] ?? {
      title: item.title ?? '',
      body: item.body ?? '',
      hashtags: formatHashtagInput(item.hashtags),
    };
  }

  function patchDraft(id: string, item: ScheduleItem, patch: Partial<{ title: string; body: string; hashtags: string }>) {
    setEditDrafts((prev) => ({ ...prev, [id]: { ...draftOf(item), ...patch } }));
  }

  function setBusy(setter: typeof setSaving, id: string, on: boolean) {
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleReschedule(jobId: string) {
    if (!slug) return;
    const value = rescheduleAt[jobId] || toLocalInput(itemsById(jobId)?.scheduledAt);
    if (!value) return;
    setBusy(setRescheduling, jobId, true);
    setActionError((prev) => ({ ...prev, [jobId]: '' }));
    try {
      await api.rescheduleJob(slug, jobId, new Date(value).toISOString());
      reload();
    } catch (e) {
      setActionError((prev) => ({ ...prev, [jobId]: e instanceof Error ? e.message : '改時間失敗' }));
    } finally {
      setBusy(setRescheduling, jobId, false);
    }
  }

  async function handleSaveCopy(jobId: string) {
    if (!slug) return;
    const item = itemsById(jobId);
    if (!item) return;
    const draft = draftOf(item);
    if (!draft.title.trim() || !draft.body.trim()) {
      setActionError((prev) => ({ ...prev, [jobId]: '標題與文案不能空白' }));
      return;
    }
    setBusy(setSaving, jobId, true);
    setActionError((prev) => ({ ...prev, [jobId]: '' }));
    try {
      await api.updateScheduledPost(slug, jobId, {
        title: draft.title,
        body: draft.body,
        hashtags: draft.hashtags,
      });
      setEditDrafts((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      reload();
    } catch (e) {
      setActionError((prev) => ({ ...prev, [jobId]: e instanceof Error ? e.message : '儲存失敗' }));
    } finally {
      setBusy(setSaving, jobId, false);
    }
  }

  async function handleUnschedule(jobId: string) {
    if (!slug) return;
    if (!window.confirm('確定取消這則排程？文案會回到工作台待審，不會自動發出。')) return;
    setBusy(setUnscheduling, jobId, true);
    setActionError((prev) => ({ ...prev, [jobId]: '' }));
    try {
      await api.unscheduleJob(slug, jobId);
      reload();
    } catch (e) {
      setActionError((prev) => ({ ...prev, [jobId]: e instanceof Error ? e.message : '取消排程失敗' }));
    } finally {
      setBusy(setUnscheduling, jobId, false);
    }
  }

  async function handleRetry(jobId: string) {
    if (!slug) return;
    setBusy(setRetrying, jobId, true);
    setActionError((prev) => ({ ...prev, [jobId]: '' }));
    try {
      await api.retrySchedule(slug, jobId);
      reload();
    } catch (e) {
      setActionError((prev) => ({ ...prev, [jobId]: e instanceof Error ? e.message : '重新排入失敗' }));
    } finally {
      setBusy(setRetrying, jobId, false);
    }
  }

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) {
    return (
      <div>
        <PageHeader title={`${brand.name} 行程表`} subtitle="正在載入本週排程…" />
        <LoadingState label="載入行程表…" />
      </div>
    );
  }

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
        subtitle="點卡片可改文案、標籤與發文時間；也可取消排程拉回工作台重審或重新產圖。"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/${brand.slug}/posting-times`} style={{ textDecoration: 'none' }}>
              <NavButton onClick={() => undefined}>發文時段</NavButton>
            </Link>
            <NavButton onClick={() => setWeekOffset((n) => n - 1)}>‹ 上一週</NavButton>
            <NavButton onClick={() => setWeekOffset(0)}>本週</NavButton>
            <NavButton onClick={() => setWeekOffset((n) => n + 1)}>下一週 ›</NavButton>
          </div>
        }
      />

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, minmax(180px, 1fr))', gap: 10,
          overflowX: 'auto', alignItems: 'start',
        }}
      >
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
                  const isOpen = expanded.has(item.id);
                  const time = itemTime(item).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                  const canEdit = ['queued', 'scheduled', 'failed'].includes(item.status);
                  return (
                    <Card
                      key={item.id}
                      style={{ padding: 12, cursor: 'pointer', minWidth: 0, overflow: 'hidden' }}
                      onClick={() => toggle(item.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{time}</span>
                        <Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge tone="secondary">{platformLabel[item.platform] ?? item.platform}</Badge>
                        {item.genSource && <Badge tone="default">{genSourceLabel[item.genSource] ?? item.genSource}</Badge>}
                        {item.genCategory && (
                          <Badge tone="accent">{genCategoryLabel[item.genCategory] ?? item.genCategory}</Badge>
                        )}
                        {item.audienceLane === 'b2b' && <Badge tone="primary">B 端</Badge>}
                        {item.audienceLane === 'b2c' && <Badge tone="default">C 端</Badge>}
                      </div>
                      <p
                        style={{
                          fontSize: 12.5, marginTop: 6, fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title ?? '(無標題)'}
                      </p>
                      {item.status === 'failed' && item.lastLogDetail && !isOpen && (
                        <p
                          style={{
                            fontSize: 11, marginTop: 4, color: '#B85454',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}
                        >
                          失敗原因:{formatFailureReason(item.lastLogDetail)}
                        </p>
                      )}
                      {isOpen && (
                        <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 8 }} onClick={(e) => e.stopPropagation()}>
                          {item.contentStatus && (
                            <div style={{ marginBottom: 6 }}>
                              <Badge tone="default">內容狀態:{contentStatusLabel[item.contentStatus] ?? item.contentStatus}</Badge>
                            </div>
                          )}
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', display: 'grid', gap: 2, marginBottom: 6 }}>
                            {item.audienceName && <span>主受眾:{item.audienceName}</span>}
                            {item.scheduledAt && <span>排定發布:{formatFullTime(item.scheduledAt)}</span>}
                            {item.publishedAt && <span>實際發布:{formatFullTime(item.publishedAt)}</span>}
                            <span>建立時間:{formatFullTime(item.createdAt)}</span>
                          </div>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="配圖" style={{ width: '100%', borderRadius: 8, marginBottom: 6 }} />
                          )}
                          {canEdit ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <label style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                標題
                                <input
                                  value={draftOf(item).title}
                                  onChange={(e) => patchDraft(item.id, item, { title: e.target.value })}
                                  style={fieldStyle}
                                />
                              </label>
                              <label style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                文案
                                <textarea
                                  rows={8}
                                  value={draftOf(item).body}
                                  onChange={(e) => patchDraft(item.id, item, { body: e.target.value })}
                                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
                                />
                              </label>
                              <label style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                Hashtags
                                <input
                                  value={draftOf(item).hashtags}
                                  onChange={(e) => patchDraft(item.id, item, { hashtags: e.target.value })}
                                  placeholder="#標籤 用空白隔開"
                                  style={fieldStyle}
                                />
                              </label>
                              <button
                                onClick={() => void handleSaveCopy(item.id)}
                                disabled={saving.has(item.id)}
                                style={actionBtnStyle}
                              >
                                {saving.has(item.id) ? '儲存中…' : '儲存文案'}
                              </button>
                              <label style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                改發文時間
                                <input
                                  type="datetime-local"
                                  value={rescheduleAt[item.id] ?? toLocalInput(item.scheduledAt)}
                                  onChange={(e) => setRescheduleAt((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  style={fieldStyle}
                                />
                              </label>
                              <button
                                onClick={() => void handleReschedule(item.id)}
                                disabled={rescheduling.has(item.id)}
                                style={actionBtnStyle}
                              >
                                {rescheduling.has(item.id) ? '改時間中…' : '儲存發文時間'}
                              </button>
                              <button
                                onClick={() => void handleUnschedule(item.id)}
                                disabled={unscheduling.has(item.id)}
                                style={{ ...actionBtnStyle, color: '#B85454' }}
                              >
                                {unscheduling.has(item.id) ? '取消中…' : '取消排程，拉回工作台'}
                              </button>
                              <Link to={`/${brand.slug}/contents`} style={{ fontSize: 12, fontWeight: 600 }}>
                                去工作台重審 / 重新產圖 →
                              </Link>
                            </div>
                          ) : (
                            <>
                              {item.body && (
                                <p style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, wordBreak: 'break-word' }}>
                                  {item.body}
                                </p>
                              )}
                              {!!item.hashtags?.length && (
                                <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 6, wordBreak: 'break-word' }}>
                                  {item.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                                </p>
                              )}
                            </>
                          )}
                          {actionError[item.id] && (
                            <p style={{ fontSize: 11.5, color: '#B85454', marginTop: 6 }}>{actionError[item.id]}</p>
                          )}
                          {item.status === 'failed' && (
                            <div style={{ marginTop: 8 }}>
                              {item.lastLogDetail && (
                                <p style={{ fontSize: 11.5, color: '#B85454', wordBreak: 'break-word' }}>
                                  失敗原因:{formatFailureReason(item.lastLogDetail)}
                                </p>
                              )}
                              <button
                                onClick={() => void handleRetry(item.id)}
                                disabled={retrying.has(item.id)}
                                style={{ ...actionBtnStyle, marginTop: 6 }}
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
