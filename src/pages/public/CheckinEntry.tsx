import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicShell, PublicMessage, publicInputStyle, publicLabelStyle } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/Button';
import { checkinApi, ApiError } from '@/lib/api';

function extractToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get('token') ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function CheckinEntry() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const staffToken = extractToken(input);
    if (!staffToken) return;
    setSubmitting(true);
    try {
      const info = await checkinApi.verify(staffToken);
      navigate(`/checkin/${info.eventId}?token=${staffToken}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '驗證失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <h1 style={{ fontSize: 18, marginBottom: 8, textAlign: 'center' }}>活動報到系統</h1>
      <p style={{ fontSize: 13, textAlign: 'center', marginBottom: 20 }}>請輸入主辦單位提供的報到授權碼或連結</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        <label style={publicLabelStyle}>
          <span>報到授權碼 / 連結</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} style={publicInputStyle} placeholder="貼上授權連結或授權碼" />
        </label>
        {error && <PublicMessage title={error} tone="danger" />}
        <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
          {submitting ? '驗證中…' : '進入報到頁面'}
        </Button>
      </form>
    </PublicShell>
  );
}
