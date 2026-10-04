import { Link } from 'react-router-dom';
import {
  GAME_SHOTS, GameFrame, INTEGRATIONS, Leaderboard, PublicFrame, brandOf,
} from '@/pages/public/Landing';
import { GameScenes, GameWeek, WishBoard } from '@/pages/public/site/JiangchengBoard';

export function Jiangcheng() {
  return (
    <PublicFrame title="匠城出任務">
      <section className="lp-section game">
        <div className="lp-wrap">
          <div className="lp-eyebrow">遊戲挑戰</div>
          <h1>收工以後，跑一班舒壓</h1>
          <p className="lp-lead">
            匠城出任務是給工班互動的小遊戲：騎車接 TaskGo 報修、Homigo 送鑰匙、Washgo 收衣服。
            介面現在有 English、日本語、Tiếng Việt、Bahasa Indonesia。先讓人用自己的語言，體驗在台灣跑一班的天氣、垃圾車和路上突發。
            玩完可以上排行榜，同一套呈現也接進 TaskGo 和 Washgo 的系統裡。
          </p>
          <figure className="lp-poster tall">
            <img
              src="/site/jiangcheng-languages.jpg"
              alt="匠城出任務四種語言畫面：English 的 Craft City Rush、日本語的匠シティ・ラッシュ、Tiếng Việt 與 Bahasa Indonesia。同一條台灣街道，慢字路標分別是 SLOW、徐行、CHẬM、PELAN。"
            />
            <figcaption>同一條台灣街。English、日本語、Tiếng Việt、Bahasa Indonesia 都能上手，先體驗在台灣跑一班。</figcaption>
          </figure>
          <div id="play" className="lp-game-grid" style={{ marginTop: 28 }}>
            <GameFrame />
            <Leaderboard />
          </div>
          {GAME_SHOTS.length > 0 && (
            <div className="lp-shots">
              {GAME_SHOTS.map((s) => (
                <figure key={s.src}>
                  <img src={s.src} alt={s.caption} loading="lazy" />
                  <figcaption>{s.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      <GameScenes />
      <GameWeek />
      <WishBoard />

      <section className="lp-section">
        <div className="lp-wrap">
          <h2>地圖怎麼解</h2>
          <div className="lp-flow">
            <div className="lp-flow-item"><span>1</span><b>小地圖</b><small>90 秒，先熟悉接單、打卡、回程。</small></div>
            <div className="lp-flow-item"><span>2</span><b>中地圖、大地圖</b><small>單變多，天氣和路上狀況每班不一樣。</small></div>
            <div className="lp-flow-item"><span>3</span><b>台灣地圖</b><small>邀請朋友才開得了的隱藏版。</small></div>
            <div className="lp-flow-item"><span>4</span><b>排行榜</b><small>暱稱上場，電話只顯示遮罩。連單營收越高，越有機會拿獎。</small></div>
          </div>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>已經接進系統的匠城呈現</h2>
          <p className="lp-muted lp-sub">
            結案或查進度時，流程直接在下面播成一段匠城動畫。客戶不用再按開啟，就能看到派工、施工、洗滌這些資訊怎麼串在一起。
          </p>
          <div className="lp-integ stack">
            {INTEGRATIONS.map((c) => {
              const b = brandOf(c.brand);
              return (
                <article key={c.url} className="lp-integ-card" style={{ ['--c' as string]: b.color }}>
                  <img className="lp-brand-logo" src={b.logo} alt="" />
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <iframe
                    className="lp-play-frame"
                    src={c.url}
                    title={c.title}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                  <p className="lp-demo-note">測試場域展示，並非真實客戶或真實案件。</p>
                  <a className="lp-link" href={c.url} target="_blank" rel="noopener">另開完整畫面</a>
                </article>
              );
            })}
          </div>
          <div className="lp-hero-cta">
            <Link className="lp-btn ghost" to="/go-posting">看 Go 幫你發文</Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
