import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, PublicFrame } from '@/pages/public/Landing';

const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Go幫你發文')}`;

const PLAN = [
  ['方案', 'Go 幫你發文'],
  ['每週篇數', '2 則'],
  ['發到哪', 'Facebook、Instagram、Threads'],
  ['誰來寫', 'AI 小編依你的行業口吻寫'],
  ['發布前', '有人看過才上線'],
  ['月費', 'NT$ 999'],
];

const INCLUDED = [
  ['每週兩則貼文', '一個月約八則，不是每天一則'],
  ['三個平台', '同一則可以發到 Facebook、Instagram、Threads'],
  ['小編撰寫', '用行銷中心的 AI 小編寫，不是空白範本讓你自己填'],
  ['人工審過', '發出之前會先看過'],
];

const NOT_INCLUDED = [
  ['廣告投放', '不含買廣告、不含保證曝光'],
  ['拍片與 Podcast', '不含幫你錄 Podcast 或拍短片'],
  ['官網長文', '不含官網 SEO 文章'],
  ['系統月費', '這不是 TaskGo、Homigo、Washgo 的軟體月費'],
];

export function GoPosting() {
  return (
    <PublicFrame title="Go 幫你發文">
      <section className="lp-hero">
        <div className="lp-wrap lp-price">
          <div>
            <div className="lp-eyebrow">給工班與店家</div>
            <h1>Go 幫你發文<br />只收你 999／月</h1>
            <p className="lp-lead">
              匠管用這套中心幫 TaskGo、Homigo、Washgo 發文。現在同一套做法開放給工班和店家：
              你不用自己想題目、寫文案、記得按發布。每週兩則，一個月 999 元。
            </p>
            <div className="lp-hero-cta">
              <a className="lp-btn" href={mailto}>來信開通</a>
              <Link className="lp-btn ghost" to="/proof">先看三品牌怎麼發</Link>
            </div>
          </div>
          <div className="lp-price-hero">
            <div className="lp-post-meta">只有這一檔</div>
            <div className="lp-amount">999<small> 元／月</small></div>
            <p>每週 2 則，發到 Facebook、Instagram、Threads。</p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">價格表</div>
          <h2>一個方案，看這張表就好</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <tbody>
              {PLAN.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="lp-note" style={{ marginTop: 12 }}>價格含撰寫與發布。沒有年約方案、沒有加價方案。</p>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>999 元裡面有什麼</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <thead><tr><th>包含</th><th>說明</th></tr></thead>
            <tbody>
              {INCLUDED.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ marginTop: 40 }}>這筆錢不包含</h2>
          <table className="lp-table" style={{ marginTop: 28 }}>
            <thead><tr><th>不包含</th><th>說明</th></tr></thead>
            <tbody>
              {NOT_INCLUDED.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">怎麼開始</div>
          <h2>來信說你是做哪一行</h2>
          <div className="lp-flow">
            <div className="lp-flow-item"><span>1</span><b>來信</b><small>寄到 {CONTACT_EMAIL}，主旨寫「Go幫你發文」。附上行業、服務範圍、不能講的話。</small></div>
            <div className="lp-flow-item"><span>2</span><b>對口吻</b><small>我們用行銷中心的小編，依你的行業寫，不是套三個品牌的現成文。</small></div>
            <div className="lp-flow-item"><span>3</span><b>每週兩則</b><small>寫好、審過，發到你的 Facebook、Instagram 或 Threads。</small></div>
            <div className="lp-flow-item"><span>4</span><b>一個月 999</b><small>下個月同一件事再做。不想續就來信說一聲。</small></div>
          </div>
          <div className="lp-hero-cta">
            <a className="lp-btn" href={mailto}>寄信給匠管</a>
          </div>
          <p className="lp-note">開通與續約由匠管團隊處理，這個網站沒有線上刷卡。</p>
        </div>
      </section>
    </PublicFrame>
  );
}
