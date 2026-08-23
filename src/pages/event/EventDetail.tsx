import { useEffect, useRef, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { StatCard } from '@/components/ui/StatCard';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type {
  EventEdmImage, EventFormField, EventReferrerCommissionType, EventRegistration, EventRecord, EventSession, EventStats, EventStatus,
} from '@/types';
import { DuplicateEventDialog } from './DuplicateEventDialog';

const statusTone: Record<EventStatus, BadgeTone> = {
  draft: 'default', open: 'primary', closed: 'accent', completed: 'secondary',
};
const statusLabel: Record<EventStatus, string> = {
  draft: '草稿', open: '開放報名', closed: '已截止', completed: '已結束',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, background: 'var(--color-bg-soft)', outline: 'none', width: '100%',
};
const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDetail() {
  const { brand: slug, id } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const navigate = useNavigate();
  const [tab, setTab] = useState('settings');
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const detailQuery = useAsyncData(() => (id ? api.eventDetail(id) : Promise.reject(new Error('no id'))), [id]);
  const registrationsQuery = useAsyncData(() => (id ? api.eventRegistrations(id) : Promise.reject(new Error('no id'))), [id]);
  const statsQuery = useAsyncData(() => (id ? api.eventStats(id) : Promise.reject(new Error('no id'))), [id]);

  if (!brand || !id) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (detailQuery.loading && !detailQuery.data) return <LoadingState />;
  if (detailQuery.error || !detailQuery.data) {
    return <ErrorState message={detailQuery.error ?? '載入失敗'} onRetry={detailQuery.reload} />;
  }

  const { event, sessions, referrers } = detailQuery.data;
  const registerUrl = `${window.location.origin}/e/${event.slug}`;
  const checkinUrl = `${window.location.origin}/checkin?token=${event.staffToken}`;

  function reloadAll() {
    detailQuery.reload();
    registrationsQuery.reload();
    statsQuery.reload();
  }

  async function removeEvent() {
    const count = (registrationsQuery.data?.registrations ?? []).filter((r) => r.status !== 'cancelled').length;
    const extra = count > 0 ? `\n此活動已有 ${count} 筆有效報名，刪除後名單也會一併移除。` : '';
    if (!window.confirm(`確定要刪除「${event.title}」？${extra}\n此操作無法復原。`)) return;
    setDeleting(true);
    try {
      await api.deleteEvent(event.id);
      navigate(`/${slug}/events`);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '刪除失敗');
      setDeleting(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      window.alert(`${label}已複製`);
    } catch {
      window.prompt(`複製${label}`, text);
    }
  }

  return (
    <div>
      <PageHeader
        title={event.title}
        subtitle={`${brand.name} · 活動報名與報到`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setCopyOpen(true)}>複製活動</Button>
            <Button variant="danger" disabled={deleting} onClick={() => void removeEvent()}>
              {deleting ? '刪除中…' : '刪除活動'}
            </Button>
            <Badge tone={statusTone[event.status]}>{statusLabel[event.status]}</Badge>
          </div>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>公開報名連結</div>
            <div className="copy-row">
              <input readOnly value={registerUrl} style={inputStyle} />
              <Button variant="ghost" onClick={() => void copy(registerUrl, '報名連結')}>複製</Button>
              <a href={registerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>開啟</a>
            </div>
            {event.status !== 'open' && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#B85454', fontWeight: 700 }}>
                狀態是「{statusLabel[event.status]}」時，公開頁會顯示活動不存在。請改成「開放報名」並儲存。
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>工作人員報到連結(授權碼)</div>
            <div className="copy-row">
              <input readOnly value={checkinUrl} style={inputStyle} />
              <Button variant="ghost" onClick={() => void copy(checkinUrl, '報到連結')}>複製</Button>
            </div>
          </div>
        </div>
        <EdmManager event={event} onChanged={reloadAll} />
      </Card>

      <div style={{ marginBottom: 16 }}>
        <Tabs
          tabs={[
            { id: 'settings', label: '基本設定' },
            { id: 'form', label: '場次與表單' },
            { id: 'referrers', label: '推薦人' },
            { id: 'registrations', label: '報名名單' },
            { id: 'stats', label: '統計' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'settings' && <SettingsTab event={event} onSaved={reloadAll} />}
      {tab === 'form' && <SessionsFormTab event={event} sessions={sessions} onSaved={reloadAll} />}
      {tab === 'referrers' && <ReferrersTab eventId={id} referrers={referrers} onChanged={reloadAll} />}
      {tab === 'registrations' && (
        <RegistrationsTab
          eventId={id}
          registrations={registrationsQuery.data?.registrations ?? []}
          loading={registrationsQuery.loading}
          onSearch={(q) => api.eventRegistrations(id, q).then((r) => r.registrations)}
          onChanged={reloadAll}
        />
      )}
      {tab === 'stats' && (
        <StatsTab
          stats={statsQuery.data}
          loading={statsQuery.loading}
          error={statsQuery.error}
          onRetry={statsQuery.reload}
          eventId={id}
        />
      )}
      {copyOpen && slug && (
        <DuplicateEventDialog
          event={event}
          brandSlug={slug}
          onClose={() => setCopyOpen(false)}
          onDuplicated={(created) => {
            setCopyOpen(false);
            navigate(`/${slug}/events/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 活動 EDM
// ----------------------------------------------------------------------------
const FIXER_PRESET_EDMS: EventEdmImage[] = [
  { id: 'preset-meeting', label: '商業交流會議', url: '/events/fixercowork-edm-meeting.png' },
  { id: 'preset-alliance', label: '21克拉工程聯盟', url: '/events/fixercowork-edm-alliance.png' },
];

function EdmManager({ event, onChanged }: { event: EventRecord; onChanged: () => void }) {
  const images = event.edmImages ?? [];
  const [label, setLabel] = useState('21克拉工程聯盟');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);

  async function upload(file: File, replaceId?: string, nextLabel?: string) {
    setError('');
    setBusyId(replaceId ?? 'new');
    try {
      await api.uploadEventEdm(event.id, {
        file,
        label: nextLabel || label,
        replaceId,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setBusyId(null);
    }
  }

  async function persist(next: EventEdmImage[]) {
    setError('');
    setBusyId('save');
    try {
      await api.updateEventEdms(event.id, next);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: EventEdmImage) {
    if (!window.confirm(`確定刪除「${item.label}」？報名頁會一併拿掉這張圖。`)) return;
    await persist(images.filter((x) => x.id !== item.id));
  }

  async function saveLabel(item: EventEdmImage, nextLabel: string) {
    const trimmed = nextLabel.trim();
    if (!trimmed || trimmed === item.label) return;
    await persist(images.map((x) => (x.id === item.id ? { ...x, label: trimmed } : x)));
  }

  async function addPreset(preset: EventEdmImage) {
    if (images.some((x) => x.url === preset.url || x.label === preset.label)) {
      setError(`「${preset.label}」已經在這個活動裡`);
      return;
    }
    await persist([...images, { ...preset, id: `${preset.id}-${Date.now()}` }]);
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        活動 EDM（報名頁可同時顯示多張，點「新增 EDM」選檔，或直接加入預設海報）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {images.map((item) => (
          <div key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-soft)' }}>
            <a href={item.url} target="_blank" rel="noreferrer">
              <img src={item.url} alt={item.label} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }} />
            </a>
            <div style={{ padding: 8, display: 'grid', gap: 6 }}>
              <input
                defaultValue={item.label}
                style={{ ...inputStyle, fontSize: 12 }}
                disabled={busyId != null}
                onBlur={(e) => void saveLabel(item, e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId != null}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                  onClick={() => {
                    replaceIdRef.current = item.id;
                    replaceInputRef.current?.click();
                  }}
                >
                  {busyId === item.id ? '處理中…' : '取代'}
                </Button>
                <Button type="button" variant="danger" disabled={busyId != null} onClick={() => void remove(item)} style={{ fontSize: 12 }}>
                  刪除
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          const replaceId = replaceIdRef.current;
          const current = images.find((x) => x.id === replaceId);
          e.target.value = '';
          replaceIdRef.current = null;
          if (file && replaceId) void upload(file, replaceId, current?.label);
        }}
      />
      <input
        ref={addInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200 }}
          placeholder="新 EDM 名稱"
        />
        <Button type="button" variant="primary" disabled={busyId != null} onClick={() => addInputRef.current?.click()}>
          {busyId === 'new' ? '上傳中…' : '新增 EDM'}
        </Button>
        {FIXER_PRESET_EDMS.filter((preset) => !images.some((x) => x.url === preset.url || x.label === preset.label)).map((preset) => (
          <Button key={preset.id} type="button" variant="secondary" disabled={busyId != null} onClick={() => void addPreset(preset)}>
            加入「{preset.label}」
          </Button>
        ))}
      </div>
      {error && <p style={{ color: '#B85454', fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 基本設定
// ----------------------------------------------------------------------------
function SettingsTab({ event, onSaved }: { event: EventRecord; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    eventDate: toDatetimeLocal(event.eventDate),
    status: event.status,
    price: event.price != null ? String(event.price) : '',
    priceLabel: event.priceLabel ?? '',
    lineAddFriendUrl: event.lineAddFriendUrl ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      title: event.title,
      description: event.description ?? '',
      location: event.location ?? '',
      eventDate: toDatetimeLocal(event.eventDate),
      status: event.status,
      price: event.price != null ? String(event.price) : '',
      priceLabel: event.priceLabel ?? '',
      lineAddFriendUrl: event.lineAddFriendUrl ?? '',
    });
  }, [event.id, event.updatedAt]);

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.updateEvent(event.id, {
        title: form.title,
        description: form.description,
        location: form.location,
        eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : undefined,
        status: form.status,
        price: form.price ? Number(form.price) : undefined,
        priceLabel: form.priceLabel,
        lineAddFriendUrl: form.lineAddFriendUrl,
      });
      setMessage('已儲存設定');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
        <label style={labelStyle}><span>活動名稱</span>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </label>
        <label style={labelStyle}><span>活動說明</span>
          <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
        <div className="form-row" style={{ gap: 14 }}>
          <label style={{ ...labelStyle, flex: 1 }}><span>地點</span>
            <input style={inputStyle} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}><span>活動時間</span>
            <input type="datetime-local" style={inputStyle} value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
          </label>
        </div>
        <div className="form-row" style={{ gap: 14 }}>
          <label style={{ ...labelStyle, flex: 1 }}><span>狀態</span>
            <select style={inputStyle} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EventStatus }))}>
              <option value="draft">草稿</option>
              <option value="open">開放報名</option>
              <option value="closed">已截止</option>
              <option value="completed">已結束</option>
            </select>
          </label>
          <label style={{ ...labelStyle, flex: 1 }}><span>單價(拆帳計算用,選填)</span>
            <input type="number" style={inputStyle} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </label>
        </div>
        <label style={labelStyle}><span>價格顯示文案</span>
          <input style={inputStyle} value={form.priceLabel} onChange={(e) => setForm((f) => ({ ...f, priceLabel: e.target.value }))} placeholder="例:NT$499(原價 699)" />
        </label>
        <label style={labelStyle}><span>官方 LINE 加好友連結</span>
          <input style={inputStyle} value={form.lineAddFriendUrl} onChange={(e) => setForm((f) => ({ ...f, lineAddFriendUrl: e.target.value }))} placeholder="https://line.me/R/ti/p/@xxxx" />
        </label>
        {error && <p style={{ color: '#B85454', fontSize: 13 }}>{error}</p>}
        {message && <p style={{ color: 'var(--color-primary-dark)', fontSize: 13 }}>{message}</p>}
        <div>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? '儲存中…' : '儲存設定'}</Button>
        </div>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// 場次與自訂表單
// ----------------------------------------------------------------------------
type SessionDraft = { id?: string; label: string; startsAt: string; capacity: string };

function SessionsFormTab({
  event, sessions, onSaved,
}: {
  event: EventRecord;
  sessions: EventSession[];
  onSaved: () => void;
}) {
  const [sessionDrafts, setSessionDrafts] = useState<SessionDraft[]>(
    sessions.map((s) => ({ id: s.id, label: s.label, startsAt: toDatetimeLocal(s.startsAt), capacity: s.capacity != null ? String(s.capacity) : '' })),
  );
  const [fields, setFields] = useState<EventFormField[]>(event.formFields ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSessionDrafts(sessions.map((s) => ({
      id: s.id, label: s.label, startsAt: toDatetimeLocal(s.startsAt),
      capacity: s.capacity != null ? String(s.capacity) : '',
    })));
    setFields(event.formFields ?? []);
  }, [event.id, event.updatedAt]);

  function addSession() {
    setSessionDrafts((prev) => [...prev, { label: '', startsAt: '', capacity: '' }]);
  }
  function removeSession(i: number) {
    setSessionDrafts((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addField() {
    setFields((prev) => [...prev, { key: `field_${prev.length + 1}`, label: '', type: 'text', required: false }]);
  }
  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.updateEvent(event.id, {
        sessions: sessionDrafts.filter((s) => s.label.trim()).map((s, i) => ({
          id: s.id,
          label: s.label.trim(),
          startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : undefined,
          capacity: s.capacity ? Number(s.capacity) : null,
          sortOrder: i,
        })),
        formFields: fields.filter((f) => f.label.trim()),
      });
      setMessage('已儲存場次與表單');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>場次與名額</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {sessionDrafts.map((s, i) => (
            <div key={i} className="form-row">
              <input style={inputStyle} placeholder="場次名稱(例:上午場 10:00)" value={s.label}
                onChange={(e) => setSessionDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, label: e.target.value } : p)))} />
              <input type="datetime-local" style={inputStyle} value={s.startsAt}
                onChange={(e) => setSessionDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, startsAt: e.target.value } : p)))} />
              <input type="number" style={{ ...inputStyle, maxWidth: 100 }} placeholder="名額" value={s.capacity}
                onChange={(e) => setSessionDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, capacity: e.target.value } : p)))} />
              <Button variant="ghost" onClick={() => removeSession(i)}>刪除</Button>
            </div>
          ))}
          <div><Button variant="ghost" onClick={addSession}>+ 新增場次</Button></div>
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>自訂報名欄位</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {fields.map((f, i) => (
            <div key={i} className="form-row">
              <input style={inputStyle} placeholder="欄位名稱(例:小朋友姓名)" value={f.label}
                onChange={(e) => setFields((prev) => prev.map((p, idx) => (idx === i ? { ...p, label: e.target.value } : p)))} />
              <select style={{ ...inputStyle, maxWidth: 130 }} value={f.type}
                onChange={(e) => setFields((prev) => prev.map((p, idx) => (idx === i ? { ...p, type: e.target.value as EventFormField['type'] } : p)))}>
                <option value="text">文字</option>
                <option value="number">數字</option>
                <option value="textarea">長文字</option>
                <option value="select">選單</option>
                <option value="checkbox">多選</option>
              </select>
              {(f.type === 'select' || f.type === 'checkbox') && (
                <input style={inputStyle} placeholder="選項（逗號分隔）" value={(f.options ?? []).join('、')}
                  onChange={(e) => setFields((prev) => prev.map((p, idx) => (idx === i ? { ...p, options: e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean) } : p)))} />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={!!f.required}
                  onChange={(e) => setFields((prev) => prev.map((p, idx) => (idx === i ? { ...p, required: e.target.checked } : p)))} />
                必填
              </label>
              <Button variant="ghost" onClick={() => removeField(i)}>刪除</Button>
            </div>
          ))}
          <div><Button variant="ghost" onClick={addField}>+ 新增欄位</Button></div>
        </div>
      </Card>

      {error && <p style={{ color: '#B85454', fontSize: 13 }}>{error}</p>}
      {message && <p style={{ color: 'var(--color-primary-dark)', fontSize: 13 }}>{message}</p>}
      <div><Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? '儲存中…' : '儲存場次與表單'}</Button></div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 推薦人
// ----------------------------------------------------------------------------
function ReferrersTab({
  eventId, referrers, onChanged,
}: {
  eventId: string;
  referrers: import('@/types').EventReferrer[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [commissionType, setCommissionType] = useState<EventReferrerCommissionType>('percentage');
  const [commissionValue, setCommissionValue] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.createEventReferrer(eventId, { name: name.trim(), commissionType, commissionValue: Number(commissionValue) || 0 });
      setName(''); setCommissionValue('');
      onChanged();
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.updateEventReferrer(eventId, id, { isActive: !isActive });
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm('確定要刪除此推薦人?')) return;
    await api.deleteEventReferrer(eventId, id);
    onChanged();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>新增推薦人</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 1, minWidth: 160 }} placeholder="推薦人名稱" value={name} onChange={(e) => setName(e.target.value)} />
          <select style={{ ...inputStyle, maxWidth: 140 }} value={commissionType} onChange={(e) => setCommissionType(e.target.value as EventReferrerCommissionType)}>
            <option value="percentage">比例(%)</option>
            <option value="fixed">每人固定金額</option>
          </select>
          <input type="number" style={{ ...inputStyle, maxWidth: 120 }} placeholder={commissionType === 'percentage' ? '例:10' : '例:50'} value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} />
          <Button variant="primary" disabled={creating} onClick={() => void create()}>{creating ? '新增中…' : '+ 新增'}</Button>
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>推薦人名單</h3>
        {referrers.length === 0 && <p>尚無推薦人,新增後會出現在報名表單的下拉選單中</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {referrers.map((r) => (
            <div key={r.id} className="card-row" style={{
              alignItems: 'center',
              padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-soft)',
              flexWrap: 'wrap',
            }}
            >
              <div>
                <strong style={{ fontSize: 14 }}>{r.name}</strong>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                  {r.commissionType === 'percentage' ? `拆帳 ${r.commissionValue}%` : `每人 NT$${r.commissionValue}`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Badge tone={r.isActive ? 'primary' : 'default'}>{r.isActive ? '啟用中' : '已停用'}</Badge>
                <Button variant="ghost" onClick={() => void toggleActive(r.id, r.isActive)}>{r.isActive ? '停用' : '啟用'}</Button>
                <Button variant="ghost" onClick={() => void remove(r.id)}>刪除</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 報名名單
// ----------------------------------------------------------------------------
function RegistrationsTab({
  eventId, registrations, loading, onSearch, onChanged,
}: {
  eventId: string;
  registrations: EventRegistration[];
  loading: boolean;
  onSearch: (q: string) => Promise<EventRegistration[]>;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<EventRegistration[]>(registrations);
  const [searching, setSearching] = useState(false);

  useEffect(() => setList(registrations), [registrations]);

  async function runSearch() {
    setSearching(true);
    try {
      setList(await onSearch(query));
    } finally {
      setSearching(false);
    }
  }

  async function toggleCheckin(id: string, checkedIn: boolean) {
    await api.checkinRegistration(eventId, id, checkedIn ? 'undo' : 'check_in');
    onChanged();
    setList(await onSearch(query));
  }

  async function toggleCancel(id: string, status: EventRegistration['status']) {
    const next = status === 'cancelled' ? 'registered' : 'cancelled';
    if (next === 'cancelled' && !window.confirm('確定要取消這筆報名?')) return;
    try {
      await api.updateRegistration(eventId, id, { status: next });
      onChanged();
      setList(await onSearch(query));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '更新報名失敗');
    }
  }

  const rows = query ? list : registrations;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, width: 220 }}
            placeholder="搜尋姓名或手機"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
          />
          <Button variant="ghost" disabled={searching} onClick={() => void runSearch()}>搜尋</Button>
        </div>
        <a href={api.eventExportUrl(eventId)}>
          <Button variant="secondary">⬇ 下載 CSV</Button>
        </a>
      </div>

      {loading ? <LoadingState /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                <th style={{ padding: '8px 6px' }}>姓名</th>
                <th style={{ padding: '8px 6px' }}>手機</th>
                <th style={{ padding: '8px 6px' }}>公司</th>
                <th style={{ padding: '8px 6px' }}>產業</th>
                <th style={{ padding: '8px 6px' }}>場次</th>
                <th style={{ padding: '8px 6px' }}>推薦人</th>
                <th style={{ padding: '8px 6px' }}>狀態</th>
                <th style={{ padding: '8px 6px' }}>報到</th>
                <th style={{ padding: '8px 6px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '8px 6px' }}>{r.phone}</td>
                  <td style={{ padding: '8px 6px' }}>{String(r.customAnswers?.company ?? '—')}</td>
                  <td style={{ padding: '8px 6px' }}>{String(r.customAnswers?.industry ?? '—')}</td>
                  <td style={{ padding: '8px 6px' }}>{r.sessionLabel ?? '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{r.referrerDisplayName ?? '—'}</td>
                  <td style={{ padding: '8px 6px' }}>
                    <Badge tone={r.status === 'cancelled' ? 'danger' : 'default'}>{r.status === 'cancelled' ? '已取消' : '已報名'}</Badge>
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <Button variant={r.checkedInAt ? 'ghost' : 'primary'} onClick={() => void toggleCheckin(r.id, !!r.checkedInAt)}>
                      {r.checkedInAt ? '✓ 已報到(點擊取消)' : '報到'}
                    </Button>
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <Button
                      variant="ghost"
                      onClick={() => void toggleCancel(r.id, r.status)}
                    >
                      {r.status === 'cancelled' ? '恢復報名' : '取消報名'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p style={{ padding: 12 }}>尚無報名紀錄</p>}
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// 統計
// ----------------------------------------------------------------------------
function StatsTab({
  stats, loading, error, onRetry,
}: {
  stats: EventStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  eventId: string;
}) {
  if (loading) return <LoadingState />;
  if (error || !stats) return <ErrorState message={error ?? '載入失敗'} onRetry={onRetry} />;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label="總報名數" value={stats.totalRegistrations} />
        <StatCard label="總報到數" value={stats.totalCheckedIn} tone="var(--color-primary-dark)" />
        <StatCard label="報到率" value={Math.round(stats.checkInRate * 100)} suffix="%" />
      </div>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>各場次報到狀況</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {stats.sessions.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span>{s.label}</span>
              <span>報名 {s.registeredCount} · 報到 {s.checkedInCount}</span>
            </div>
          ))}
          {stats.sessions.length === 0 && <p>此活動未設定場次</p>}
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>推薦人拆帳統計</h3>
        <p style={{ fontSize: 12, marginBottom: 12 }}>拆帳金額以「實際報到人數」計算;名單外自行填寫的推薦人僅列入統計,不套用拆帳規則。</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                <th style={{ padding: '8px 6px' }}>推薦人</th>
                <th style={{ padding: '8px 6px' }}>報名數</th>
                <th style={{ padding: '8px 6px' }}>報到數</th>
                <th style={{ padding: '8px 6px' }}>拆帳規則</th>
                <th style={{ padding: '8px 6px' }}>應拆金額</th>
              </tr>
            </thead>
            <tbody>
              {stats.referrers.map((r, i) => (
                <tr key={r.referrerId ?? `other-${i}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '8px 6px' }}>{r.registrationCount}</td>
                  <td style={{ padding: '8px 6px' }}>{r.checkedInCount}</td>
                  <td style={{ padding: '8px 6px' }}>
                    {r.commissionType == null ? '未設定(名單外自填)' : r.commissionType === 'percentage' ? `${r.commissionValue}%` : `每人 NT$${r.commissionValue}`}
                  </td>
                  <td style={{ padding: '8px 6px', fontWeight: 700 }}>
                    {r.commissionAmount == null ? '—' : `NT$${r.commissionAmount.toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.referrers.length === 0 && <p style={{ padding: 12 }}>尚無推薦人資料</p>}
        </div>
      </Card>
    </div>
  );
}
