import { Link } from 'react-router-dom';
import { PublicFrame } from '@/pages/public/Landing';
import {
  BRIEFING_DECKS,
  BRIEFING_FILMS,
  BRAND_LABEL,
  sectionSlides,
  slideImage,
  type BriefingBrand,
} from '@/data/briefings';

function BrandChips({ brands }: { brands: BriefingBrand[] }) {
  return (
    <div className="briefing-chips">
      {brands.map((brand) => (
        <span key={brand} className={`briefing-chip is-${brand}`}>{BRAND_LABEL[brand]}</span>
      ))}
    </div>
  );
}

export function BriefingHub() {
  return (
    <PublicFrame title="修繕聯盟與 Fixercowork">
    <section className="lp-section">
    <div className="lp-wrap briefing-hub">
      <div className="lp-eyebrow">給工程夥伴</div>
      <h1>修繕聯盟與 Fixercowork</h1>
      <p className="lp-lead">不用登入。想了解案源怎麼進來、平台怎麼派工，直接看下面兩份說明。</p>

      {BRIEFING_DECKS.map((deck) => (
        <section key={deck.slug} className="briefing-deck-card">
          <img className="briefing-deck-cover" src={slideImage(deck.slug, 0)} alt="" />
          <div className="briefing-deck-copy">
            <div className="briefing-kicker">{deck.kicker}</div>
            <h2>{deck.title}</h2>
            <p>{deck.summary}</p>
            <BrandChips brands={deck.brands} />
            <div className="briefing-meta">
              <span>{deck.slides.length} 頁</span>
              <span>對象：{deck.audience}</span>
              <span>更新 {deck.updated}</span>
            </div>
            <div className="briefing-actions">
              <Link className="briefing-start" to={`/briefings/${deck.slug}/play`}>看這份說明</Link>
            </div>
            <div className="briefing-sections">
              {deck.sections.map((section) => (
                <Link key={section.label} to={`/briefings/${deck.slug}/play?at=${section.at}`}>
                  {section.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="briefing-outline">
            {deck.sections.map((section, sectionIndex) => (
              <details key={section.label}>
                <summary>{section.label}</summary>
                <ol>
                  {sectionSlides(deck, sectionIndex).map(({ slide, at }) => (
                    <li key={at}>
                      <Link to={`/briefings/${deck.slug}/play?at=${at}`}>
                        <img src={slideImage(deck.slug, at - 1)} alt="" loading="lazy" />
                        <span>
                          <strong>{at}. {slide.title}</strong>
                          {slide.video && <em>含影片</em>}
                        </span>
                      </Link>
                      <p>{slide.notes}</p>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="briefing-films">
        <h2>看系統實際怎麼跑</h2>
        <p>這幾支影片讓你直接看到報修、場勘、報價，以及修繕怎麼轉成洗衣。</p>
        <div className="briefing-film-grid">
          {BRIEFING_FILMS.map((film) => (
            <Link key={film.slug} to={`/briefings/watch/${film.slug}`} className="briefing-film-card">
              <img src={film.poster} alt="" />
              <div>
                <BrandChips brands={film.brands} />
                <strong>{film.title}</strong>
                <span>{film.duration} · {film.cue}</span>
                <p>{film.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
    </section>
    </PublicFrame>
  );
}
