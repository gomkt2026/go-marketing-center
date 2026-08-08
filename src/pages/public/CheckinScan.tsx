import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { PublicShell, PublicMessage, publicInputStyle } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/Button';
import { checkinApi, ApiError } from '@/lib/api';

type ScanResult = { tone: 'success' | 'warning' | 'danger'; message: string };

export function CheckinScan() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const staffToken = searchParams.get('token') ?? '';

  const [eventTitle, setEventTitle] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [manualInput, setManualInput] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const containerId = 'checkin-camera';

  useEffect(() => {
    if (!staffToken) {
      setVerifyError('缺少報到授權碼');
      setVerifying(false);
      return;
    }
    checkinApi.verify(staffToken)
      .then((info) => {
        if (info.eventId !== eventId) {
          setVerifyError('授權碼與此活動不符');
        } else {
          setEventTitle(info.title);
        }
      })
      .catch((err) => setVerifyError(err instanceof ApiError ? err.message : '驗證失敗'))
      .finally(() => setVerifying(false));
  }, [staffToken, eventId]);

  async function processToken(qrToken: string) {
    if (processingRef.current || !qrToken.trim()) return;
    processingRef.current = true;
    try {
      const res = await checkinApi.scan(staffToken, qrToken.trim());
      if (res.alreadyCheckedIn) {
        setResult({ tone: 'warning', message: `${res.registration.name} 已經報到過了` });
      } else {
        setResult({ tone: 'success', message: `${res.registration.name} 報到成功!` });
        setScanCount((n) => n + 1);
      }
    } catch (err) {
      setResult({ tone: 'danger', message: err instanceof ApiError ? err.message : '報到失敗' });
    } finally {
      setTimeout(() => { processingRef.current = false; }, 1500);
    }
  }

  useEffect(() => {
    if (verifying || verifyError) return;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (decodedText) => void processToken(decodedText),
        () => { /* ignore per-frame scan errors */ },
      )
      .catch(() => setCameraError('無法啟用相機,請改用下方手動輸入'));

    return () => {
      scanner.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying, verifyError]);

  if (verifying) return <PublicShell><p style={{ textAlign: 'center' }}>驗證中…</p></PublicShell>;

  if (verifyError) {
    return (
      <PublicShell>
        <PublicMessage title={verifyError} tone="danger" />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link to="/checkin" style={{ fontSize: 13, color: 'var(--color-primary-dark)' }}>重新輸入授權碼</Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell maxWidth={420}>
      <h1 style={{ fontSize: 17, marginBottom: 4, textAlign: 'center' }}>{eventTitle}</h1>
      <p style={{ fontSize: 13, textAlign: 'center', marginBottom: 14 }}>本場已報到 <strong>{scanCount}</strong> 人</p>

      <div
        id={containerId}
        style={{
          width: '100%', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden',
          background: '#111', marginBottom: 14,
        }}
      />

      {cameraError && <PublicMessage title={cameraError} tone="danger" />}

      {result && (
        <div style={{ marginBottom: 14 }}>
          <PublicMessage
            title={result.message}
            tone={result.tone === 'success' ? 'success' : result.tone === 'danger' ? 'danger' : 'default'}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="或手動輸入票券碼"
          style={{ ...publicInputStyle, flex: 1 }}
        />
        <Button
          variant="secondary"
          onClick={() => { void processToken(manualInput); setManualInput(''); }}
        >
          報到
        </Button>
      </div>
    </PublicShell>
  );
}
