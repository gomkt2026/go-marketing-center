import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApiError, inquiriesApi, type PostingInquiry } from '@/lib/api';

const muted: CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 };
const input: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-bg-soft)', width: '100%', boxSizing: 'border-box',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

export function Inquiries() {
  const [rows, setRows] = useState<PostingInquiry[]>([]);
  const [filter, setFilter] = useState<'new' | 'contacted' | 'all'>('new');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await inquiriesApi.list();
      setRows(data.inquiries);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '需求清單載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const fresh = rows.filter((r) => r.status === 'new').length;

  return (
    <div>
      <PageHeader
        title="發文需求"
        subtitle="公開頁「Go 幫你發文」留下的聯絡方式。請用電話或 LINE 跟對方聯繫。"
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button variant={filter === 'new' ? 'primary' : 'ghost'} onClick={() => setFilter('new')}>未聯絡 {fresh}</Button>
        <Button variant={filter === 'contacted' ? 'primary' : 'ghost'} onClick={() => setFilter('contacted')}>已聯絡</Button>
        <Button variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')}>全部 {rows.length}</Button>
      </div>
      {err && <p style={{ ...muted, color: '#9a3412' }}>{err}</p>}
      {loading && <p style={muted}>載入中…</p>}
      {!loading && !shown.length && <p style={muted}>目前沒有這一類需求。</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((row) => (
          <InquiryCard key={row.id} row={row} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function InquiryCard({ row, onChanged }: { row: PostingInquiry; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState(row.staffNote ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save(status?: 'new' | 'contacted', e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await inquiriesApi.update(row.id, {
        ...(status ? { status } : {}),
        staffNote: note,
      });
      await onChanged();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 16 }}>{row.name}</b>
          <span style={{ marginLeft: 8 }}>
            <Badge tone={row.status === 'new' ? 'accent' : 'success'}>
              {row.status === 'new' ? '未聯絡' : '已聯絡'}
            </Badge>
          </span>
          <div style={{ marginTop: 6, fontSize: 15 }}>
            <a href={`tel:${row.phone}`}>{row.phone}</a>
            {row.lineId ? <span style={{ marginLeft: 12 }}>LINE {row.lineId}</span> : null}
          </div>
          <div style={muted}>{row.trade}</div>
        </div>
        <div style={{ ...muted, textAlign: 'right' }}>
          {formatDateTime(row.createdAt)}
          {row.contactedAt ? <div>已聯絡 {formatDateTime(row.contactedAt)}</div> : null}
        </div>
      </div>
      {row.message ? <p style={{ ...muted, marginTop: 12, whiteSpace: 'pre-wrap' }}>{row.message}</p> : null}
      <form onSubmit={(e) => save(undefined, e)} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <label style={{ ...muted, fontWeight: 700 }}>
          內部備註
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={{ ...input, marginTop: 6, minHeight: 64 }} />
        </label>
        {err && <p style={{ ...muted, color: '#9a3412', margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="submit" variant="ghost" disabled={saving}>儲存備註</Button>
          {row.status === 'new'
            ? <Button type="button" disabled={saving} onClick={() => save('contacted')}>標記已聯絡</Button>
            : <Button type="button" variant="ghost" disabled={saving} onClick={() => save('new')}>改回未聯絡</Button>}
        </div>
      </form>
    </Card>
  );
}
