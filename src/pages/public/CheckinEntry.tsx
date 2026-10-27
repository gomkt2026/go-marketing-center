import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const tokenFromLink = searchParams.get('token') ?? '';

  async function openScanner(raw: string) {
    const staffToken = extractToken(raw);
    if (!staffToken) return;
    setSubmitting(true);
    setError('');
    try {
      const info = await checkinApi.verify(staffToken);
      navigate(`/checkin/${info.eventId}?token=${encodeURIComponent(staffToken)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '驗證失敗');
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (tokenFromLink) void openScanner(tokenFromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromLink]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await openScanner(input);
  }

  if (tokenFromLink && !error) {
    return <PublicShell><p style={{ textAlign: 'center' }}>正在打開相機…</p></PublicShell>;
  }

  return (
    <PublicShell>
      <h1 style={{ fontSize: 22, marginBottom: 8, textAlign: 'center' }}>工作人員報到</h1>
      <p style={{ fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
        貼上主辦給的報到連結。打開後直接對準報名者手機上的 QR。
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: 14 }}>
        <label style={publicLabelStyle}>
          <span>報到連結或授權碼</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ ...publicInputStyle, fontSize: 16, padding: '14px 12px' }}
            placeholder="貼上連結"
            autoFocus
          />
        </label>
        {error && <PublicMessage title={error} tone="danger" />}
        <Button type="submit" variant="primary" disabled={submitting || !input.trim()} style={{ width: '100%', justifyContent: 'center', minHeight: 48, fontSize: 16 }}>
          {submitting ? '驗證中…' : '開始掃碼'}
        </Button>
      </form>
    </PublicShell>
  );
}
