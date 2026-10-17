import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PublicFrame } from '@/pages/public/Landing';
import { LocalLink, useCopy, useLocale } from '@/pages/public/locale';
import {
  ALLIANCE_CREWS,
  crewBySlug,
  youtubeEmbedUrl,
  youtubePosterFallback,
  youtubePosterUrl,
  youtubeWatchUrl,
  type AllianceCrew,
} from '@/data/alliance-crews';

export function CrewDirectory() {
  const page = useCopy().crews;
  return (
    <PublicFrame title={page.title}>
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.eyebrow}</div>
          <h1>{page.title}</h1>
          <p className="lp-lead">{page.lead}</p>
          {page.langNote ? <p className="lp-muted">{page.langNote}</p> : null}
          <p><a className="lp-btn ghost" href="#shoot">{page.shoot.cta}</a></p>
          <div className="crew-grid">
            {ALLIANCE_CREWS.map((crew) => (
              <LocalLink key={crew.slug} to={`/crews/${crew.slug}`} className="crew-card">
                <YtPoster id={crew.youtubeId} alt="" />
                <div>
                  <span className="crew-trade">{crew.trade}</span>
                  <strong>{crew.name}</strong>
                  <em>{crew.person} · {crew.hook}</em>
                  {crew.area ? <small>{page.area}：{crew.area}</small> : null}
                </div>
              </LocalLink>
            ))}
          </div>
          <p className="lp-note">{page.disclaimer}</p>
          <CrewShootForm />
        </div>
      </section>
    </PublicFrame>
  );
}

export function CrewProfile() {
  const { slug } = useParams();
  const page = useCopy().crews;
  const crew = crewBySlug(slug);

  if (!crew) {
    return (
      <PublicFrame title={page.title}>
        <section className="lp-section">
          <div className="lp-wrap">
            <p>{page.missing} <LocalLink to="/crews">{page.back}</LocalLink></p>
          </div>
        </section>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame title={`${crew.name}｜${crew.person}`}>
      <section className="lp-section">
        <div className="lp-wrap">
          <LocalLink className="crew-back" to="/crews">{page.back}</LocalLink>
          <div className="lp-eyebrow">{page.eyebrow}</div>
          <div className="crew-profile">
            <div>
              <div className="crew-video">
                <iframe
                  src={youtubeEmbedUrl(crew.youtubeId)}
                  title={`${crew.name} ${crew.hook}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <a className="crew-yt" href={youtubeWatchUrl(crew.youtubeId)} target="_blank" rel="noreferrer">{page.openYoutube}</a>
            </div>
            <div>
              <span className="crew-trade">{crew.trade}</span>
              <h1>{crew.name}</h1>
              <p className="crew-person">{crew.person}</p>
              <p className="lp-lead">{crew.hook}</p>
              {crew.area ? <p><b>{page.area}</b>　{crew.area}</p> : null}
              <h2>{page.services}</h2>
              <ul className="crew-services">
                {crew.services.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h2>{page.story}</h2>
              {crew.story.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <p className="lp-note">{page.disclaimer}</p>
              <CrewLeadForm crew={crew} />
            </div>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}

function YtPoster({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState(youtubePosterUrl(id));
  return (
    <img
      src={src}
      alt={alt}
      onError={() => {
        if (src !== youtubePosterFallback(id)) setSrc(youtubePosterFallback(id));
      }}
    />
  );
}

function CrewShootForm() {
  const form = useCopy().crews.shoot;
  const { locale } = useLocale();
  const [crewName, setCrewName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lineId, setLineId] = useState('');
  const [trade, setTrade] = useState('');
  const [area, setArea] = useState('');
  const [message, setMessage] = useState('');
  const [alliance, setAlliance] = useState(false);
  const [consent, setConsent] = useState(false);
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
      const res = await fetch('/api/public/crew-video-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewName,
          name,
          phone,
          lineId,
          trade,
          area,
          message,
          allianceIntent: alliance,
          portraitConsent: consent,
          website,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; duplicate?: boolean };
      if (!res.ok) throw new Error(locale === 'zh' ? (data.error || form.fail) : form.fail);
      setDone(data.duplicate ? form.duplicate : form.ok);
      setCrewName('');
      setName('');
      setPhone('');
      setLineId('');
      setTrade('');
      setArea('');
      setMessage('');
      setAlliance(false);
      setConsent(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : form.fail);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="crew-shoot" id="shoot">
      <div className="lp-eyebrow">{form.eyebrow}</div>
      <h2>{form.title}</h2>
      <p className="lp-lead">{form.lead}</p>
      <form className="lp-form" onSubmit={submit}>
        <label className="lp-hp" aria-hidden="true">
          {form.website}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
        <label>
          {form.crew}
          <input value={crewName} onChange={(e) => setCrewName(e.target.value)} required maxLength={40} placeholder={form.crewPlaceholder} />
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
          <input value={lineId} onChange={(e) => setLineId(e.target.value)} maxLength={40} placeholder={form.linePlaceholder} autoComplete="off" />
        </label>
        <label>
          {form.trade}
          <input value={trade} onChange={(e) => setTrade(e.target.value)} required maxLength={80} placeholder={form.tradePlaceholder} />
        </label>
        <label>
          {form.area}
          <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder={form.areaPlaceholder} />
        </label>
        <label>
          {form.message}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={form.messagePlaceholder} />
        </label>
        <label className="crew-check">
          <input type="checkbox" checked={alliance} onChange={(e) => setAlliance(e.target.checked)} required />
          {form.alliance}
        </label>
        <p className="lp-note">{form.allianceNote}</p>
        <fieldset className="crew-consent">
          <legend>{form.consentTitle}</legend>
          <ol>
            {form.consentPoints.map((point) => <li key={point}>{point}</li>)}
          </ol>
          <label>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            {form.consent}
          </label>
          <p className="lp-note">{form.consentNote}</p>
        </fieldset>
        {done && <p className="lp-form-msg ok">{done}</p>}
        {err && <p className="lp-form-msg bad">{err}</p>}
        <button className="lp-btn" type="submit" disabled={sending}>{sending ? form.sending : form.submit}</button>
        <p className="lp-note">{form.note}</p>
      </form>
    </div>
  );
}

function CrewLeadForm({ crew }: { crew: AllianceCrew }) {
  const form = useCopy().crews.form;
  const handoff = useCopy().crews.handoff;
  const { locale } = useLocale();
  const [intent, setIntent] = useState<'customer' | 'partner'>('customer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lineId, setLineId] = useState('');
  const [need, setNeed] = useState('');
  const [place, setPlace] = useState('');
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
      const res = await fetch('/api/public/crew-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewSlug: crew.slug,
          intent,
          name,
          phone,
          lineId,
          need,
          place,
          message,
          website,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; duplicate?: boolean };
      if (!res.ok) throw new Error(locale === 'zh' ? (data.error || form.fail) : form.fail);
      setDone(data.duplicate ? form.duplicate : form.ok);
      setName('');
      setPhone('');
      setLineId('');
      setNeed('');
      setPlace('');
      setMessage('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : form.fail);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="lp-form" id="ask" onSubmit={submit}>
      <h2>{form.title(crew.name)}</h2>
      <label className="lp-hp" aria-hidden="true">
        {form.website}
        <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>
      <fieldset className="crew-intent">
        <legend>{form.intent}</legend>
        <label>
          <input type="radio" name="intent" checked={intent === 'customer'} onChange={() => setIntent('customer')} />
          {form.customer}
        </label>
        <label>
          <input type="radio" name="intent" checked={intent === 'partner'} onChange={() => setIntent('partner')} />
          {form.partner}
        </label>
      </fieldset>
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
        <input value={lineId} onChange={(e) => setLineId(e.target.value)} maxLength={40} placeholder={form.linePlaceholder} autoComplete="off" />
      </label>
      <label>
        {form.need}
        <input value={need} onChange={(e) => setNeed(e.target.value)} required maxLength={120} placeholder={form.needPlaceholder} />
      </label>
      <label>
        {form.place}
        <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} placeholder={form.placePlaceholder} />
      </label>
      <label>
        {form.message}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={form.messagePlaceholder} />
      </label>
      {done && <p className="lp-form-msg ok">{done}</p>}
      {err && <p className="lp-form-msg bad">{err}</p>}
      <button className="lp-btn" type="submit" disabled={sending}>{sending ? form.sending : form.submit}</button>
      <p className="lp-note">{handoff}</p>
    </form>
  );
}
