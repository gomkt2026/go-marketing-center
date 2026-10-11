import { FormEvent, useState } from 'react';
import { CONTACT_EMAIL, PublicFrame } from '@/pages/public/Landing';
import { LocalLink, useCopy, useLocale } from '@/pages/public/locale';

export function GoPosting() {
  const page = useCopy().posting;
  return (
    <PublicFrame title={page.title}>
      <section className="lp-hero">
        <div className="lp-wrap lp-price">
          <div>
            <div className="lp-eyebrow">{page.eyebrow}</div>
            <h1>{page.h1a}<br />{page.h1b}</h1>
            <p className="lp-lead">{page.lead}</p>
            <div className="lp-hero-cta">
              <a className="lp-btn" href="#inquiry">{page.cta}</a>
              <LocalLink className="lp-btn ghost" to="/proof">{page.proof}</LocalLink>
            </div>
          </div>
          <div className="lp-price-hero">
            <div className="lp-post-meta">{page.only}</div>
            <div className="lp-amount">999<small>{page.unit}</small></div>
            <p>{page.heroNote}</p>
          </div>
          <figure className="lp-poster" style={{ gridColumn: '1 / -1' }}>
            <img src="/site/go-posting-dm.jpg" alt={page.posterAlt} />
            {page.posterCaption && <figcaption>{page.posterCaption}</figcaption>}
          </figure>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.tableEyebrow}</div>
          <h2>{page.tableTitle}</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <tbody>
              {page.plan.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="lp-note" style={{ marginTop: 12 }}>{page.tableNote}</p>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>{page.includedTitle}</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <thead><tr><th>{page.includedHead[0]}</th><th>{page.includedHead[1]}</th></tr></thead>
            <tbody>
              {page.included.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ marginTop: 40 }}>{page.excludedTitle}</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <thead><tr><th>{page.excludedHead[0]}</th><th>{page.excludedHead[1]}</th></tr></thead>
            <tbody>
              {page.excluded.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lp-section" id="inquiry">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.startEyebrow}</div>
          <h2>{page.startTitle}</h2>
          <div className="lp-flow">
            {page.steps.map((step, i) => (
              <div key={step.title} className="lp-flow-item"><span>{i + 1}</span><b>{step.title}</b><small>{step.body}</small></div>
            ))}
          </div>
          <InquiryForm />
          <p className="lp-note">{page.contactNote(CONTACT_EMAIL)}</p>
        </div>
      </section>
    </PublicFrame>
  );
}

function InquiryForm() {
  const form = useCopy().inquiry;
  const { locale } = useLocale();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lineId, setLineId] = useState('');
  const [trade, setTrade] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr('');
    setDone('');
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, lineId, trade, message, website }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; duplicate?: boolean };
      if (!res.ok) throw new Error(locale === 'zh' ? (data.error || form.fail) : form.fail);
      setDone(data.duplicate ? form.duplicate : form.ok);
      setName('');
      setPhone('');
      setLineId('');
      setTrade('');
      setMessage('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : form.fail);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="lp-form" onSubmit={submit} style={{ marginTop: 28 }}>
      <label className="lp-hp" aria-hidden="true">
        {form.website}
        <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>
      <label>
        {form.name}
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" />
      </label>
      <label>
        {form.phone}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder={form.phonePlaceholder} maxLength={20} />
      </label>
      <label>
        {form.line}
        <input value={lineId} onChange={(e) => setLineId(e.target.value)} maxLength={40} placeholder={form.linePlaceholder} />
      </label>
      <label>
        {form.trade}
        <input value={trade} onChange={(e) => setTrade(e.target.value)} required maxLength={80} placeholder={form.tradePlaceholder} />
      </label>
      <label>
        {form.message}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={form.messagePlaceholder} />
      </label>
      {done && <p className="lp-form-msg ok">{done}</p>}
      {err && <p className="lp-form-msg bad">{err}</p>}
      <button className="lp-btn" type="submit" disabled={sending}>{sending ? form.sending : form.submit}</button>
    </form>
  );
}
