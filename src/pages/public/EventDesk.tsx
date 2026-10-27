import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PublicShell, PublicMessage, publicInputStyle, publicLabelStyle, FIXER_NAVY, FIXER_ORANGE } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/Button';
import { publicApi, ApiError } from '@/lib/api';
import type { EventRegistration } from '@/types';

type Found = Pick<EventRegistration, 'id' | 'name' | 'phone' | 'checkedInAt' | 'sessionLabel'>;

export function EventDesk() {
  const { slug } = useParams();
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState<{ name: string; slug: string; logoUrl?: string | null; primaryColor?: string | null; tagline?: string | null } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [phone, setPhone] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [matches, setMatches] = useState<Found[] | null>(null);
  const [done, setDone] = useState<{ name: string; already: boolean } | null>(null);
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    if (!slug) return;
    publicApi.event(slug)
      .then((res) => {
        setTitle(res.event.title);
        setBrand(res.brand);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : '活動不存在'));
  }, [slug]);

  async function lookup() {
    if (!slug || !phone.trim()) return;
    setLooking(true);
    setLookupError('');
    setDone(null);
    try {
      const { registrations } = await publicApi.lookupByPhone(slug, phone.trim());
      setMatches(registrations);
    } catch (err) {
      setMatches(null);
      setLookupError(err instanceof ApiError ? err.message : '查無報名');
    } finally {
      setLooking(false);
    }
  }

  async function arrive(person: Found) {
    if (!slug || arriving) return;
    if (person.checkedInAt) {
      setDone({ name: person.name, already: true });
      setMatches(null);
      return;
    }
    setArriving(true);
    setLookupError('');
    try {
      const res = await publicApi.arrive(slug, { phone: person.phone, registrationId: person.id });
      setDone({ name: res.registration.name, already: res.alreadyCheckedIn });
      setMatches(null);
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : '報到失敗');
    } finally {
      setArriving(false);
    }
  }

  const accent = brand?.slug === 'fixercowork' ? FIXER_ORANGE : undefined;

  return (
    <PublicShell brand={brand}>
      <h1 style={{ fontSize: 22, textAlign: 'center', marginBottom: 6, color: brand?.slug === 'fixercowork' ? FIXER_NAVY : undefined }}>
        {title || '活動報到'}
      </h1>
      <p style={{ textAlign: 'center', fontSize: 15, marginBottom: 18, lineHeight: 1.6 }}>
        輸入報名時的手機，確認姓名後完成報到。
      </p>
      {loadError && <PublicMessage title={loadError} tone="danger" />}
      {done ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            padding: '28px 16px',
            borderRadius: 16,
            background: done.already ? '#FFF6E8' : '#E8F6EE',
            color: done.already ? '#6A4510' : '#145C38',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{done.already ? '已經報到' : '報到成功'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{done.name}</div>
          </div>
          <Button
            variant="ghost"
            style={{ marginTop: 16, width: '100%', justifyContent: 'center', minHeight: 48 }}
            onClick={() => { setDone(null); setPhone(''); }}
          >
            下一位
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void lookup(); }}
          style={{ display: 'grid', gap: 14 }}
        >
          <label style={publicLabelStyle}>
            <span>手機號碼</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="09xxxxxxxx"
              style={{ ...publicInputStyle, fontSize: 18, padding: '14px 12px' }}
            />
          </label>
          {lookupError && <PublicMessage title={lookupError} tone="danger" />}
          <Button
            type="submit"
            variant="primary"
            disabled={looking || !phone.trim()}
            style={{ width: '100%', justifyContent: 'center', minHeight: 48, fontSize: 16, ...(accent ? { background: accent, color: '#fff' } : {}) }}
          >
            {looking ? '查詢中…' : '找出我的報名'}
          </Button>
          {matches && matches.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {matches.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  disabled={arriving}
                  onClick={() => void arrive(person)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 14,
                    border: '1px solid #E4E7EE',
                    background: person.checkedInAt ? '#F4F5F7' : '#E8F6EE',
                    padding: '16px 14px',
                    fontSize: 16,
                  }}
                >
                  <strong style={{ fontSize: 20 }}>{person.name}</strong>
                  {person.sessionLabel && <div style={{ marginTop: 4, fontSize: 13 }}>{person.sessionLabel}</div>}
                  <div style={{ marginTop: 6, fontWeight: 800 }}>{person.checkedInAt ? '已經報到' : '是我，完成報到'}</div>
                </button>
              ))}
            </div>
          )}
        </form>
      )}
    </PublicShell>
  );
}
