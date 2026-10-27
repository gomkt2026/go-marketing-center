import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { PublicShell, PublicMessage } from '@/components/public/PublicShell';
import { checkinApi, ApiError } from '@/lib/api';

type ScanHit = { tone: 'success' | 'warning' | 'danger'; title: string; detail: string };
type Match = { id: string; name: string; phone: string; checkedInAt?: string | null; sessionLabel?: string | null };

function extractQrToken(raw: string): string {
  const text = raw.trim();
  try {
    const url = new URL(text);
    return url.searchParams.get('token') ?? text;
  } catch {
    return text;
  }
}

export function CheckinScan() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const staffToken = searchParams.get('token') ?? '';

  const [eventTitle, setEventTitle] = useState('');
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [result, setResult] = useState<ScanHit | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [finderOpen, setFinderOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');

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
        if (info.eventId !== eventId) setVerifyError('授權碼與此活動不符');
        else {
          setEventTitle(info.title);
          setCheckedInCount(Number(info.checkedInCount) || 0);
        }
      })
      .catch((err) => setVerifyError(err instanceof ApiError ? err.message : '驗證失敗'))
      .finally(() => setVerifying(false));
  }, [staffToken, eventId]);

  function showHit(hit: ScanHit, countUp: boolean) {
    setResult(hit);
    if (countUp) setCheckedInCount((n) => n + 1);
    const pattern = hit.tone === 'success' ? [80] : hit.tone === 'warning' ? [30, 40, 30] : [120, 40, 120];
    navigator.vibrate?.(pattern);
    window.setTimeout(() => setResult(null), 2200);
  }

  async function finishScan(res: { alreadyCheckedIn: boolean; registration: { name: string; sessionLabel?: string | null } }) {
    const session = res.registration.sessionLabel ? ` · ${res.registration.sessionLabel}` : '';
    if (res.alreadyCheckedIn) {
      showHit({ tone: 'warning', title: '已經報到', detail: `${res.registration.name}${session}` }, false);
    } else {
      showHit({ tone: 'success', title: '報到成功', detail: `${res.registration.name}${session}` }, true);
    }
    setFinderOpen(false);
    setMatches(null);
    setQuery('');
  }

  const lastTokenRef = useRef('');
  const lastAtRef = useRef(0);

  async function processToken(raw: string) {
    const qrToken = extractQrToken(raw);
    if (processingRef.current || !qrToken) return;
    const now = Date.now();
    if (qrToken === lastTokenRef.current && now - lastAtRef.current < 4000) return;
    lastTokenRef.current = qrToken;
    lastAtRef.current = now;
    processingRef.current = true;
    try {
      const res = await checkinApi.scan(staffToken, qrToken);
      await finishScan(res);
    } catch (err) {
      showHit({
        tone: 'danger',
        title: '沒有對到這場的報名',
        detail: err instanceof ApiError ? err.message : '請改用下方找人',
      }, false);
    } finally {
      window.setTimeout(() => { processingRef.current = false; }, 1600);
    }
  }

  async function confirmPerson(person: Match) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const res = await checkinApi.confirm(staffToken, person.id);
      await finishScan(res);
    } catch (err) {
      showHit({
        tone: 'danger',
        title: '報到失敗',
        detail: err instanceof ApiError ? err.message : '請再試一次',
      }, false);
    } finally {
      window.setTimeout(() => { processingRef.current = false; }, 1600);
    }
  }

  async function findPeople() {
    if (query.trim().length < 2) return;
    setFinding(true);
    setFindError('');
    try {
      const { matches: found } = await checkinApi.lookup(staffToken, query.trim());
      setMatches(found);
      if (found.length === 0) setFindError('這場沒有找到這個人');
    } catch (err) {
      setFindError(err instanceof ApiError ? err.message : '查詢失敗');
      setMatches(null);
    } finally {
      setFinding(false);
    }
  }

  const processRef = useRef(processToken);
  processRef.current = processToken;

  useEffect(() => {
    if (verifying || verifyError) return;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.floor(Math.min(width, height) * 0.72);
            return { width: size, height: size };
          },
        },
        (decodedText) => { void processRef.current(decodedText); },
        () => undefined,
      )
      .catch(() => setCameraError('相機沒有打開。請允許相機，或改用下方找已報名的人。'));

    return () => {
      scanner.stop().catch(() => undefined);
    };
  }, [verifying, verifyError]);

  if (verifying) return <PublicShell><p style={{ textAlign: 'center' }}>正在打開相機…</p></PublicShell>;

  if (verifyError) {
    return (
      <PublicShell>
        <PublicMessage title={verifyError} tone="danger" />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link to="/checkin" style={{ fontSize: 15, fontWeight: 700 }}>重新輸入報到連結</Link>
        </div>
      </PublicShell>
    );
  }

  const overlayColor = result?.tone === 'success' ? '#1F7A4D' : result?.tone === 'warning' ? '#C4842A' : '#B85454';

  return (
    <div style={{ minHeight: '100vh', background: '#10141C', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 16px 8px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>掃報名者的 QR</div>
          <h1 style={{ fontSize: 18, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventTitle}</h1>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{checkedInCount}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>已報到</div>
        </div>
      </header>

      <div style={{ position: 'relative', margin: '8px 12px 0' }}>
        <div
          id={containerId}
          style={{ width: '100%', height: '58vh', borderRadius: 18, overflow: 'hidden', background: '#000' }}
        />
        {result && (
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 18,
            background: overlayColor,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{result.title}</div>
            <div style={{ fontSize: 22, marginTop: 8, fontWeight: 700 }}>{result.detail}</div>
          </div>
        )}
      </div>

      {cameraError && <p style={{ margin: '12px 16px 0', color: '#F6C7C7', fontSize: 14 }}>{cameraError}</p>}

      <div style={{ padding: 12, marginTop: 'auto' }}>
        {!finderOpen ? (
          <button
            type="button"
            onClick={() => setFinderOpen(true)}
            style={sheetButton}
          >
            沒有 QR，用姓名或手機找人
          </button>
        ) : (
          <div style={{ background: '#fff', color: '#1B2B47', borderRadius: 16, padding: 12 }}>
            <form
              onSubmit={(e) => { e.preventDefault(); void findPeople(); }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="姓名或手機"
                inputMode="text"
                style={{
                  flex: 1,
                  fontSize: 16,
                  padding: '12px 12px',
                  borderRadius: 10,
                  border: '1px solid #D5D8DE',
                  minWidth: 0,
                }}
              />
              <button type="submit" disabled={finding || query.trim().length < 2} style={{ ...sheetButton, width: 'auto', padding: '0 16px', background: '#1B2B47' }}>
                {finding ? '…' : '找'}
              </button>
            </form>
            {findError && <p style={{ margin: '10px 0 0', fontSize: 14 }}>{findError}</p>}
            <div style={{ display: 'grid', gap: 8, marginTop: matches?.length ? 10 : 0 }}>
              {(matches ?? []).map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => void confirmPerson(person)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 12,
                    border: '1px solid #E4E7EE',
                    background: person.checkedInAt ? '#F4F5F7' : '#E8F6EE',
                    padding: '12px 14px',
                    fontSize: 16,
                  }}
                >
                  <strong>{person.name}</strong>
                  <span style={{ marginLeft: 8, fontSize: 13 }}>{person.phone}</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {person.sessionLabel ? `${person.sessionLabel} · ` : ''}
                    {person.checkedInAt ? '已經報到' : '點一下完成報到'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const sheetButton: CSSProperties = {
  width: '100%',
  minHeight: 52,
  border: 0,
  borderRadius: 14,
  background: '#F26522',
  color: '#fff',
  fontSize: 16,
  fontWeight: 800,
};
