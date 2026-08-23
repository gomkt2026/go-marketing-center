import { useState } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { EventRecord, EventStatus } from '@/types';
import { DuplicateEventDialog } from './DuplicateEventDialog';

const statusTone: Record<EventStatus, BadgeTone> = {
  draft: 'default', open: 'primary', closed: 'accent', completed: 'secondary',
};
const statusLabel: Record<EventStatus, string> = {
  draft: '草稿', open: '開放報名', closed: '已截止', completed: '已結束',
};

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

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

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

  async function removeEvent(e: EventRecord) {
    const count = e.registrationCount ?? 0;
    const extra = count > 0 ? `\n此活動已有 ${count} 筆報名，刪除後名單也會一併移除。` : '';
    if (!window.confirm(`確定要刪除「${e.title}」？${extra}\n此操作無法復原。`)) return;
    setDeletingId(e.id);
    try {
      await api.deleteEvent(e.id);
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
        subtitle="建立或複製活動,產生報名連結與報到授權碼,追蹤名額、報到率與推薦人拆帳"
        actions={<Button variant="primary" disabled={creating} onClick={() => void createEvent()}>+ 建立活動</Button>}
      />
      <div style={{ display: 'grid', gap: 14 }}>
        {data.events.map((e) => (
          <Card key={e.id} hoverable>
            <div className="card-row">
              <Link to={`/${slug}/events/${e.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 16 }}>{e.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  {e.eventDate && new Date(e.eventDate).toLocaleString('zh-TW')}
                  {e.location && ` · ${e.location}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  已報名 {e.registrationCount ?? 0} 人 · 已報到 {e.checkedInCount ?? 0} 人
                </div>
              </Link>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <Badge tone={statusTone[e.status]}>{statusLabel[e.status]}</Badge>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" onClick={() => setCopyFrom(e)}>複製</Button>
                  <Button variant="danger" disabled={deletingId === e.id} onClick={() => void removeEvent(e)}>
                    {deletingId === e.id ? '刪除中…' : '刪除'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {data.events.length === 0 && <Card><p>尚無活動,點擊右上角建立第一個活動報名頁</p></Card>}
      </div>
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
