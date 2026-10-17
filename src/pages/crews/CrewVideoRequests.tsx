import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  ApiError,
  crewVideoRequestsApi,
  type CrewVideoRequest,
  type CrewVideoStatus,
} from '@/lib/api';

const muted: CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 };
const input: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-bg-soft)', width: '100%', boxSizing: 'border-box',
};

const STATUS_LABEL: Record<CrewVideoStatus, string> = {
  new: '待聯絡',
  scheduled: '已約拍',
  filmed: '已拍攝',
  closed: '不拍了',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

function handoffText(row: CrewVideoRequest): string {
  return [
    `【工班拍片】${row.crewName}`,
    `聯絡人：${row.name}`,
    `手機：${row.phone}`,
    row.lineId ? `LINE：${row.lineId}` : '',
    `工種：${row.trade}`,
    row.area ? `範圍：${row.area}` : '',
    '拍攝：介紹工班和師傅',
    row.message ? `補充：${row.message}` : '',
    row.allianceIntent ? 'FIXERCOWORK：已有意願加入' : 'FIXERCOWORK：尚未表示加入意願',
    row.portraitConsent ? '修繕聯盟露出：已同意肖像權及訪談授權' : '修繕聯盟露出：未同意',
    '來源：工班現場・拍攝需求',
  ].filter(Boolean).join('\n');
}

export function CrewVideoRequests() {
  const [rows, setRows] = useState<CrewVideoRequest[]>([]);
  const [status, setStatus] = useState<CrewVideoStatus | 'all'>('new');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await crewVideoRequestsApi.list();
      setRows(data.requests);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '拍攝需求載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const count = (key: CrewVideoStatus) => rows.filter((row) => row.status === key).length;
  const shown = rows.filter((row) => status === 'all' || row.status === status);

  return (
    <div>
      <PageHeader
        title="工班拍片"
        subtitle="公開頁「工班現場」最下面留下的短片拍攝需求。電話只在這裡看得到。聯絡後約時間到現場拍，再拿去發。"
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant={status === 'new' ? 'primary' : 'ghost'} onClick={() => setStatus('new')}>待聯絡 {count('new')}</Button>
        <Button variant={status === 'scheduled' ? 'primary' : 'ghost'} onClick={() => setStatus('scheduled')}>已約拍 {count('scheduled')}</Button>
        <Button variant={status === 'filmed' ? 'primary' : 'ghost'} onClick={() => setStatus('filmed')}>已拍攝 {count('filmed')}</Button>
        <Button variant={status === 'closed' ? 'primary' : 'ghost'} onClick={() => setStatus('closed')}>不拍了</Button>
        <Button variant={status === 'all' ? 'primary' : 'ghost'} onClick={() => setStatus('all')}>全部 {rows.length}</Button>
      </div>
      {err && <p style={{ ...muted, color: '#9a3412' }}>{err}</p>}
      {loading && <p style={muted}>載入中…</p>}
      {!loading && !shown.length && <p style={muted}>目前沒有這一類拍攝需求。</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((row) => (
          <RequestCard key={row.id} row={row} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function RequestCard({ row, onChanged }: { row: CrewVideoRequest; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState(row.staffNote ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  async function save(next?: CrewVideoStatus, e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await crewVideoRequestsApi.update(row.id, {
        ...(next ? { status: next } : {}),
        staffNote: note,
      });
      await onChanged();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function copyHandoff() {
    setErr('');
    try {
      await navigator.clipboard.writeText(handoffText(row));
      setCopied(true);
    } catch {
      setErr('複製失敗，請手動選取下面這段');
      setCopied(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 16 }}>{row.crewName}</b>
          <span style={{ marginLeft: 8 }}>
            <Badge tone={row.status === 'new' ? 'accent' : row.status === 'filmed' ? 'success' : 'default'}>
              {STATUS_LABEL[row.status]}
            </Badge>
          </span>
          <div style={{ marginTop: 6 }}>{row.name}　{row.trade}</div>
          <div style={{ marginTop: 6, fontSize: 15 }}>
            <a href={`tel:${row.phone}`}>{row.phone}</a>
            {row.lineId ? <span style={{ marginLeft: 12 }}>LINE {row.lineId}</span> : null}
          </div>
          <div style={{ marginTop: 6 }}>拍攝：介紹工班和師傅</div>
          {row.area ? <div style={muted}>{row.area}</div> : null}
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={row.allianceIntent ? 'success' : 'danger'}>
              {row.allianceIntent ? '已有意願加入 FIXERCOWORK' : '尚未表示加入意願'}
            </Badge>
            <Badge tone={row.portraitConsent ? 'success' : 'danger'}>
              {row.portraitConsent ? '已同意修繕聯盟露出' : '未同意露出'}
            </Badge>
          </div>
        </div>
        <div style={{ ...muted, textAlign: 'right' }}>
          {formatDateTime(row.createdAt)}
          {row.contactedAt ? <div>已約拍 {formatDateTime(row.contactedAt)}</div> : null}
          {row.filmedAt ? <div>已拍攝 {formatDateTime(row.filmedAt)}</div> : null}
        </div>
      </div>
      {row.message ? <p style={{ ...muted, marginTop: 12, whiteSpace: 'pre-wrap' }}>{row.message}</p> : null}
      <pre style={{ ...muted, whiteSpace: 'pre-wrap', background: 'var(--color-bg-soft)', padding: 12, borderRadius: 8, marginTop: 12 }}>{handoffText(row)}</pre>
      <form onSubmit={(e) => save(undefined, e)} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <label style={{ ...muted, fontWeight: 700 }}>
          內部備註
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={{ ...input, marginTop: 6, minHeight: 64 }} />
        </label>
        {err && <p style={{ ...muted, color: '#9a3412', margin: 0 }}>{err}</p>}
        {copied && <p style={{ ...muted, color: '#1f7a3a', margin: 0 }}>已複製，可以貼給拍攝的人。</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="button" variant="ghost" onClick={() => { void copyHandoff(); }}>複製給拍攝</Button>
          <Button type="submit" variant="ghost" disabled={saving}>儲存備註</Button>
          {row.status !== 'scheduled' && (
            <Button type="button" disabled={saving} onClick={() => save('scheduled')}>標記已約拍</Button>
          )}
          {row.status !== 'filmed' && (
            <Button type="button" disabled={saving} onClick={() => save('filmed')}>標記已拍攝</Button>
          )}
          {row.status !== 'new' && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => save('new')}>改回待聯絡</Button>
          )}
          {row.status !== 'closed' && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => save('closed')}>不拍了</Button>
          )}
        </div>
      </form>
    </Card>
  );
}
