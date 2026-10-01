import { Link } from 'react-router-dom';
import { BRANDS, BrandPosts, PRESS, PublicFrame, brandOf } from '@/pages/public/Landing';

export function Proof() {
  return (
    <PublicFrame title="三品牌發文與媒體曝光">
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">品牌成果</div>
          <h1>三位小編已經在發文</h1>
          <p className="lp-lead">
            阿豪顧 TaskGo、小咪顧 Homigo、阿樂顧 Washgo。人設固定，口吻不混。
            下面每個品牌只放最新發出的一則，讓工班看到這套中心實際長什麼樣子。
          </p>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <BrandPosts />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <div className="lp-eyebrow">媒體曝光</div>
          <h2>經濟日報報導過的三個品牌</h2>
          <p className="lp-muted lp-sub">標題與日期來自報導本身。內文請點原文，我們不轉載全文。</p>
          <div className="lp-brands">
            {PRESS.map((p) => {
              const b = brandOf(p.brand);
              return (
                <a key={p.url} className="lp-press" href={p.url} target="_blank" rel="noopener" style={{ ['--c' as string]: b.color }}>
                  <div className="lp-post-meta">經濟日報・{p.date}・{b.name}</div>
                  <h3>{p.title}</h3>
                  <p>{p.note}</p>
                  <span className="lp-link">閱讀原文</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">三個品牌</div>
          <h2>修繕、租屋、洗衣，各有一個小編</h2>
          <div className="lp-brands" style={{ marginTop: 28 }}>
            {BRANDS.map((b) => (
              <article key={b.slug} className="lp-brand" style={{ ['--c' as string]: b.color }}>
                <img className="lp-brand-logo" src={b.logo} alt="" />
                <h3>{b.name}</h3>
                <p className="lp-brand-tag">{b.tagline}</p>
                <p>{b.body}</p>
                <p className="lp-muted">固定小編：{b.editorName}</p>
                <a className="lp-link" href={b.cta.url} target="_blank" rel="noopener">{b.cta.label}</a>
              </article>
            ))}
          </div>
          <div className="lp-hero-cta">
            <Link className="lp-btn" to="/go-posting">想要一樣的發文，看 999 方案</Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
