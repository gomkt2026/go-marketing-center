import { useMemo, useState } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { EventEdmImage, EventRecord, EventStatus } from '@/types';
import { DuplicateEventDialog } from './DuplicateEventDialog';

const statusTone: Record<EventStatus, BadgeTone> = {
  draft: 'default', open: 'primary', closed: 'accent', completed: 'secondary',
};
const statusLabel: Record<EventStatus, string> = {
  draft: '草稿', open: '開放報名', closed: '已截止', completed: '已結束',
};

const WEEKDAY: Record<string, string> = {
  Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六',
};

const CITY_STYLE = {
  台北: { band: '#2E6BFF', ink: '#163A8A', soft: '#EAF1FF' },
  高雄: { band: '#C4842A', ink: '#6A4510', soft: '#FFF6E8' },
  台中: { band: '#1F7A4D', ink: '#145C38', soft: '#E8F6EE' },
} as const;

const NEUTRAL_STYLE = { band: '#1B2B47', ink: '#1B2B47', soft: '#E8EEF6' };

type CityName = keyof typeof CITY_STYLE;

interface TaipeiParts {
  key: string;
  year: string;
  month: number;
  day: number;
  weekday: string;
  time: string;
}

interface MonthBucket {
  key: string;
  events: EventRecord[];
}

function taipeiParts(iso: string): TaipeiParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  return {
    key: `${year}-${month}`,
    year,
    month: Number(month),
    day: Number(get('day')),
    weekday: WEEKDAY[get('weekday')] ?? '',
    time: `${get('hour')}:${get('minute')}`,
  };
}

function imagesOf(event: EventRecord): EventEdmImage[] {
  const raw = event.edmImages as unknown;
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item.url === 'string' && item.url);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? imagesOf({ ...event, edmImages: parsed as EventEdmImage[] }) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cityOf(event: EventRecord): CityName | null {
  const text = `${event.title} ${event.location ?? ''}`;
  if (text.includes('台北')) return '台北';
  if (text.includes('高雄')) return '高雄';
  if (text.includes('台中')) return '台中';
  return null;
}

function seriesTitle(title: string): string {
  const head = title.split('｜')[0]?.trim();
  return head || title;
}

function monthPoster(events: EventRecord[]): string | null {
  const images = events.flatMap((event) => imagesOf(event));
  const preferred = images.find((image) => !/alliance/i.test(image.url) && !image.label.includes('聯盟'));
  return (preferred ?? images[0])?.url ?? null;
}

function buildMonths(events: EventRecord[]): MonthBucket[] {
  const map = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = event.eventDate ? taipeiParts(event.eventDate).key : 'undated';
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ta = a.eventDate ? new Date(a.eventDate).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.eventDate ? new Date(b.eventDate).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === 'undated') return 1;
      if (b[0] === 'undated') return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([key, list]) => ({ key, events: list }));
}

function monthHeading(key: string, count: number): string {
  if (key === 'undated') return `未排期 · ${count} 場`;
  const [year, month] = key.split('-');
  return `${year} 年 ${Number(month)} 月 · ${count} 場`;
}

function tabLabel(key: string, multiYear: boolean): string {
  if (key === 'undated') return '未排期';
  if (key === 'older') return '更早';
  const [year, month] = key.split('-');
  return multiYear ? `${year} 年 ${Number(month)} 月` : `${Number(month)} 月`;
}

export function EventList() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(
    () => (slug ? api.events(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );
  const [creating, setCreating] = useState(false);
  const [copyFrom, setCopyFrom] = useState<EventRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);

  const events = data?.events ?? [];
  const layout = useMemo(() => {
    const months = buildMonths(events);
    const dated = months.filter((month) => month.key !== 'undated');
    const undated = months.find((month) => month.key === 'undated');
    const split = dated.length > 4;
    const named = split ? dated.slice(0, 3) : dated;
    const older = split ? dated.slice(3) : [];
    const years = new Set(dated.map((month) => month.key.slice(0, 4)));
    const multiYear = years.size > 1;
    const tabs = [
      ...named.map((month) => ({ id: month.key, label: tabLabel(month.key, multiYear), count: month.events.length })),
      ...(older.length ? [{ id: 'older', label: '更早', count: older.reduce((sum, month) => sum + month.events.length, 0) }] : []),
      ...(undated ? [{ id: 'undated', label: '未排期', count: undated.events.length }] : []),
    ];
    const now = Date.now();
    const next = events
      .filter((event) => event.eventDate && event.status !== 'completed' && new Date(event.eventDate).getTime() >= now)
      .sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime())[0];
    let defaultId = tabs[0]?.id ?? '';
    if (next?.eventDate) {
      const key = taipeiParts(next.eventDate).key;
      defaultId = older.some((month) => month.key === key) ? 'older' : key;
    }
    return { named, older, undated, tabs, defaultId, nextId: next?.id ?? null };
  }, [events]);

  const selected = picked && layout.tabs.some((tab) => tab.id === picked) ? picked : layout.defaultId;
  const visibleMonths: MonthBucket[] = selected === 'older'
    ? layout.older
    : selected === 'undated' && layout.undated
      ? [layout.undated]
      : layout.named.filter((month) => month.key === selected);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (error && !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  async function createEvent() {
    const title = window.prompt('活動名稱(例:小小洗衣師職人體驗營)');
    if (!title?.trim() || !slug) return;
    setCreating(true);
    try {
      const { event } = await api.createEvent(slug, { title: title.trim() });
      navigate(`/${slug}/events/${event.id}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '建立活動失敗');
    } finally {
      setCreating(false);
    }
  }

  async function removeEvent(event: EventRecord) {
    const count = event.registrationCount ?? 0;
    const extra = count > 0 ? `\n此活動已有 ${count} 筆報名，刪除後名單也會一併移除。` : '';
    if (!window.confirm(`確定要刪除「${event.title}」？${extra}\n此操作無法復原。`)) return;
    setDeletingId(event.id);
    try {
      await api.deleteEvent(event.id);
      reload();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 活動報名與報到`}
        subtitle="依月份查看每一場。點圖卡進入名單，右上角可複製或刪除。"
        actions={<Button variant="primary" disabled={creating} onClick={() => void createEvent()}>+ 建立活動</Button>}
      />
      {loading && !data ? (
        <LoadingState label="載入活動…" />
      ) : events.length === 0 ? (
        <Card><p>尚無活動,點擊右上角建立第一個活動報名頁</p></Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {layout.tabs.map((tab) => {
              const active = tab.id === selected;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPicked(tab.id)}
                  style={{
                    borderRadius: 999,
                    border: active ? '1px solid #1B2B47' : '1px solid var(--color-border)',
                    background: active ? '#1B2B47' : '#fff',
                    color: active ? '#fff' : 'var(--color-text)',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label} · {tab.count}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gap: 22 }}>
            {visibleMonths.map((month) => {
              const cover = monthPoster(month.events);
              return (
                <section key={month.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <h2 style={{ fontSize: 16, margin: 0 }}>{monthHeading(month.key, month.events.length)}</h2>
                    {cover && (
                      <button
                        type="button"
                        onClick={() => setPoster(cover)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          border: '1px solid var(--color-border)',
                          background: '#fff',
                          borderRadius: 10,
                          padding: '4px 10px 4px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        <img src={cover} alt="" style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                        <span style={{ fontSize: 12, fontWeight: 700 }}>看海報</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {month.events.map((event) => (
                      <EventGraphicCard
                        key={event.id}
                        event={event}
                        slug={slug ?? ''}
                        isNext={event.id === layout.nextId}
                        deleting={deletingId === event.id}
                        onCopy={() => setCopyFrom(event)}
                        onDelete={() => void removeEvent(event)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      {poster && (
        <div
          role="presentation"
          onClick={() => setPoster(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.72)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <img src={poster} alt="活動海報" style={{ maxWidth: 'min(440px, 100%)', maxHeight: '90vh', borderRadius: 12 }} />
        </div>
      )}
      {copyFrom && slug && (
        <DuplicateEventDialog
          event={copyFrom}
          brandSlug={slug}
          onClose={() => setCopyFrom(null)}
          onDuplicated={(created) => {
            setCopyFrom(null);
            navigate(`/${slug}/events/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

function EventGraphicCard({
  event,
  slug,
  isNext,
  deleting,
  onCopy,
  onDelete,
}: {
  event: EventRecord;
  slug: string;
  isNext: boolean;
  deleting: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const city = cityOf(event);
  const tone = city ? CITY_STYLE[city] : NEUTRAL_STYLE;
  const when = event.eventDate ? taipeiParts(event.eventDate) : null;
  const registered = event.registrationCount ?? 0;
  const checkedIn = event.checkedInCount ?? 0;
  const ratio = registered > 0 ? Math.min(100, Math.round((checkedIn / registered) * 100)) : 0;

  return (
    <Card hoverable style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/${slug}/events/${event.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div style={{
          background: tone.band,
          color: '#fff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 64,
        }}>
          <strong style={{ fontSize: 20, letterSpacing: 1 }}>{city ?? '活動'}</strong>
          {isNext && (
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              border: '1px solid rgba(255,255,255,0.75)',
              borderRadius: 999,
              padding: '2px 8px',
            }}>下一場</span>
          )}
        </div>
        <div style={{ padding: '14px 16px 8px', background: tone.soft }}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: tone.ink }}>
            {when ? `${when.month}/${when.day}` : '日期未定'}
            {when?.weekday && <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 6 }}>（{when.weekday}）</span>}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: tone.ink }}>
            {when ? when.time : '時間未定'}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>{seriesTitle(event.title)}</div>
          {event.location && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>{event.location}</div>
          )}
          <div style={{ marginTop: 12 }}>
            <Badge tone={statusTone[event.status]}>{statusLabel[event.status]}</Badge>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
            已報名 {registered} · 已報到 {checkedIn}
          </div>
          <div style={{ marginTop: 6, height: 4, borderRadius: 99, background: 'rgba(27,43,71,0.12)' }}>
            <div style={{ width: `${ratio}%`, height: '100%', borderRadius: 99, background: tone.band }} />
          </div>
        </div>
      </Link>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px 12px 12px', background: tone.soft }}>
        <Button variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onCopy}>複製</Button>
        <Button variant="danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={deleting} onClick={onDelete}>
          {deleting ? '刪除中…' : '刪除'}
        </Button>
      </div>
    </Card>
  );
}
