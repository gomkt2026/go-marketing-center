import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import type { EventRecord, EventStatus } from '@/types';

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, background: 'var(--color-bg-soft)', outline: 'none', width: '100%',
};
const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };

const TAICHUNG_LOCATION = '台中市五權西路二段666號15樓';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultNextDate(sourceIso?: string | null): Date {
  const source = sourceIso ? new Date(sourceIso) : null;
  const base = source && !Number.isNaN(source.getTime()) && source.getTime() > Date.now() - 86400000
    ? new Date(source)
    : new Date();
  base.setDate(base.getDate() + 14);
  base.setHours(13, 30, 0, 0);
  return base;
}

function snapToWeekday(d: Date, weekday: number): Date {
  const out = new Date(d);
  const delta = (weekday - out.getDay() + 7) % 7;
  out.setDate(out.getDate() + (delta > 3 ? delta - 7 : delta));
  out.setHours(13, 30, 0, 0);
  return out;
}

function titleWithCity(title: string, city: string, date: Date): string {
  const base = title.replace(/｜.+$/, '').trim() || title;
  return `${base}｜${city} ${date.getMonth() + 1}/${date.getDate()}`;
}

export function DuplicateEventDialog({
  event,
  brandSlug,
  onClose,
  onDuplicated,
}: {
  event: EventRecord;
  brandSlug: string;
  onClose: () => void;
  onDuplicated: (event: EventRecord) => void;
}) {
  const initialDate = defaultNextDate(event.eventDate);
  const [title, setTitle] = useState(event.title.replace(/｜.+$/, '').trim() || event.title);
  const [location, setLocation] = useState(event.location ?? '');
  const [eventDate, setEventDate] = useState(toDatetimeLocal(initialDate));
  const [status, setStatus] = useState<EventStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isFixer = brandSlug === 'fixercowork';

  function applyCity(city: '台中' | '高雄') {
    const weekday = city === '台中' ? 5 : 4;
    const next = snapToWeekday(eventDate ? new Date(eventDate) : initialDate, weekday);
    setEventDate(toDatetimeLocal(next));
    setTitle(titleWithCity(event.title, city, next));
    if (city === '台中') setLocation(TAICHUNG_LOCATION);
    else if (!location.includes('高雄')) setLocation('高雄市');
  }

  async function submit() {
    setError('');
    if (!title.trim()) {
      setError('請填寫活動名稱');
      return;
    }
    setSaving(true);
    try {
      const { event: created } = await api.duplicateEvent(event.id, {
        title: title.trim(),
        location,
        eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        status,
      });
      onDuplicated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '複製失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20, 24, 20, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 80, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)', borderRadius: 16, padding: 24,
          width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto',
          boxShadow: 'var(--shadow-card-hover)',
        }}
      >
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>複製活動</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          會複製表單欄位、場次與推薦人，不會複製報名名單。新活動會產生獨立的報名連結與報到授權碼。
        </p>

        {isFixer && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Button variant="secondary" onClick={() => applyCity('台中')}>下次台中場（週五 13:30）</Button>
            <Button variant="secondary" onClick={() => applyCity('高雄')}>下次高雄場（週四 13:30）</Button>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={labelStyle}><span>活動名稱</span>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={labelStyle}><span>地點</span>
            <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="高雄場請補上實際地址" />
          </label>
          <label style={labelStyle}><span>活動時間（13:30 入場 · 16:30 結束）</span>
            <input type="datetime-local" style={inputStyle} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
          <label style={labelStyle}><span>建立後狀態</span>
            <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              <option value="draft">草稿（先檢查再開放）</option>
              <option value="open">直接開放報名</option>
            </select>
          </label>
        </div>

        {error && <p style={{ color: '#B85454', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? '複製中…' : '建立副本'}
          </Button>
        </div>
      </div>
    </div>
  );
}
