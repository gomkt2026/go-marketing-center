import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { taipeiMonth, useCopy, useFormat, useLocale } from '@/pages/public/locale';

type HeatLevel = 'hot' | 'steady' | 'cool' | 'building';
type WishKind = 'feature' | 'bug' | 'cheer';

interface WeekDay {
  date: string;
  label: string;
  plays: number;
  cumulative: number;
  completed: number;
  players: number;
  minutes: number;
  partial: boolean;
}

interface WeekPulse {
  days: WeekDay[];
  totals: {
    plays: number;
    completed: number;
    players: number;
    minutes: number;
    signups: number;
    referrals: number;
  };
  today: { plays: number; completed: number };
  month: { level: 'steady' | 'building'; label: string; detail: string; previousLabel: string; previousPlays: number };
  heat: { level: HeatLevel; label: string; detail: string };
  jobs: { taskgo: number; homigo: number; washgo: number };
  maps: { s: number; m: number; l: number; t: number };
}

interface Wish {
  id: string;
  nickname: string;
  body: string;
  kind: WishKind;
  supports: number;
  createdAt: string;
}

const SCENE_EMOJI = ['🐕', '🚓', '🚛', '🧋', '🐔', '🐈', '🚚', '🥁', '💒', '🛵', '🌧️', '🕳️', '🚧', '🚑', '🏫'];

const TASK_META = [
  { key: 'taskgo' as const, brand: 'TaskGo', color: '#ff6b1a' },
  { key: 'homigo' as const, brand: 'Homigo', color: '#1fae78' },
  { key: 'washgo' as const, brand: 'Washgo', color: '#3a8dde' },
];

export function GameWeek() {
  const copy = useCopy();
  const text = copy.week;
  const { locale } = useLocale();
  const format = useFormat();
  const [data, setData] = useState<WeekPulse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/game/week')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: WeekPulse) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const maxCumulative = Math.max(1, ...(data?.days ?? []).map((d) => d.cumulative || d.plays));
  const month = data?.month;
  const story = data && locale !== 'zh'
    ? text.story({
      level: month?.level ?? 'building',
      month: taipeiMonth(data.days[0]?.date),
      dayCount: data.days.length,
      current: format.n(data.totals.plays),
      previous: format.n(month?.previousPlays ?? 0),
      previousPlays: month?.previousPlays ?? 0,
      today: format.n(data.today.plays),
    })
    : null;

  return (
    <section className="lp-section soft">
      <div className="lp-wrap">
        <div className="lp-eyebrow">{text.eyebrow}</div>
        <h2>{text.title}</h2>
        <p className="lp-muted lp-sub">{text.sub}</p>
        {failed && <p className="lp-muted">{text.fail}</p>}
        {!failed && !data && <p className="lp-muted">{copy.common.loading}</p>}
        {data && (
          <>
            <div className={`lp-heat ${month?.level ?? 'building'}`}>
              <div>
                <b>{story ? story.label : (month?.label ?? text.fallbackLabel)}</b>
                <p>
                  {story
                    ? story.detail
                    : <>{month?.detail}{text.todayAdded(format.n(data.today.plays))}</>}
                </p>
              </div>
            </div>
            <div className="lp-week-cards">
              <div><b>{format.n(data.totals.plays)}</b><small>{text.plays}</small></div>
              <div><b>{format.n(data.totals.completed)}</b><small>{text.done}</small></div>
              <div><b>{format.n(data.totals.players)}</b><small>{text.players}</small></div>
              <div><b>{text.stay(data.totals.minutes)}</b><small>{text.stayLabel}</small></div>
              <div><b>{format.n(month?.previousPlays ?? 0)}</b><small>{text.previousMonthRuns(story ? story.previousLabel : (month?.previousLabel ?? text.previousFallback))}</small></div>
              <div><b>{format.n(data.jobs.taskgo + data.jobs.homigo + data.jobs.washgo)}</b><small>{text.jobs}</small></div>
            </div>
            {data.days.length > 0 && (
              <div className="lp-bars" aria-label={text.barsAria}>
                {data.days.map((d) => {
                  const value = d.cumulative || d.plays;
                  return (
                    <div key={d.date} className={`lp-bar${d.partial ? ' today' : ''}`}>
                      <b>{format.n(value)}</b>
                      <i style={{ height: `${Math.max(8, Math.round((value / maxCumulative) * 120))}px` }} />
                      <small>{d.partial ? text.today : d.label}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="lp-muted">{text.cumulativeNote}</p>
            <div className="lp-jobs">
              <span>{text.jobTaskgo(format.n(data.jobs.taskgo))}</span>
              <span>{text.jobHomigo(format.n(data.jobs.homigo))}</span>
              <span>{text.jobWashgo(format.n(data.jobs.washgo))}</span>
              {(Object.keys(copy.map) as (keyof typeof copy.map)[]).map((key) => (
                <span key={key}>{copy.map[key]} {format.n(data.maps[key] ?? 0)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function GameScenes() {
  const copy = useCopy();
  const text = copy.scenes;
  const format = useFormat();
  const [jobs, setJobs] = useState<{ taskgo: number; homigo: number; washgo: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/game/week')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeekPulse | null) => { if (alive && d) setJobs(d.jobs); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <div className="lp-eyebrow">{text.eyebrow}</div>
        <h2>{text.title}</h2>
        <p className="lp-muted lp-sub">{text.sub}</p>
        <div className="lp-scene-photos">
          <figure>
            <img src="/site/jiangcheng-incidents.jpg" alt={text.incidentsAlt} />
            <figcaption>{text.incidentsCaption}</figcaption>
          </figure>
          <figure>
            <img src="/site/jiangcheng-moments.jpg" alt={text.momentsAlt} />
            <figcaption>{text.momentsCaption}</figcaption>
          </figure>
        </div>
        <div className="lp-task-grid">
          {TASK_META.map((task, i) => (
            <article key={task.key} className="lp-task" style={{ ['--c' as string]: task.color }}>
              <b>{task.brand}・{text.tasks[i].title}</b>
              <p>{text.tasks[i].body}</p>
              <strong>{jobs ? text.times(format.n(jobs[task.key])) : '…'}</strong>
              <small className="lp-muted">{text.doneLabel}</small>
            </article>
          ))}
        </div>
        <div className="lp-scene-grid">
          {text.items.map((scene, i) => (
            <a key={scene.title} className="lp-scene" href="#play">
              <b>{SCENE_EMOJI[i]} {scene.title}</b>
              <span>{scene.line}</span>
            </a>
          ))}
        </div>
        <p className="lp-muted" style={{ marginTop: 14 }}>{text.more}</p>
        <div className="lp-hero-cta">
          <a className="lp-btn" href="#play">{text.cta}</a>
        </div>
      </div>
    </section>
  );
}

export function WishBoard() {
  const copy = useCopy();
  const text = copy.wishes;
  const { locale } = useLocale();
  const format = useFormat();
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [kind, setKind] = useState<WishKind>('feature');
  const [nickname, setNickname] = useState('');
  const [body, setBody] = useState('');
  const [company, setCompany] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [supported, setSupported] = useState<Record<string, boolean>>({});

  function load() {
    fetch('/api/public/game/wishes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { wishes: Wish[] } | null) => { setWishes(d?.wishes ?? []); })
      .catch(() => { setWishes([]); });
  }

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const rows = [...(wishes ?? [])];
    if (sort === 'hot') rows.sort((a, b) => b.supports - a.supports || b.createdAt.localeCompare(a.createdAt));
    return rows;
  }, [wishes, sort]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage('');
    setOk(false);
    try {
      const res = await fetch('/api/public/game/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, body, kind, company }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setMessage(locale === 'zh' ? (data.error || text.fail) : text.fail);
        return;
      }
      setBody('');
      setOk(true);
      setMessage(text.ok);
      load();
    } catch {
      setMessage(text.fail);
    } finally {
      setSending(false);
    }
  }

  async function support(id: string) {
    if (supported[id]) return;
    setSupported((prev) => ({ ...prev, [id]: true }));
    setWishes((prev) => prev?.map((w) => (w.id === id ? { ...w, supports: w.supports + 1 } : w)) ?? prev);
    try {
      const res = await fetch(`/api/public/game/wishes/${id}/support`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { supports?: number; error?: string };
      if (!res.ok) {
        setSupported((prev) => ({ ...prev, [id]: false }));
        setWishes((prev) => prev?.map((w) => (w.id === id ? { ...w, supports: Math.max(0, w.supports - 1) } : w)) ?? prev);
        setOk(false);
        setMessage(locale === 'zh' ? (data.error || text.cannotSupport) : text.cannotSupport);
        return;
      }
      if (typeof data.supports === 'number') {
        setWishes((prev) => prev?.map((w) => (w.id === id ? { ...w, supports: data.supports! } : w)) ?? prev);
      }
    } catch {
      setSupported((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <div className="lp-eyebrow">{text.eyebrow}</div>
        <h2>{text.title}</h2>
        <p className="lp-muted lp-sub">{text.sub}</p>
        <form className="lp-form" onSubmit={submit}>
          <div className="lp-kind-picks" role="group" aria-label={text.kindGroup}>
            {(Object.keys(text.kinds) as WishKind[]).map((id) => (
              <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)}>{text.kinds[id]}</button>
            ))}
          </div>
          <label>
            {text.nickname}
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} placeholder={text.nicknamePlaceholder} />
          </label>
          <label>
            {text.body}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={180} required placeholder={text.bodyPlaceholder} />
          </label>
          <label className="lp-hp" aria-hidden="true">
            {text.company}
            <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
          <button className="lp-btn" type="submit" disabled={sending}>{sending ? text.sending : text.submit}</button>
          {message && <p className={`lp-form-msg ${ok ? 'ok' : 'bad'}`}>{message}</p>}
        </form>
        <div className="lp-tabs" role="tablist" style={{ marginTop: 22, maxWidth: 280 }}>
          <button type="button" role="tab" aria-selected={sort === 'new'} onClick={() => setSort('new')}>{text.newest}</button>
          <button type="button" role="tab" aria-selected={sort === 'hot'} onClick={() => setSort('hot')}>{text.hottest}</button>
        </div>
        {!wishes && <p className="lp-muted">{copy.common.loading}</p>}
        {wishes && shown.length === 0 && <p className="lp-muted">{text.empty}</p>}
        <div className="lp-wish-list">
          {shown.map((w) => (
            <article key={w.id} className="lp-wish">
              <div className="lp-wish-top">
                <span className="lp-kind">{text.kinds[w.kind] ?? text.kinds.feature}</span>
                <button
                  type="button"
                  className="lp-support"
                  aria-pressed={Boolean(supported[w.id])}
                  onClick={() => void support(w.id)}
                >
                  {text.support(w.supports)}
                </button>
              </div>
              <b>{w.nickname}</b>
              <p style={{ margin: 0, lineHeight: 1.7 }}>{w.body}</p>
              <small className="lp-muted">{format.when(w.createdAt)}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
