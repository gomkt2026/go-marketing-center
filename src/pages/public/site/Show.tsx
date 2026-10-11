import { LocalLink, useCopy } from '@/pages/public/locale';
import { PodcastBlock, PublicFrame, useBrands } from '@/pages/public/Landing';

export function Show() {
  const page = useCopy().show;
  const brands = useBrands();
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
          <PodcastBlock />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>{page.hostsTitle}</h2>
          <div className="lp-brands" style={{ marginTop: 28 }}>
            {brands.map((b) => (
              <article key={b.slug} className="lp-brand" style={{ ['--c' as string]: b.color }}>
                <img src={b.editor} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
                <h3>{b.editorName}</h3>
                <p className="lp-brand-tag">{b.name}</p>
                <p>{page.hosts[b.slug]}</p>
              </article>
            ))}
          </div>
          <p className="lp-note" style={{ marginTop: 20 }}>{page.note}</p>
          <div className="lp-hero-cta">
            <LocalLink className="lp-btn ghost" to="/center">{page.cta}</LocalLink>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
