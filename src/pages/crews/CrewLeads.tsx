import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApiError, crewLeadsApi, type CrewLead, type CrewLeadStatus } from '@/lib/api';
import { ALLIANCE_CREWS } from '@/data/alliance-crews';

const muted: CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 };
const input: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-bg-soft)', width: '100%', boxSizing: 'border-box',
};

const STATUS_LABEL: Record<CrewLeadStatus, string> = {
  new: '未轉交',
  handed: '已轉交工班',
  closed: '已結案',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

function crewLabel(slug: string): string {
  const crew = ALLIANCE_CREWS.find((item) => item.slug === slug);
  return crew ? `${crew.name}｜${crew.person}` : slug;
}

function handoffText(row: CrewLead): string {
  const who = row.intent === 'partner' ? '合作工班' : '客戶';
  return [
    `【工班客源】${crewLabel(row.crewSlug)}`,
    `${who}：${row.name}`,
    `手機：${row.phone}`,
    row.lineId ? `LINE：${row.lineId}` : '',
    `需求：${row.need}`,
    row.place ? `地點：${row.place}` : '',
    row.message ? `補充：${row.message}` : '',
    '來源：修繕工程聯盟・工班現場',
  ].filter(Boolean).join('\n');
}

export function CrewLeads() {
  const [rows, setRows] = useState<CrewLead[]>([]);
  const [status, setStatus] = useState<CrewLeadStatus | 'all'>('new');
  const [crew, setCrew] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await crewLeadsApi.list();
      setRows(data.leads);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '工班客源載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const fresh = rows.filter((row) => row.status === 'new').length;
  const shown = rows.filter((row) => (status === 'all' || row.status === status) && (crew === 'all' || row.crewSlug === crew));

  return (
    <div>
      <PageHeader
        title="工班客源"
        subtitle="公開頁「工班現場」留下的客戶與合作留言。電話只在這裡看得到。複製後傳給對應工班主，就是他們從聯盟拿到的客戶來源。"
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button variant={status === 'new' ? 'primary' : 'ghost'} onClick={() => setStatus('new')}>未轉交 {fresh}</Button>
        <Button variant={status === 'handed' ? 'primary' : 'ghost'} onClick={() => setStatus('handed')}>已轉交工班</Button>
        <Button variant={status === 'closed' ? 'primary' : 'ghost'} onClick={() => setStatus('closed')}>已結案</Button>
        <Button variant={status === 'all' ? 'primary' : 'ghost'} onClick={() => setStatus('all')}>全部 {rows.length}</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant={crew === 'all' ? 'primary' : 'ghost'} onClick={() => setCrew('all')}>全部工班</Button>
        {ALLIANCE_CREWS.map((item) => (
          <Button key={item.slug} variant={crew === item.slug ? 'primary' : 'ghost'} onClick={() => setCrew(item.slug)}>
            {item.name}
          </Button>
        ))}
      </div>
      {err && <p style={{ ...muted, color: '#9a3412' }}>{err}</p>}
      {loading && <p style={muted}>載入中…</p>}
      {!loading && !shown.length && <p style={muted}>目前沒有這一類留言。</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((row) => (
          <LeadCard key={row.id} row={row} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ row, onChanged }: { row: CrewLead; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState(row.staffNote ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  async function save(next?: CrewLeadStatus, e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await crewLeadsApi.update(row.id, {
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
          <b style={{ fontSize: 16 }}>{row.name}</b>
          <span style={{ marginLeft: 8 }}>
            <Badge tone={row.status === 'new' ? 'accent' : row.status === 'handed' ? 'success' : 'default'}>
              {STATUS_LABEL[row.status]}
            </Badge>
          </span>
          <span style={{ marginLeft: 8 }}>
            <Badge>{row.intent === 'partner' ? '合作工班' : '找工班的客戶'}</Badge>
          </span>
          <div style={{ marginTop: 6, fontWeight: 700 }}>{crewLabel(row.crewSlug)}</div>
          <div style={{ marginTop: 6, fontSize: 15 }}>
            <a href={`tel:${row.phone}`}>{row.phone}</a>
            {row.lineId ? <span style={{ marginLeft: 12 }}>LINE {row.lineId}</span> : null}
          </div>
          <div style={{ marginTop: 6 }}>{row.need}</div>
          {row.place ? <div style={muted}>{row.place}</div> : null}
        </div>
        <div style={{ ...muted, textAlign: 'right' }}>
          {formatDateTime(row.createdAt)}
          {row.handedAt ? <div>已轉交 {formatDateTime(row.handedAt)}</div> : null}
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
        {copied && <p style={{ ...muted, color: '#1f7a3a', margin: 0 }}>已複製，可以貼給這組工班主。</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="button" variant="ghost" onClick={() => { void copyHandoff(); }}>複製給工班</Button>
          <Button type="submit" variant="ghost" disabled={saving}>儲存備註</Button>
          {row.status !== 'handed' && (
            <Button type="button" disabled={saving} onClick={() => save('handed')}>標記已轉交</Button>
          )}
          {row.status !== 'new' && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => save('new')}>改回未轉交</Button>
          )}
          {row.status !== 'closed' && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => save('closed')}>結案</Button>
          )}
        </div>
      </form>
    </Card>
  );
}
