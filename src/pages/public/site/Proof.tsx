import { Link } from 'react-router-dom';
import { BRANDS, BrandPosts, BrandResults, PRESS, PublicFrame, brandOf } from '@/pages/public/Landing';

export function Proof() {
  return (
    <PublicFrame title="三品牌發文與媒體曝光">
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">品牌成果</div>
          <h1>三個品牌發了多少、帶來多少</h1>
          <p className="lp-lead">
            阿豪顧 TaskGo、小咪顧 Homigo、阿樂顧 Washgo，都在 Facebook、Instagram、Threads 發文。
            下面先看三個品牌加總的成果，再看各品牌最新一則，以及經濟日報的報導。
          </p>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-eyebrow">發文成效</div>
          <h2>整體成果，一眼看完</h2>
          <p className="lp-muted lp-sub">
            有興趣的客戶可以直接看匠管自己三個品牌的發文量、曝光與互動。數字每幾分鐘更新一次。
          </p>
          <BrandResults />
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">最新貼文</div>
          <h2>每個品牌最近發出的一則</h2>
          <p className="lp-muted lp-sub">人設固定，口吻不混。點進去可以看原文。</p>
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
