import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
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
    <div className="briefing-hub">
      <PageHeader
        title="簡報專區"
        subtitle="外地簡報打開這一頁就能講。投影片和影片都在網站上，不用再傳檔。"
      />

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
              <Link className="briefing-start" to={`/briefings/${deck.slug}/play`}>開始簡報</Link>
              <Link className="briefing-start is-ghost" to={`/briefings/${deck.slug}/play?at=4`}>從三品牌開始</Link>
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
              <details key={section.label} open={sectionIndex === 0}>
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
        <h2>可單獨播放的影片</h2>
        <p>問到操作時直接播，不用切到別的資料夾。</p>
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
  );
}
