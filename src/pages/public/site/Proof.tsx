import { LocalLink, useCopy } from '@/pages/public/locale';
import { BrandPosts, BrandResults, PublicFrame, brandOf, useBrands, usePress } from '@/pages/public/Landing';

export function Proof() {
  const copy = useCopy();
  const page = copy.proof;
  const brands = useBrands();
  const press = usePress();
  return (
    <PublicFrame title={page.title}>
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.eyebrow}</div>
          <h1>{page.h1}</h1>
          <p className="lp-lead">{page.lead}</p>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.resultsEyebrow}</div>
          <h2>{page.resultsTitle}</h2>
          <p className="lp-muted lp-sub">{page.resultsSub}</p>
          <BrandResults />
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.postsEyebrow}</div>
          <h2>{page.postsTitle}</h2>
          <p className="lp-muted lp-sub">{page.postsSub}</p>
          <BrandPosts />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.pressEyebrow}</div>
          <h2>{page.pressTitle}</h2>
          <p className="lp-muted lp-sub">{page.pressSub}</p>
          <div className="lp-brands">
            {press.map((item) => {
              const brand = brandOf(brands, item.brand);
              return (
                <a key={item.url} className="lp-press" href={item.url} target="_blank" rel="noopener" style={{ ['--c' as string]: brand.color }}>
                  <div className="lp-post-meta">{copy.press.meta(item.date, brand.name)}</div>
                  <h3>{item.title}</h3>
                  <p>{item.note}</p>
                  <span className="lp-link">{page.read}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.brandsEyebrow}</div>
          <h2>{page.brandsTitle}</h2>
          <div className="lp-brands" style={{ marginTop: 28 }}>
            {brands.map((b) => (
              <article key={b.slug} className="lp-brand" style={{ ['--c' as string]: b.color }}>
                <img className="lp-brand-logo" src={b.logo} alt="" />
                <h3>{b.name}</h3>
                <p className="lp-brand-tag">{b.tagline}</p>
                <p>{b.body}</p>
                <p className="lp-muted">{page.fixedEditor(b.editorName)}</p>
                <a className="lp-link" href={b.cta.url} target="_blank" rel="noopener">{b.cta.label}</a>
              </article>
            ))}
          </div>
          <div className="lp-hero-cta">
            <LocalLink className="lp-btn" to="/go-posting">{page.cta}</LocalLink>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
