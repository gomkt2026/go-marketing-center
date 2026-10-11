import { LocalLink, useCopy } from '@/pages/public/locale';
import {
  GAME_SHOTS, GameFrame, Leaderboard, PublicFrame, brandOf, useBrands, useIntegrations,
} from '@/pages/public/Landing';
import { GameScenes, GameWeek, WishBoard } from '@/pages/public/site/JiangchengBoard';

export function Jiangcheng() {
  const page = useCopy().game;
  const brands = useBrands();
  const integrations = useIntegrations();
  return (
    <PublicFrame title={page.title}>
      <section className="lp-section game">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.eyebrow}</div>
          <h1>{page.h1}</h1>
          <p className="lp-lead">{page.lead}</p>
          <figure className="lp-poster tall">
            <img src="/site/jiangcheng-languages.jpg" alt={page.posterAlt} />
            <figcaption>{page.posterCaption}</figcaption>
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
          <h2>{page.mapTitle}</h2>
          <div className="lp-flow">
            {page.steps.map((step, i) => (
              <div key={step.title} className="lp-flow-item"><span>{i + 1}</span><b>{step.title}</b><small>{step.body}</small></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>{page.embedTitle}</h2>
          <p className="lp-muted lp-sub">{page.embedSub}</p>
          <div className="lp-integ stack">
            {integrations.map((c) => {
              const b = brandOf(brands, c.brand);
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
                  <p className="lp-demo-note">{page.demoNote}</p>
                  <a className="lp-link" href={c.url} target="_blank" rel="noopener">{page.openFull}</a>
                </article>
              );
            })}
          </div>
          <div className="lp-hero-cta">
            <LocalLink className="lp-btn ghost" to="/go-posting">{page.cta}</LocalLink>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
