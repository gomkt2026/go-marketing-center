import { useEffect, useMemo, useState, type FormEvent } from 'react';

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

  const maxCumulative = Math.max(1, ...(data?.days ?? []).map((d) => d.cumulative || d.plays));
  const month = data?.month;

  return (
    <section className="lp-section soft">
      <div className="lp-wrap">
        <div className="lp-eyebrow">本月</div>
        <h2>這個月的累計還在往上加</h2>
        <p className="lp-muted lp-sub">
          數字來自實際開局，以台北時間換月。柱子是本月一天一天加總，所以只會越長越高。
          單日有人多有人少，看的是這個月整體。
        </p>
        {failed && <p className="lp-muted">這個月的數字暫時讀不到。</p>}
        {!failed && !data && <p className="lp-muted">載入中…</p>}
        {data && (
          <>
            <div className={`lp-heat ${month?.level ?? 'building'}`}>
              <div>
                <b>{month?.label ?? '本月累計還在往上加'}</b>
                <p>{month?.detail} 今天又加了 {formatCount(data.today.plays)} 局。</p>
              </div>
            </div>
            <div className="lp-week-cards">
              <div><b>{formatCount(data.totals.plays)}</b><small>本月累計開局</small></div>
              <div><b>{formatCount(data.totals.completed)}</b><small>本月跑完</small></div>
              <div><b>{formatCount(data.totals.players)}</b><small>本月不重複玩家</small></div>
              <div><b>{formatStay(data.totals.minutes)}</b><small>本月累計停留</small></div>
              <div><b>{formatCount(month?.previousPlays ?? 0)}</b><small>{month?.previousLabel ?? '上個月'}整月開局</small></div>
              <div><b>{formatCount(data.jobs.taskgo + data.jobs.homigo + data.jobs.washgo)}</b><small>本月遊戲裡完成的單</small></div>
            </div>
            {data.days.length > 0 && (
              <div className="lp-bars" aria-label="本月累計開局">
                {data.days.map((d) => {
                  const value = d.cumulative || d.plays;
                  return (
                    <div key={d.date} className={`lp-bar${d.partial ? ' today' : ''}`}>
                      <b>{formatCount(value)}</b>
                      <i style={{ height: `${Math.max(8, Math.round((value / maxCumulative) * 120))}px` }} />
                      <small>{d.partial ? '今天' : d.label}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="lp-muted">柱上的數字是加到當天的累計，不是當天單日。</p>
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

const TASKS = [
  { key: 'taskgo' as const, brand: 'TaskGo', color: '#ff6b1a', title: '報修派工', body: '騎到現場停一下，GPS 打卡、施工、拍照上傳。' },
  { key: 'homigo' as const, brand: 'Homigo', color: '#1fae78', title: '送鑰匙交屋', body: '把鑰匙送到新房客手上，燈一亮，這戶就算入住。' },
  { key: 'washgo' as const, brand: 'Washgo', color: '#3a8dde', title: '衣物收送', body: '沿路收衣服、送去洗，再送回客人手上。' },
];

const SCENES: { emoji: string; title: string; line: string }[] = [
  { emoji: '🐕', title: '野狗追車', line: '被土狗包圍，師傅當場投降' },
  { emoji: '🚓', title: '警察臨檢', line: '停車受檢有獎金，闖過去就罰單' },
  { emoji: '🚛', title: '垃圾車來了', line: '給愛麗絲一響，全巷子都在跑' },
  { emoji: '🧋', title: '手搖飲', line: '喝一杯，全速衝刺幾秒' },
  { emoji: '🐔', title: '雞群過馬路', line: '一群雞霸佔馬路，全部的車都在等' },
  { emoji: '🐈', title: '貓咪卡在車底', line: '全城最重要的任務：把貓救出來' },
  { emoji: '🚚', title: '選舉造勢', line: '車隊佔住整條路，師傅被塞了一份傳單' },
  { emoji: '🥁', title: '廟會遶境', line: '鞭炮陣頭經過，順便求個收工平安' },
  { emoji: '💒', title: '婚禮車隊', line: '跟在後面，有機會拿到喜糖' },
  { emoji: '🛵', title: '外送大軍', line: '商圈尖峰，師傅被擠成夾心' },
  { emoji: '🌧️', title: '突然暴雨', line: '出門還是大太陽，騎到一半天空變黑' },
  { emoji: '🕳️', title: '巨大坑洞', line: '全速撞進去，工具箱差點飛出去' },
  { emoji: '🚧', title: '前方施工', line: '導航說直走，結果直接撞上圍籬' },
  { emoji: '🚑', title: '救護車', line: '讓道有獎金，擋住就扣分' },
  { emoji: '🏫', title: '學校放學', line: '學生和家長擠滿路口，騎慢一點' },
];

export function GameScenes() {
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
        <div className="lp-eyebrow">這一班會遇到</div>
        <h2>任務和路上的突發，每一局都不一樣</h2>
        <p className="lp-muted lp-sub">
          90 秒裡要接三種單，路上還會隨機冒出台灣日常。下面是玩家收工時會截到的畫面，進遊戲才撞得到下一張。
        </p>
        <div className="lp-scene-photos">
          <figure>
            <img src="/site/jiangcheng-incidents.jpg" alt="匠城出任務的隨機突發：野狗追車、警察臨檢、垃圾車、油箱見底、手搖飲。" />
            <figcaption>野狗、臨檢、垃圾車、加油、手搖。這些是每一班都可能遇上的日常。</figcaption>
          </figure>
          <figure>
            <img src="/site/jiangcheng-moments.jpg" alt="匠城出名場面截圖：土狗包圍、高雄下雪還在送洗衣、垃圾車一響全巷子在跑，以及車庫裡的四台機車。" />
            <figcaption>收工會自動截一張名場面。土狗、送洗、垃圾車，還能換成自己的車。</figcaption>
          </figure>
        </div>
        <div className="lp-task-grid">
          {TASKS.map((task) => (
            <article key={task.key} className="lp-task" style={{ ['--c' as string]: task.color }}>
              <b>{task.brand}・{task.title}</b>
              <p>{task.body}</p>
              <strong>{jobs ? `${formatCount(jobs[task.key])} 次` : '…'}</strong>
              <small className="lp-muted">這個月玩家完成</small>
            </article>
          ))}
        </div>
        <div className="lp-scene-grid">
          {SCENES.map((scene) => (
            <a key={scene.title} className="lp-scene" href="#play">
              <b>{scene.emoji} {scene.title}</b>
              <span>{scene.line}</span>
            </a>
          ))}
        </div>
        <p className="lp-muted" style={{ marginTop: 14 }}>
          還有消防車、吊車、公車拋錨、街頭拍 MV、臨時市集、道路積水、倒樹。共 21 種隨機路況，玩一局才知道今天撞見哪一種。
        </p>
        <div className="lp-hero-cta">
          <a className="lp-btn" href="#play">進遊戲跑一班</a>
        </div>
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
