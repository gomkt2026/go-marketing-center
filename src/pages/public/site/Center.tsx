import { LocalLink, useCopy } from '@/pages/public/locale';
import { PublicFrame, useFlow, useModules } from '@/pages/public/Landing';

export function Center() {
  const page = useCopy().center;
  const flow = useFlow();
  const modules = useModules();
  return (
    <PublicFrame title={page.title}>
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.eyebrow}</div>
          <h1>{page.h1}</h1>
          <p className="lp-lead">{page.lead}</p>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>{page.flowTitle}</h2>
          <div className="lp-flow">
            {flow.map((item, i) => (
              <div key={item.title} className="lp-flow-item">
                <span>{i + 1}</span>
                <b>{item.title}</b>
                <small>{item.body}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{page.modulesEyebrow}</div>
          <h2>{page.modulesTitle}</h2>
          <p className="lp-muted lp-sub">{page.modulesSub}</p>
          <div className="lp-modules">
            {modules.map((m) => (
              <div key={m.title} className="lp-module">
                <b>{m.title}</b>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
          <div className="lp-hero-cta">
            <LocalLink className="lp-btn" to="/go-posting">{page.cta}</LocalLink>
            <LocalLink className="lp-btn ghost" to="/show">{page.show}</LocalLink>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
