import { PublicFrame } from '@/pages/public/Landing';
import { LocalLink, useLocale } from '@/pages/public/locale';
import {
  BRAND_LABEL,
  briefingCatalog,
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
  const { locale } = useLocale();
  const { ui, decks, films } = briefingCatalog(locale);

  return (
    <PublicFrame title={ui.pageTitle}>
    <section className="lp-section">
    <div className="lp-wrap briefing-hub">
      <div className="lp-eyebrow">{ui.eyebrow}</div>
      <h1>{ui.pageTitle}</h1>
      <p className="lp-lead">{ui.lead}</p>
      {ui.artNote && <p className="lp-muted">{ui.artNote}</p>}

      {decks.map((deck) => (
        <section key={deck.slug} className="briefing-deck-card">
          <img className="briefing-deck-cover" src={slideImage(deck.slug, 0)} alt="" />
          <div className="briefing-deck-copy">
            <div className="briefing-kicker">{deck.kicker}</div>
            <h2>{deck.title}</h2>
            <p>{deck.summary}</p>
            <BrandChips brands={deck.brands} />
            <div className="briefing-meta">
              <span>{ui.pages(deck.slides.length)}</span>
              <span>{ui.audiencePrefix}{deck.audience}</span>
              <span>{ui.updatedPrefix} {deck.updated}</span>
            </div>
            <div className="briefing-actions">
              <LocalLink className="briefing-start" to={`/briefings/${deck.slug}/play`}>{ui.open}</LocalLink>
            </div>
            <div className="briefing-sections">
              {deck.sections.map((section) => (
                <LocalLink key={section.at} to={`/briefings/${deck.slug}/play?at=${section.at}`}>
                  {section.label}
                </LocalLink>
              ))}
            </div>
          </div>
          <div className="briefing-outline">
            {deck.sections.map((section, sectionIndex) => (
              <details key={section.at}>
                <summary>{section.label}</summary>
                <ol>
                  {sectionSlides(deck, sectionIndex).map(({ slide, at }) => (
                    <li key={at}>
                      <LocalLink to={`/briefings/${deck.slug}/play?at=${at}`}>
                        <img src={slideImage(deck.slug, at - 1)} alt="" loading="lazy" />
                        <span>
                          <strong>{at}. {slide.title}</strong>
                          {slide.video && <em>{ui.hasVideo}</em>}
                        </span>
                      </LocalLink>
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
        <h2>{ui.filmsTitle}</h2>
        <p>{ui.filmsLead}</p>
        <div className="briefing-film-grid">
          {films.map((film) => (
            <LocalLink key={film.slug} to={`/briefings/watch/${film.slug}`} className="briefing-film-card">
              <img src={film.poster} alt="" />
              <div>
                <BrandChips brands={film.brands} />
                <strong>{film.title}</strong>
                <span>{film.duration} · {film.cue}</span>
                <p>{film.summary}</p>
              </div>
            </LocalLink>
          ))}
        </div>
      </section>
    </div>
    </section>
    </PublicFrame>
  );
}
