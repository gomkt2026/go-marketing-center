import { useEffect, useMemo, useState, type FormEvent } from 'react';

type HeatLevel = 'hot' | 'steady' | 'cool' | 'building';
type WishKind = 'feature' | 'bug' | 'cheer';

interface WeekDay {
  date: string;
  label: string;
  plays: number;
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

const KIND_LABEL: Record<WishKind, string> = {
  feature: '想要的功能',
  bug: '遇到的問題',
  cheer: '給師傅的話',
};

const MAP_LABEL = { s: '小地圖', m: '中地圖', l: '大地圖', t: '台灣地圖' } as const;

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function formatStay(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours).toLocaleString('en-US') : hours.toFixed(1)} 小時`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function GameWeek() {
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

  const maxPlays = Math.max(1, ...(data?.days ?? []).map((d) => d.plays));
  const heat = data?.heat;

  return (
    <section className="lp-section soft">
      <div className="lp-wrap">
        <div className="lp-eyebrow">近 7 天</div>
        <h2>每天更新的遊玩熱度</h2>
        <p className="lp-muted lp-sub">
          數字來自實際開局，以台北時間換日。畫面上只留最近一週，最舊的一天會在隔天離開。
          今天還在累積，熱度用昨天跟再前面幾天比較。
        </p>
        {failed && <p className="lp-muted">這一週的數字暫時讀不到。</p>}
        {!failed && !data && <p className="lp-muted">載入中…</p>}
        {data && (
          <>
            <div className={`lp-heat ${heat?.level ?? 'building'}`}>
              <div>
                <b>{heat?.label ?? '熱度累積中'}</b>
                <p>{heat?.detail} 今天已開局 {formatCount(data.today.plays)} 局，其中 {formatCount(data.today.completed)} 局跑完。</p>
              </div>
            </div>
            <div className="lp-week-cards">
              <div><b>{formatCount(data.totals.players)}</b><small>不重複玩家</small></div>
              <div><b>{formatCount(data.totals.plays)}</b><small>開局，跑完 {formatCount(data.totals.completed)}</small></div>
              <div><b>{formatStay(data.totals.minutes)}</b><small>累計停留</small></div>
              <div><b>{formatCount(data.totals.signups)}</b><small>留下手機上排行榜</small></div>
              <div><b>{formatCount(data.totals.referrals)}</b><small>朋友從邀請進來</small></div>
              <div><b>{formatCount(data.jobs.taskgo + data.jobs.homigo + data.jobs.washgo)}</b><small>遊戲裡完成的單</small></div>
            </div>
            {data.days.length > 0 && (
              <div className="lp-bars" aria-label="每日開局數">
                {data.days.map((d) => (
                  <div key={d.date} className={`lp-bar${d.partial ? ' today' : ''}`}>
                    <b>{formatCount(d.plays)}</b>
                    <i style={{ height: `${Math.max(6, Math.round((d.plays / maxPlays) * 120))}px` }} />
                    <small>{d.partial ? '今天' : d.label}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="lp-jobs">
              <span>TaskGo 報修 {formatCount(data.jobs.taskgo)}</span>
              <span>Homigo 送鑰匙 {formatCount(data.jobs.homigo)}</span>
              <span>Washgo 收送 {formatCount(data.jobs.washgo)}</span>
              {(Object.keys(MAP_LABEL) as (keyof typeof MAP_LABEL)[]).map((key) => (
                <span key={key}>{MAP_LABEL[key]} {formatCount(data.maps[key] ?? 0)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function WishBoard() {
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
        setMessage(data.error || '送出失敗，請稍後再試');
        return;
      }
      setBody('');
      setOk(true);
      setMessage('收到了。其他玩家也看得到，也可以按「我也想要」。');
      load();
    } catch {
      setMessage('送出失敗，請稍後再試');
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
        setMessage(data.error || '這個暫時按不了');
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
        <div className="lp-eyebrow">留言板</div>
        <h2>想要什麼新功能，留在這裡</h2>
        <p className="lp-muted lp-sub">
          玩完一局有想法，直接寫下來。可以是新地圖、新任務，或路上還想遇到的突發。暱稱可以不填。
        </p>
        <form className="lp-form" onSubmit={submit}>
          <div className="lp-kind-picks" role="group" aria-label="留言類型">
            {(Object.keys(KIND_LABEL) as WishKind[]).map((id) => (
              <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)}>{KIND_LABEL[id]}</button>
            ))}
          </div>
          <label>
            暱稱
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} placeholder="可不填，最多 12 字" />
          </label>
          <label>
            想說的話
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={180} required placeholder="例如：台灣地圖想多幾個夜市，垃圾車可以再快一點" />
          </label>
          <label className="lp-hp" aria-hidden="true">
            公司
            <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
          <button className="lp-btn" type="submit" disabled={sending}>{sending ? '送出中…' : '貼上留言板'}</button>
          {message && <p className={`lp-form-msg ${ok ? 'ok' : 'bad'}`}>{message}</p>}
        </form>
        <div className="lp-tabs" role="tablist" style={{ marginTop: 22, maxWidth: 280 }}>
          <button type="button" role="tab" aria-selected={sort === 'new'} onClick={() => setSort('new')}>最新</button>
          <button type="button" role="tab" aria-selected={sort === 'hot'} onClick={() => setSort('hot')}>最多人想要</button>
        </div>
        {!wishes && <p className="lp-muted">載入中…</p>}
        {wishes && shown.length === 0 && <p className="lp-muted">第一則想要的功能，等你來留。</p>}
        <div className="lp-wish-list">
          {shown.map((w) => (
            <article key={w.id} className="lp-wish">
              <div className="lp-wish-top">
                <span className="lp-kind">{KIND_LABEL[w.kind] ?? '想要的功能'}</span>
                <button
                  type="button"
                  className="lp-support"
                  aria-pressed={Boolean(supported[w.id])}
                  onClick={() => void support(w.id)}
                >
                  我也想要 {w.supports}
                </button>
              </div>
              <b>{w.nickname}</b>
              <p style={{ margin: 0, lineHeight: 1.7 }}>{w.body}</p>
              <small className="lp-muted">{formatWhen(w.createdAt)}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
