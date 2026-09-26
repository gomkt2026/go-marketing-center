import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

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
}

interface LeaderboardResponse {
  season: GameSeason | null;
  entries: LeaderboardEntry[];
}

const BRANDS = [
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

const MODULES = [
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

const FLOW = [
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

function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/game/leaderboard?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: LeaderboardResponse) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const season = data?.season;
  return (
    <div className="lp-board">
      <div className="lp-board-head">
        <div className="lp-eyebrow">排行榜</div>
        <h3>{season ? season.name : '全站排行'}</h3>
        {season && (
          <p className="lp-muted">
            活動期間 {formatDate(season.startsAt)} – {formatDate(season.endsAt)}，前 {season.topN} 名可獲獎
          </p>
        )}
      </div>
      {season?.prize && <div className="lp-prize">{season.prize}</div>}
      {failed && <p className="lp-muted">排行榜暫時載入失敗，請稍後再試。</p>}
      {!failed && !data && <p className="lp-muted">載入中…</p>}
      {data && data.entries.length === 0 && <p className="lp-muted">還沒有人上榜，第一名等你來拿。</p>}
      {data && data.entries.length > 0 && (
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
      <a className="lp-link" href="/legal/game-rules/">活動辦法與領獎方式</a>
    </div>
  );
}

function GameFrame() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-game">
      {playing ? (
        <iframe
          src="/game/?embed=1"
          title="匠城出任務"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="lp-game-cover" onClick={() => setPlaying(true)}>
          <img src="/game/og-image.jpg" alt="匠城出任務遊戲畫面" loading="lazy" />
          <span className="lp-play">開始遊戲</span>
        </button>
      )}
      <div className="lp-game-actions">
        <a className="lp-btn ghost" href="/game/" target="_blank" rel="noopener">全螢幕開啟</a>
        <span className="lp-muted">手機直接點「全螢幕開啟」操作最順</span>
      </div>
    </div>
  );
}

export function Landing() {
  const { user } = useAuth();

  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-logo"><b>GO</b> 行銷中心</a>
          <nav>
            <a href="#universe">GO 宇宙</a>
            <a href="#modules">功能</a>
            <a href="#game">遊戲挑戰</a>
          </nav>
          {user
            ? <Link className="lp-btn small" to="/home">進入行銷中心</Link>
            : <Link className="lp-btn small" to="/login">登入</Link>}
        </div>
      </header>

      <section id="top" className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div>
            <div className="lp-eyebrow">GO Marketing Center</div>
            <h1>匠管 GO 宇宙的<br />AI 行銷營運中心</h1>
            <p className="lp-lead">
              TaskGo、Homigo、Washgo 三個品牌共用一套行銷系統：多位 AI 小編依品牌口吻產出內容，
              團隊審閱後一鍵發布到 Threads、Facebook、Instagram 與官網，成效再回流讓下一篇更準。
            </p>
            <div className="lp-hero-cta">
              <a className="lp-btn" href="#game">玩遊戲認識 GO 宇宙</a>
              <a className="lp-btn ghost" href="#modules">看完整功能</a>
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

      <section id="universe" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">匠管 GO 宇宙</div>
          <h2>三個品牌，一條 LINE 串起生活大小事</h2>
          <p className="lp-muted lp-sub">修繕、租屋、洗衣都是日常會遇到的服務。GO 宇宙讓現場人員不用另外裝 App，通知都從 LINE 進來。</p>
          <div className="lp-brands">
            {BRANDS.map((b) => (
              <article key={b.slug} className="lp-brand" style={{ ['--c' as string]: b.color }}>
                <img className="lp-brand-logo" src={b.logo} alt={b.name} />
                <h3>{b.name}</h3>
                <p className="lp-brand-tag">{b.tagline}</p>
                <p>{b.body}</p>
                <a className="lp-link" href={b.cta.url} target="_blank" rel="noopener">{b.cta.label}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <div className="lp-eyebrow">運作方式</div>
          <h2>從題材到成效，一個循環跑完</h2>
          <div className="lp-flow">
            {FLOW.map((f) => (
              <div key={f.step} className="lp-flow-item">
                <span>{f.step}</span>
                <b>{f.title}</b>
                <small>{f.body}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="modules" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">功能模組</div>
          <h2>行銷團隊每天要用的，都在這裡</h2>
          <div className="lp-modules">
            {MODULES.map((m) => (
              <div key={m.title} className="lp-module">
                <b>{m.title}</b>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="game" className="lp-section game">
        <div className="lp-wrap">
          <div className="lp-eyebrow">遊戲挑戰</div>
          <h2>匠城出任務：90 秒跑完三品牌工單</h2>
          <p className="lp-muted lp-sub">
            騎著機車在匠城接單：TaskGo 報修派工、Homigo 送鑰匙交屋、Washgo 衣物收送。
            連單越多營收越高，登上排行榜還有機會拿獎品。
          </p>
          <div className="lp-game-grid">
            <GameFrame />
            <Leaderboard />
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span>© {new Date().getFullYear()} GO 行銷中心</span>
          <nav>
            <a href="/privacy">隱私權政策</a>
            <a href="/legal/game-rules/">遊戲活動辦法</a>
            {user ? <Link to="/home">進入行銷中心</Link> : <Link to="/login">團隊登入</Link>}
          </nav>
        </div>
      </footer>
    </div>
  );
}

const LANDING_CSS = `
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
.lp-rank{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lp-rank li{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px dashed #eee}
.lp-rank-no{width:26px;height:26px;border-radius:50%;background:#f0f0f0;display:grid;place-items:center;font-weight:800;font-size:13px;flex:none}
.lp-rank-no.top{background:#ffcc33;color:#23301c}
.lp-rank-name{flex:1;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-rank-name small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.lp-rank-score{font-weight:800;color:#ff6b1a;font-variant-numeric:tabular-nums}
.lp-footer{border-top:1px solid #E6E8E2;padding:28px 0;font-size:13px;color:var(--muted)}
.lp-footer-inner{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lp-footer nav{display:flex;gap:18px}
@media (max-width:900px){
  .lp h1{font-size:32px}
  .lp h2{font-size:24px}
  .lp-hero{padding:48px 0}
  .lp-hero-inner,.lp-game-grid{grid-template-columns:1fr}
  .lp-brands,.lp-modules{grid-template-columns:1fr}
  .lp-flow{grid-template-columns:1fr 1fr}
  .lp-nav nav{display:none}
  .lp-nav-inner .lp-btn{margin-left:auto}
  .lp-section{padding:52px 0}
}
`;
