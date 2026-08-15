import { useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PublicShell, PublicMessage, publicInputStyle, publicLabelStyle, brandAccent } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/Button';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { publicApi, ApiError } from '@/lib/api';

const REFERRER_OTHER = '__other__';

type CustomAnswers = Record<string, string | string[]>;

function selectedList(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function EventRegister() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(
    () => (slug ? publicApi.event(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lineId, setLineId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [referrerChoice, setReferrerChoice] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const [customAnswers, setCustomAnswers] = useState<CustomAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (loading) return <PublicShell><LoadingState /></PublicShell>;
  if (error || !data) return <PublicShell><ErrorState message={error ?? '載入失敗'} onRetry={reload} /></PublicShell>;

  const { event, sessions, referrers, brand } = data;
  const accent = brandAccent(brand);

  if (event.status !== 'open') {
    return (
      <PublicShell brand={brand}>
        <PublicMessage title="此活動目前未開放報名" tone="danger" body="請聯繫主辦單位確認報名時間。" />
      </PublicShell>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!slug) return;

    for (const field of event.formFields) {
      if (!field.required) continue;
      const value = customAnswers[field.key];
      const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (empty) {
        setFormError(`請填寫「${field.label}」`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { registration } = await publicApi.register(slug, {
        name,
        phone,
        email: email || undefined,
        lineId: lineId || undefined,
        sessionId: sessionId || undefined,
        referrerId: referrerChoice && referrerChoice !== REFERRER_OTHER ? referrerChoice : undefined,
        referrerName: referrerChoice === REFERRER_OTHER ? referrerName : undefined,
        customAnswers,
      });
      navigate(`/e/${slug}/ticket?token=${registration.qrToken}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '報名失敗,請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell brand={brand}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6, color: brand?.slug === 'fixercowork' ? '#1A2F4B' : undefined }}>
          {event.title}
        </h1>
        {event.description && (
          <p style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
            {event.description}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
          {event.location && <span>地點 {event.location}</span>}
          {event.eventDate && <span>時間 {new Date(event.eventDate).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>}
          {event.priceLabel && <span>{event.priceLabel}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        <label style={publicLabelStyle}>
          <span>姓名 *</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} style={publicInputStyle} placeholder="請輸入姓名" />
        </label>
        <label style={publicLabelStyle}>
          <span>手機號碼 *</span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={publicInputStyle}
            placeholder="09xxxxxxxx"
            inputMode="numeric"
          />
        </label>
        <label style={publicLabelStyle}>
          <span>Email(選填)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={publicInputStyle} placeholder="you@example.com" />
        </label>
        <label style={publicLabelStyle}>
          <span>LINE ID(選填,加入好友後可收到活動通知)</span>
          <input value={lineId} onChange={(e) => setLineId(e.target.value)} style={publicInputStyle} placeholder="你的 LINE ID" />
        </label>

        {sessions.length > 0 && (
          <label style={publicLabelStyle}>
            <span>選擇場次 *</span>
            <select required value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={publicInputStyle}>
              <option value="" disabled>請選擇場次</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id} disabled={s.remaining === 0}>
                  {s.label}{s.remaining != null ? `(剩餘 ${s.remaining} 位)` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {event.formFields.map((field) => (
          <div key={field.key} style={publicLabelStyle}>
            <span>{field.label}{field.required ? ' *' : ''}</span>
            {field.type === 'textarea' ? (
              <textarea
                required={field.required}
                value={typeof customAnswers[field.key] === 'string' ? customAnswers[field.key] as string : ''}
                onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                style={{ ...publicInputStyle, minHeight: 80, resize: 'vertical' }}
              />
            ) : field.type === 'select' ? (
              <select
                required={field.required}
                value={typeof customAnswers[field.key] === 'string' ? customAnswers[field.key] as string : ''}
                onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                style={publicInputStyle}
              >
                <option value="" disabled>請選擇</option>
                {(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : field.type === 'checkbox' ? (
              <div style={{ display: 'grid', gap: 8, fontWeight: 500 }}>
                {(field.options ?? []).map((opt) => {
                  const selected = selectedList(customAnswers[field.key]);
                  return (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={(e) => {
                          setCustomAnswers((prev) => {
                            const curr = selectedList(prev[field.key]);
                            const next = e.target.checked ? [...curr, opt] : curr.filter((x) => x !== opt);
                            return { ...prev, [field.key]: next };
                          });
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                required={field.required}
                value={typeof customAnswers[field.key] === 'string' ? customAnswers[field.key] as string : ''}
                onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                style={publicInputStyle}
              />
            )}
          </div>
        ))}

        {referrers.length > 0 && (
          <label style={publicLabelStyle}>
            <span>推薦人(選填)</span>
            <select value={referrerChoice} onChange={(e) => setReferrerChoice(e.target.value)} style={publicInputStyle}>
              <option value="">無 / 不指定</option>
              {referrers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              <option value={REFERRER_OTHER}>其他(自行填寫)</option>
            </select>
          </label>
        )}
        {referrerChoice === REFERRER_OTHER && (
          <label style={publicLabelStyle}>
            <span>請填寫推薦人姓名</span>
            <input value={referrerName} onChange={(e) => setReferrerName(e.target.value)} style={publicInputStyle} placeholder="推薦人姓名" />
          </label>
        )}

        {formError && <PublicMessage title={formError} tone="danger" />}

        <Button
          type="submit"
          variant="primary"
          disabled={submitting}
          style={{
            width: '100%',
            justifyContent: 'center',
            marginTop: 4,
            ...(accent ? { background: accent, borderColor: accent } : {}),
          }}
        >
          {submitting ? '送出中…' : '確認報名'}
        </Button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to={`/e/${slug}/ticket`} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          已經報名過?查詢我的票券
        </Link>
      </div>
    </PublicShell>
  );
}
