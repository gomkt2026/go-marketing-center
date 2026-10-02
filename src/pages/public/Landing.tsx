import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export const CONTACT_EMAIL = 'service@inforcraft.com.tw';

const NAV = [
  { to: '/welcome', label: '首頁' },
  { to: '/go-posting', label: 'Go幫你發文' },
  { to: '/proof', label: '品牌成果' },
  { to: '/show', label: 'Podcast' },
  { to: '/jiangcheng', label: '遊戲' },
  { to: '/center', label: '怎麼運作' },
];

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  phoneMasked: string;
  score: number;
}

interface GameSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  prize: string;
  topN: number;
  prizeMap: GameMap;
}

type GameMap = 's' | 'm' | 'l' | 't';
const MAP_LABELS: Record<GameMap, string> = { s: '小地圖', m: '中地圖', l: '大地圖', t: '台灣地圖' };

interface GameStats {
  live: { count: number; players: { name: string; score: number; seconds: number }[] };
  totals: { plays: number; minutes: number; players: number };
  topPlayers: { nickname: string; phoneMasked: string; plays: number; minutes: number }[];
}

interface LeaderboardResponse {
  map: GameMap;
  season: GameSeason | null;
  entries: LeaderboardEntry[];
}

export const BRANDS = [
  {
    slug: 'taskgo',
    name: 'TaskGo 匠管',
    color: '#ff6b1a',
    logo: '/brands/taskgo-logo.png',
    editor: '/brands/taskgo-ahao.png',
    editorName: '阿豪',
    tagline: '讓工程專案管理更簡單、更智能',
    body: '給工班、統包與修繕團隊的案場管理系統。報修派工、場勘報價、施工照回報、請款結案都在同一條工單上，現場師傅用 LINE 就能接收通知。',
    cta: { label: '免費試用 14 天', url: 'https://app.taskgo.com.tw/register' },
  },
  {
    slug: 'homigo',
    name: 'Homigo',
    color: '#1fae78',
    logo: '/brands/homigo-logo.png',
    editor: '/brands/homigo-xiaomi.png',
    editorName: '小咪',
    tagline: '不是管理房子，而是讓房子自己運作',
    body: '給房東與包租代管的租務平台。物件上架、看房、簽約交屋、收租提醒、房客報修，都能透過 LINE 與房客即時串起來。',
    cta: { label: '免費開始，不綁信用卡', url: 'https://www.homigo.com.tw' },
  },
  {
    slug: 'washgo',
    name: 'Washgo',
    color: '#3a8dde',
    logo: '/brands/washgo-logo.png',
    editor: '/brands/washgo-ale.png',
    editorName: '阿樂',
    tagline: '衣物送洗，交給 Washgo',
    body: '給洗衣店與消費者的收送洗服務。LINE 下單、到府收件、洗護進度通知、送回簽收，讓洗衣店不用另外做 App 也能接線上訂單。',
    cta: { label: '前往 Washgo 官網', url: 'https://washgo.com.tw' },
  },
];

export const MODULES = [
  { title: '品牌工作台', body: '每個品牌一個儀表板：待審內容、今日發布、成效摘要與待辦一眼看完。' },
  { title: '內容中心與審閱', body: 'AI 依品牌規範產出文案與配圖，經過核准、修改、退回、延期等審閱流程才發布，每一版都留紀錄。' },
  { title: '一鍵多平台發布', body: 'Threads、Facebook、Instagram 走官方 API 直接發布，官網 SEO 長文也能推到各品牌部落格。' },
  { title: '行程表與最佳時段', body: '跨品牌發文行程表，依歷史互動數據建議每個平台的發文時段。' },
  { title: 'AI 小編團隊', body: '阿豪、小咪、阿樂各有口吻與品牌知識，負責日常貼文、Threads 回覆與社群互動。' },
  { title: '品牌智慧庫', body: '品牌定位、語氣規範、產品資料與素材圖庫集中管理，所有 AI 產出都以此為準。' },
  { title: '市場情報與趨勢', body: '蒐集產業新聞、政策與熱門話題，自動標出與品牌相關的訊號，轉成內容題材。' },
  { title: 'SEO / GEO', body: '規劃關鍵字與長文主題，並針對 AI 搜尋引擎優化品牌被引用的機會。' },
  { title: '客服知識庫', body: '產品說明文件轉成可嵌入官網的客服小工具，常見問題由 AI 先回答。' },
  { title: 'Podcast 與短影音', body: 'Podcast 集數管理、剪成 9:16 短影音、燒錄字幕與配音，延伸成社群素材。' },
  { title: '活動報名與報到', body: '活動頁、線上報名、QR Code 電子票與現場掃碼報到一次完成。' },
  { title: '會議、決策與協作', body: '會議紀錄 AI 摘要、決策追蹤、跨品牌合作排程，讓團隊知道誰在做什麼。' },
  { title: '成效分析與學習', body: '彙整各平台互動數據，找出表現好的題材與格式，回饋到下一輪內容生成。' },
];

export const PRESS = [
  {
    brand: 'taskgo',
    date: '2025/10/20',
    title: '數位工具平民化 匠管 Task Go 助攻工班資訊透明',
    note: '師傅用手機拍照、語音回報，施工紀錄不再靠紙本。',
    url: 'https://money.udn.com/money/story/5635/9082541',
  },
  {
    brand: 'homigo',
    date: '2026/07/01',
    title: '匠管攜手達觀跨足 PropTech 市場 推出 Homigo 智慧租屋管理平台',
    note: '從 TaskGo 的工單經驗延伸到租屋管理，房東房客用 LINE 就能報修。',
    url: 'https://money.udn.com/money/story/5635/9726282',
  },
  {
    brand: 'washgo',
    date: '2026/09/16',
    title: '傳統洗衣店也拚 AI 數位轉型！匠管 Washgo 中部落地、開放品牌加入',
    note: '收件、品管、收送串成一條流程，已在中部洗衣店實際上線。',
    url: 'https://money.udn.com/money/story/5635/9756429',
  },
];

export const PODCAST = {
  page: 'https://player.soundon.fm/p/e70c6ec4-699d-4972-a735-88447eaa2d09',
  feeds: [
    { label: 'SoundOn 訂閱', url: 'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09.xml' },
    { label: 'YouTube 訂閱', url: 'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09/yt.xml' },
    { label: 'Spotify 訂閱', url: 'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09/spotify.xml' },
  ],
};

export const INTEGRATIONS = [
  {
    brand: 'taskgo',
    title: 'TaskGo 結案報告：匠城呈現',
    body: '修繕案結案後，系統把派工、到場、施工、驗收變成一段匠城出任務動畫，業主點開就看得懂這次修了什麼。',
    url: 'https://dev.taskgo.com.tw/project-case-report/6cMnEQRUbnwau4fRTYFL8oJ1tapbNrinlC_wXn0ykfGnohTfYgooXqBb9RZN17Gd/play',
  },
  {
    brand: 'washgo',
    title: 'Washgo 洗滌追蹤：匠城呈現',
    body: '客人查送洗進度時，收件、洗護、品管、送回會以匠城動畫一路播完，等衣服的時間也有東西看。',
    url: 'https://washgo-liff.pages.dev/track/4e3271fc4a/play',
  },
];

/** 遊戲截圖放在 public/game/shots/。截圖不可出現真實姓名、電話或地址。 */
export const GAME_SHOTS: { src: string; caption: string }[] = [];

const PLATFORM_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' };

interface ShowcasePost {
  brandSlug: string;
  platform: string;
  publishedAt: string | null;
  title: string;
  excerpt: string;
  permalink: string | null;
}

interface ShowcaseEpisode {
  title: string;
  publishedAt: string | null;
  summary: string;
  url: string | null;
}

function useJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: T | null) => { if (alive && d) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return data;
}

export function brandOf(slug: string) {
  return BRANDS.find((b) => b.slug === slug)!;
}

export function BrandPosts() {
  const data = useJson<{ posts: ShowcasePost[] }>('/api/public/showcase/posts');
  return (
    <div className="lp-brands">
      {BRANDS.map((b) => {
        const post = data?.posts.find((p) => p.brandSlug === b.slug);
        return (
          <article key={b.slug} className="lp-post" style={{ ['--c' as string]: b.color }}>
            <header>
              <img src={b.editor} alt={b.editorName} />
              <div>
                <b>{b.name}</b>
                <small>AI 小編 {b.editorName}</small>
              </div>
            </header>
            {post ? (
              <>
                <div className="lp-post-meta">
                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                  {post.publishedAt ? `・${formatDate(post.publishedAt)}` : ''}
                </div>
                {post.title && <h3>{post.title}</h3>}
                <p>{post.excerpt}</p>
                {post.permalink && (
                  <a className="lp-link" href={post.permalink} target="_blank" rel="noopener">看這則貼文</a>
                )}
              </>
            ) : (
              <p className="lp-muted">{data ? '最近一則貼文準備中。' : '載入中…'}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function PodcastBlock() {
  const data = useJson<{ episode: ShowcaseEpisode | null }>('/api/public/showcase/podcast');
  const ep = data?.episode;
  return (
    <div className="lp-podcast">
      <a href={PODCAST.page} target="_blank" rel="noopener" className="lp-podcast-cover">
        <img src="/podcast/cover.jpg" alt="GO三小編熱聊：阿豪、小咪、阿樂" loading="lazy" />
      </a>
      <div className="lp-podcast-body">
        <h3>GO三小編熱聊</h3>
        <p className="lp-muted">
          工班出身的阿豪、包租管家小咪、洗衣店店員阿樂，每週聊工地、租屋、洗衣的熱門話題。
          三個人的聲音、腳本與上架都由行銷中心產出。
        </p>
        {ep && (
          <div className="lp-episode">
            <div className="lp-post-meta">最新一集{ep.publishedAt ? `・${formatDate(ep.publishedAt)}` : ''}</div>
            <b>{ep.title}</b>
            <p>{ep.summary}</p>
            {ep.url && <a className="lp-link" href={ep.url} target="_blank" rel="noopener">收聽這一集</a>}
          </div>
        )}
        <div className="lp-hero-cta">
          <a className="lp-btn" href={PODCAST.page} target="_blank" rel="noopener">到 SoundOn 收聽</a>
        </div>
        <div className="lp-feeds">
          {PODCAST.feeds.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener">{f.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}

export const FLOW = [
  { step: '1', title: '蒐集', body: '市場情報、品牌知識、過往成效' },
  { step: '2', title: '生成', body: 'AI 小編依品牌口吻產文案與圖' },
  { step: '3', title: '審閱', body: '人工核准、修改或退回' },
  { step: '4', title: '發布', body: '社群與官網排程或一鍵發布' },
  { step: '5', title: '學習', body: '成效回流，下一篇更準' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatStay(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [tab, setTab] = useState<'rank' | 'live' | 'loyal'>('rank');

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/public/game/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GameStats | null) => { if (alive && d) setStats(d); })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, 20000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    const get = (map?: GameMap) => fetch(`/api/public/game/leaderboard?limit=10${map ? `&map=${map}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))) as Promise<LeaderboardResponse>;
    get()
      .then((d) => (d.season && d.season.prizeMap !== d.map ? get(d.season.prizeMap) : d))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const season = data?.season;
  return (
    <div className="lp-board">
      <div className="lp-board-head">
        <div className="lp-eyebrow">排行榜・{MAP_LABELS[data?.map ?? 's']}</div>
        <h3>{season ? season.name : '全站排行'}</h3>
        {season && (
          <p className="lp-muted">
            活動期間 {formatDate(season.startsAt)} – {formatDate(season.endsAt)}，{MAP_LABELS[season.prizeMap]}前 {season.topN} 名可獲獎
          </p>
        )}
      </div>
      {stats && (
        <div className="lp-stats">
          <div><b className="lp-live">{stats.live.count}</b><small>正在上工</small></div>
          <div><b>{stats.totals.plays.toLocaleString('en-US')}</b><small>累計遊玩（局）</small></div>
          <div><b>{stats.totals.minutes.toLocaleString('en-US')}</b><small>累計上工（分鐘）</small></div>
          <div><b>{stats.totals.players.toLocaleString('en-US')}</b><small>玩家人數</small></div>
        </div>
      )}
      <div className="lp-tabs" role="tablist">
        {([['rank', '排行榜'], ['live', '正在玩'], ['loyal', '最常上工']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {season?.prize && tab === 'rank' && <div className="lp-prize">{season.prize}</div>}
      {tab === 'rank' && failed && <p className="lp-muted">排行榜暫時載入失敗，請稍後再試。</p>}
      {tab === 'rank' && !failed && !data && <p className="lp-muted">載入中…</p>}
      {tab === 'rank' && data && data.entries.length === 0 && <p className="lp-muted">還沒有人上榜，第一名等你來拿。</p>}
      {tab === 'rank' && data && data.entries.length > 0 && (
        <ol className="lp-rank">
          {data.entries.map((e) => (
            <li key={`${e.rank}-${e.nickname}`}>
              <span className={`lp-rank-no${e.rank <= 3 ? ' top' : ''}`}>{e.rank}</span>
              <span className="lp-rank-name">
                {e.nickname}
                <small>{e.phoneMasked}</small>
              </span>
              <span className="lp-rank-score">NT$ {e.score.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === 'live' && (
        (stats?.live.players.length ?? 0) === 0
          ? <p className="lp-muted">現在沒有人在跑單。</p>
          : (
            <ol className="lp-rank">
              {stats!.live.players.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span className={`lp-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                  <span className="lp-rank-name">{p.name}<small>已上工 {formatStay(p.seconds)}</small></span>
                  <span className="lp-rank-score">NT$ {p.score.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
          )
      )}
      {tab === 'loyal' && (
        (stats?.topPlayers.length ?? 0) === 0
          ? <p className="lp-muted">還沒有常客。玩完送出成績後會出現在這裡。</p>
          : (
            <ol className="lp-rank">
              {stats!.topPlayers.map((p, i) => (
                <li key={p.phoneMasked}>
                  <span className={`lp-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                  <span className="lp-rank-name">{p.nickname}<small>{p.phoneMasked}・{p.minutes} 分鐘</small></span>
                  <span className="lp-rank-score">{p.plays} 局</span>
                </li>
              ))}
            </ol>
          )
      )}
      <a className="lp-link" href="/legal/game-rules/">活動辦法與領獎方式</a>
    </div>
  );
}

export function GameFrame() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-game">
      {playing ? (
        <iframe
          src="/game/index.html?embed=1"
          title="匠城出任務"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="lp-game-cover" onClick={() => setPlaying(true)}>
          <img src="/game/og-image.jpg?v=0930" alt="匠城出任務遊戲畫面" loading="lazy" />
          <span className="lp-play">開始遊戲</span>
        </button>
      )}
      <div className="lp-game-actions">
        <a className="lp-btn ghost" href="/game/index.html" target="_blank" rel="noopener">全螢幕開啟</a>
        <span className="lp-muted">手機直接點「全螢幕開啟」操作最順</span>
      </div>
    </div>
  );
}

const HOME_PAGES = [
  { to: '/go-posting', title: 'Go 幫你發文', body: '工班不用自己顧粉專。每週兩則，一個月 999。', cta: '看價格表' },
  { to: '/proof', title: '三品牌發文與報導', body: '阿豪、小咪、阿樂各一則最新貼文，加上經濟日報三篇。', cta: '看成果' },
  { to: '/show', title: '三小編熱聊', body: '同一套中心做出的 Podcast，SoundOn、YouTube、Spotify 都能聽。', cta: '去收聽' },
  { to: '/jiangcheng', title: '匠城出任務', body: '收工後跑一班。遊戲也接進 TaskGo 結案報告和 Washgo 洗滌追蹤。', cta: '玩一局' },
  { to: '/center', title: '行銷中心怎麼跑', body: '題材、生成、審閱、發布、學習。工班看到的貼文都從這裡出來。', cta: '看流程' },
];

export function Landing() {
  return (
    <PublicFrame title="匠管的 AI 行銷中心">
      <section id="top" className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div>
            <div className="lp-eyebrow">GO Marketing Center</div>
            <h1>匠管為三個品牌<br />打造的 AI 行銷中心</h1>
            <p className="lp-lead">
              匠管同時經營 TaskGo、Homigo、Washgo，人手不可能每天顧三組粉專。
              所以我們做了 GO 行銷中心：它會自己在 Facebook、Instagram、Threads 發文，
              三位小編阿豪、小咪、阿樂各有固定人設與口吻，還能自己錄 Podcast。
            </p>
            <p className="lp-lead">
              我們也做了小遊戲「匠城出任務」讓師傅收工後舒壓，並把它接進 TaskGo 與 Washgo 系統裡。
            </p>
            <div className="lp-hero-cta">
              <a className="lp-btn" href="#game">直接玩匠城出任務</a>
              <Link className="lp-btn ghost" to="/go-posting">每週兩篇，一個月 999</Link>
            </div>
          </div>
          <div className="lp-hero-art">
            {BRANDS.map((b) => (
              <div key={b.slug} className="lp-hero-chip" style={{ borderColor: b.color }}>
                <img src={b.editor} alt={b.editorName} />
                <div>
                  <b style={{ color: b.color }}>{b.name}</b>
                  <small>AI 小編 {b.editorName}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="game" className="lp-section game">
        <div className="lp-wrap">
          <div className="lp-eyebrow">先玩一局</div>
          <h2>匠城出任務</h2>
          <p className="lp-muted lp-sub">
            騎車接 TaskGo 報修、Homigo 送鑰匙、Washgo 收衣服。90 秒就能開跑，不用註冊。
            想全螢幕玩，直接開遊戲頁。
          </p>
          <div className="lp-game-grid">
            <GameFrame />
            <Leaderboard />
          </div>
          <div className="lp-hero-cta">
            <a className="lp-btn" href="/game/index.html" target="_blank" rel="noopener">開啟完整遊戲</a>
            <Link className="lp-btn ghost" to="/jiangcheng">地圖、排行榜與系統裡的匠城呈現</Link>
          </div>
        </div>
      </section>

      <section id="posts" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">品牌發文</div>
          <h2>三位 AI 小編，各自顧一個品牌</h2>
          <p className="lp-muted lp-sub">每個品牌只放最新發出去的一則，內容由小編依品牌口吻產出、團隊審過才上線。</p>
          <BrandPosts />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <div className="lp-eyebrow">給工班的方案</div>
          <h2>Go 幫你發文，只收 999／月</h2>
          <p className="lp-muted lp-sub">同一套會自己發文的中心，現在可以幫工班、店家每週寫兩則。不是另外一套系統的月費。</p>
          <div className="lp-price">
            <div className="lp-price-hero">
              <div className="lp-post-meta">每週 2 則 · Facebook、Instagram、Threads</div>
              <div className="lp-amount">999<small> 元／月</small></div>
              <p className="lp-muted">AI 小編撰寫，發布前有人看過才上線。沒有第二種方案。</p>
              <Link className="lp-btn" to="/go-posting">看完整價格表</Link>
            </div>
            <div>
              <p className="lp-muted">這套中心先拿來經營匠管自己的三個品牌。工班可以先看成果，再決定要不要讓 Go 幫你發。</p>
              <div className="lp-hero-cta">
                <Link className="lp-btn ghost" to="/proof">看三品牌最新發文</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">分頁看</div>
          <h2>每一塊都可以單獨看完</h2>
          <div className="lp-pages" style={{ marginTop: 28 }}>
            {HOME_PAGES.map((p) => (
              <Link key={p.to} className="lp-page-card" to={p.to}>
                <b>{p.title}</b>
                <p>{p.body}</p>
                <span>{p.cta}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}

export const LANDING_CSS = `
.lp{--ink:#23301c;--green:#8CAA71;--green-soft:#EAF1E3;--muted:#6C6C6C;background:#fff;color:#3A3A3A;min-height:100vh;scroll-behavior:smooth}
.lp *{box-sizing:border-box}
.lp a{color:inherit}
.lp-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.lp-nav{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #E6E8E2}
.lp-nav-inner{display:flex;align-items:center;gap:20px;height:60px}
.lp-logo{text-decoration:none;font-weight:700;font-size:17px}
.lp-logo b{color:var(--green);font-weight:900;margin-right:4px}
.lp-nav nav{display:flex;gap:18px;margin-left:auto;font-size:14px}
.lp-nav nav a{text-decoration:none;color:var(--muted)}
.lp-nav nav a:hover{color:var(--ink)}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--green);color:#fff !important;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;border:0;cursor:pointer;font-size:15px}
.lp-btn:hover{filter:brightness(.95)}
.lp-btn.small{padding:8px 16px;font-size:14px}
.lp-btn.ghost{background:transparent;color:var(--ink) !important;border:1px solid #cfd6c7}
.lp-eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--green);text-transform:uppercase;margin-bottom:8px}
.lp-muted{color:var(--muted);font-size:14px;line-height:1.7}
.lp-sub{max-width:720px;margin:8px 0 28px}
.lp h1{font-size:44px;line-height:1.2;color:var(--ink);margin:0 0 18px}
.lp h2{font-size:30px;line-height:1.3;color:var(--ink);margin:0}
.lp h3{font-size:19px;color:var(--ink);margin:0}
.lp-hero{background:linear-gradient(160deg,var(--green-soft) 0%,#fff 60%);padding:72px 0 64px}
.lp-hero-inner{display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:center}
.lp-lead{font-size:17px;line-height:1.8;color:#4a4a4a;max-width:560px}
.lp-hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.lp-hero-art{display:grid;gap:14px}
.lp-hero-chip{display:flex;align-items:center;gap:14px;background:#fff;border:2px solid;border-radius:18px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,.05)}
.lp-hero-chip img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#f4f4f4}
.lp-hero-chip b{display:block;font-size:16px}
.lp-hero-chip small{color:var(--muted)}
.lp-section{padding:72px 0}
.lp-section.soft{background:#F7F9F5}
.lp-brands{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lp-brand{border:1px solid #E6E8E2;border-top:4px solid var(--c);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:10px}
.lp-brand p{margin:0;font-size:14px;line-height:1.75}
.lp-brand-logo{height:40px;width:auto;align-self:flex-start;object-fit:contain}
.lp-brand-tag{color:var(--c);font-weight:700}
.lp-brand .lp-link{margin-top:auto;color:var(--c)}
.lp-link{font-weight:700;font-size:14px;text-decoration:underline;text-underline-offset:3px}
.lp-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:28px}
.lp-flow-item{background:#fff;border:1px solid #E6E8E2;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:6px}
.lp-flow-item span{width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px}
.lp-flow-item small{color:var(--muted);line-height:1.6}
.lp-modules{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.lp-module{border:1px solid #E6E8E2;border-radius:14px;padding:18px 20px}
.lp-module b{color:var(--ink)}
.lp-module p{margin:6px 0 0;font-size:14px;line-height:1.7;color:#555}
.lp-section.game{background:linear-gradient(180deg,#fff 0%,var(--green-soft) 100%)}
.lp-game-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:start}
.lp-game iframe,.lp-game-cover{width:100%;aspect-ratio:16/10;border:0;border-radius:18px;background:#cfe6ee;display:block;box-shadow:0 12px 32px rgba(0,0,0,.08)}
.lp-game iframe{min-height:560px}
.lp-game-cover{position:relative;padding:0;cursor:pointer;overflow:hidden;aspect-ratio:1200/630}
.lp-game-cover img{width:100%;height:100%;object-fit:cover}
.lp-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#ff6b1a;color:#fff;font-weight:900;font-size:20px;padding:14px 32px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.lp-game-actions{display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}
.lp-board{background:#fff;border:1px solid #E6E8E2;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:12px}
.lp-board-head p{margin:4px 0 0}
.lp-prize{background:#FDEBD3;color:#8a4b00;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.6;white-space:pre-line}
.lp-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.lp-tabs{display:flex;gap:4px;background:#F7F9F5;border-radius:12px;padding:3px}
.lp-tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px 4px;font:700 13px inherit;color:var(--muted);cursor:pointer}
.lp-tabs button[aria-selected=true]{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lp-stats div{background:#F7F9F5;border-radius:12px;padding:8px;text-align:center}
.lp-stats b{display:block;font-size:20px;color:var(--ink);font-variant-numeric:tabular-nums}
.lp-stats small{font-size:12px;color:var(--muted)}
.lp-live{color:#1fae78 !important}
.lp-rank{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lp-rank li{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px dashed #eee}
.lp-rank-no{width:26px;height:26px;border-radius:50%;background:#f0f0f0;display:grid;place-items:center;font-weight:800;font-size:13px;flex:none}
.lp-rank-no.top{background:#ffcc33;color:#23301c}
.lp-rank-name{flex:1;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-rank-name small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.lp-rank-score{font-weight:800;color:#ff6b1a;font-variant-numeric:tabular-nums}
.lp-post,.lp-press,.lp-integ-card{border:1px solid #E6E8E2;border-top:4px solid var(--c);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:10px;background:#fff}
.lp-post header{display:flex;align-items:center;gap:12px}
.lp-post header img{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#f4f4f4}
.lp-post header b{display:block;color:var(--c)}
.lp-post header small{color:var(--muted);font-size:12px}
.lp-post h3,.lp-press h3{font-size:16px;line-height:1.5}
.lp-post p,.lp-press p,.lp-integ-card p{margin:0;font-size:14px;line-height:1.75}
.lp-post .lp-link,.lp-press .lp-link{margin-top:auto;color:var(--c)}
.lp-post-meta{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.03em}
.lp-press{text-decoration:none;transition:transform .15s,box-shadow .15s}
.lp-press:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.06)}
.lp-podcast{display:grid;grid-template-columns:320px 1fr;gap:32px;align-items:center;margin-top:28px}
.lp-podcast-cover img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:20px;display:block;box-shadow:0 12px 32px rgba(0,0,0,.1)}
.lp-podcast-body{display:flex;flex-direction:column;gap:12px}
.lp-podcast-body h3{font-size:24px}
.lp-podcast-body .lp-hero-cta{margin-top:4px}
.lp-episode{background:#F7F9F5;border-radius:14px;padding:14px 16px;display:grid;gap:6px}
.lp-episode p{margin:0;font-size:14px;line-height:1.7;color:#555}
.lp-feeds{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}
.lp-feeds a{color:var(--muted)}
.lp-shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:24px}
.lp-shots figure{margin:0}
.lp-shots img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;display:block}
.lp-shots figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.lp-poster{margin:28px 0 0}
.lp-poster img{width:100%;height:auto;border-radius:18px;display:block;box-shadow:0 12px 32px rgba(0,0,0,.08)}
.lp-poster.tall{max-width:760px}
.lp-poster figcaption{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6}
.lp-integ-title{margin:44px 0 16px !important;font-size:20px !important}
.lp-integ{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.lp-integ.stack{grid-template-columns:1fr}
.lp-integ-card .lp-btn{align-self:flex-start;margin-top:auto}
.lp-play-frame{width:100%;height:min(78vh,820px);min-height:640px;border:0;border-radius:14px;background:#cfe6ee;display:block}
.lp-integ-card .lp-link{align-self:flex-start;font-weight:700;font-size:14px;color:var(--c)}
.lp-demo-note{font-size:12px !important;color:#8a4b00;background:#FDEBD3;border-radius:8px;padding:6px 10px;align-self:flex-start}
.lp-footer{border-top:1px solid #E6E8E2;padding:28px 0;font-size:13px;color:var(--muted)}
.lp-footer-inner{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lp-footer nav{display:flex;gap:18px}
@media (max-width:900px){
  .lp h1{font-size:32px}
  .lp h2{font-size:24px}
  .lp-hero{padding:48px 0}
  .lp-hero-inner,.lp-game-grid,.lp-podcast,.lp-integ{grid-template-columns:1fr}
  .lp-podcast-cover{max-width:320px}
  .lp-brands,.lp-modules{grid-template-columns:1fr}
  .lp-flow{grid-template-columns:1fr 1fr}
  .lp-nav-inner{height:auto;flex-wrap:wrap;padding:10px 0;gap:10px}
  .lp-nav nav{display:flex;order:3;width:100%;margin-left:0;overflow-x:auto;gap:14px;padding-bottom:6px}
  .lp-nav-inner .lp-btn{margin-left:auto}
  .lp-section{padding:52px 0}
  .lp-pages,.lp-price{grid-template-columns:1fr}
  .lp-price-hero .lp-amount{font-size:44px}
}
.lp-nav nav a[aria-current=page]{color:var(--ink);font-weight:800}
.lp-pages{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.lp-page-card{display:flex;flex-direction:column;gap:8px;border:1px solid #E6E8E2;border-radius:16px;padding:20px;text-decoration:none;background:#fff}
.lp-page-card:hover{border-color:var(--green)}
.lp-page-card b{color:var(--ink);font-size:17px}
.lp-page-card p{margin:0;font-size:14px;line-height:1.7;color:#555}
.lp-page-card span{margin-top:auto;font-weight:700;font-size:14px;color:var(--green)}
.lp-price{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
.lp-price-hero{background:#fff;border:2px solid var(--green);border-radius:20px;padding:28px}
.lp-price-hero .lp-amount{font-size:56px;font-weight:900;color:var(--ink);line-height:1;margin:8px 0}
.lp-price-hero .lp-amount small{font-size:18px;font-weight:700;color:var(--muted)}
.lp-table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6E8E2}
.lp-table th,.lp-table td{text-align:left;padding:14px 16px;border-bottom:1px solid #E6E8E2;font-size:15px;vertical-align:top}
.lp-table th{background:#F7F9F5;color:var(--ink);font-size:13px}
.lp-table tr:last-child td{border-bottom:0}
.lp-table td:first-child{font-weight:700;color:var(--ink);white-space:nowrap}
.lp-note{font-size:13px;color:var(--muted);line-height:1.7}
.lp-form{display:grid;gap:14px;background:#fff;border:1px solid #E6E8E2;border-radius:20px;padding:24px;max-width:640px}
.lp-form label{display:grid;gap:6px;font-size:14px;font-weight:700;color:var(--ink)}
.lp-form input,.lp-form textarea{font:inherit;font-weight:400;padding:12px 14px;border-radius:10px;border:1px solid #D5D8D0;background:#fff}
.lp-form textarea{min-height:96px;resize:vertical}
.lp-form .lp-hp{position:absolute;left:-9999px;height:0;overflow:hidden}
.lp-form-msg{margin:0;font-size:14px;line-height:1.6}
.lp-form-msg.ok{color:#1f7a3a}
.lp-form-msg.bad{color:#9a3412}
`;

export function PublicFrame({ title, children }: { title: string; children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const here = pathname === '/' ? '/welcome' : pathname;

  useEffect(() => {
    document.title = `${title}｜GO 行銷中心`;
  }, [title]);

  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link to="/welcome" className="lp-logo"><b>GO</b> 行銷中心</Link>
          <nav>
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} aria-current={here === item.to ? 'page' : undefined}>{item.label}</Link>
            ))}
          </nav>
          {user
            ? <Link className="lp-btn small" to="/home">進入行銷中心</Link>
            : <Link className="lp-btn small" to="/login">登入</Link>}
        </div>
      </header>
      {children}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span>© {new Date().getFullYear()} GO 行銷中心</span>
          <nav>
            <Link to="/go-posting">Go幫你發文</Link>
            <a href="/privacy">隱私權政策</a>
            <a href="/legal/game-rules/">遊戲活動辦法</a>
            {user ? <Link to="/home">進入行銷中心</Link> : <Link to="/login">團隊登入</Link>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
