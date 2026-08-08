import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { PublicShell, PublicMessage, publicInputStyle, publicLabelStyle } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { publicApi, ApiError } from '@/lib/api';
import type { EventRegistration } from '@/types';

type Ticket = EventRegistration & {
  eventSlug: string; eventTitle: string; eventLocation?: string; eventDate?: string;
  lineAddFriendUrl?: string; sessionLabel?: string;
};

function TicketView({ ticket, onRefresh }: { ticket: Ticket; onRefresh: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, ticket.qrToken, { width: 220, margin: 1 });
    }
  }, [ticket.qrToken]);

  useEffect(() => {
    const interval = setInterval(onRefresh, 10000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  return (
    <div style={{ textAlign: 'center' }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>{ticket.eventTitle}</h1>
      <div style={{ marginBottom: 14 }}>
        {ticket.checkedInAt ? (
          <Badge tone="primary">✓ 已報到</Badge>
        ) : (
          <Badge tone="accent">尚未報到</Badge>
        )}
      </div>

      <div
        style={{
          display: 'inline-block', padding: 14, borderRadius: 16,
          background: '#fff', border: '1px solid var(--color-border)', marginBottom: 14,
        }}
      >
        <canvas ref={canvasRef} />
      </div>

      <div style={{ textAlign: 'left', fontSize: 13, display: 'grid', gap: 6, marginBottom: 14 }}>
        <div><strong>姓名</strong>&nbsp;&nbsp;{ticket.name}</div>
        <div><strong>手機</strong>&nbsp;&nbsp;{ticket.phone}</div>
        {ticket.sessionLabel && <div><strong>場次</strong>&nbsp;&nbsp;{ticket.sessionLabel}</div>}
        {ticket.eventLocation && <div><strong>地點</strong>&nbsp;&nbsp;{ticket.eventLocation}</div>}
        {ticket.eventDate && <div><strong>時間</strong>&nbsp;&nbsp;{new Date(ticket.eventDate).toLocaleString('zh-TW')}</div>}
      </div>

      <p style={{ fontSize: 12, marginBottom: 12 }}>請於活動現場出示此 QR Code 供工作人員掃描報到</p>

      {ticket.lineAddFriendUrl && (
        <a href={ticket.lineAddFriendUrl} target="_blank" rel="noreferrer">
          <Button variant="secondary" style={{ width: '100%', justifyContent: 'center' }}>
            📱 加入官方 LINE 好友,接收活動通知
          </Button>
        </a>
      )}
    </div>
  );
}

export function EventTicket() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get('token');

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(!!tokenFromQuery);
  const [error, setError] = useState('');

  const [phone, setPhone] = useState('');
  const [candidates, setCandidates] = useState<EventRegistration[] | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  async function loadTicket(token: string) {
    setLoading(true);
    setError('');
    try {
      const { ticket: t } = await publicApi.ticket(token);
      setTicket(t as Ticket);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '查無此票券');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tokenFromQuery) void loadTicket(tokenFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromQuery]);

  async function handleLookup() {
    if (!slug || !phone.trim()) return;
    setLookingUp(true);
    setLookupError('');
    try {
      const { registrations } = await publicApi.lookupByPhone(slug, phone.trim());
      setCandidates(registrations);
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : '查詢失敗');
      setCandidates(null);
    } finally {
      setLookingUp(false);
    }
  }

  if (loading) return <PublicShell><p style={{ textAlign: 'center' }}>載入中…</p></PublicShell>;

  if (ticket) {
    return <PublicShell><TicketView ticket={ticket} onRefresh={() => void loadTicket(ticket.qrToken)} /></PublicShell>;
  }

  return (
    <PublicShell>
      {error && <PublicMessage title={error} tone="danger" />}
      {candidates ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>找到 {candidates.length} 筆報名紀錄,請選擇要查看的票券:</p>
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => void loadTicket(c.qrToken)}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              {c.sessionLabel && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.sessionLabel}</div>}
              <div style={{ fontSize: 12, marginTop: 4 }}>{c.checkedInAt ? '✓ 已報到' : '尚未報到'}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>查詢我的票券</p>
          <label style={publicLabelStyle}>
            <span>報名時填寫的手機號碼</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={publicInputStyle} placeholder="09xxxxxxxx" inputMode="numeric" />
          </label>
          {lookupError && <PublicMessage title={lookupError} tone="danger" />}
          <Button variant="primary" disabled={lookingUp} onClick={() => void handleLookup()} style={{ width: '100%', justifyContent: 'center' }}>
            {lookingUp ? '查詢中…' : '查詢票券'}
          </Button>
        </div>
      )}
    </PublicShell>
  );
}
