import { Link } from 'react-router-dom';
import { FLOW, MODULES, PublicFrame } from '@/pages/public/Landing';

export function Center() {
  return (
    <PublicFrame title="行銷中心怎麼運作">
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">怎麼運作</div>
          <h1>貼文不是臨時想到才寫</h1>
          <p className="lp-lead">
            GO 行銷中心是匠管為了同時經營三個品牌做出來的。題材進來、小編生成、人審過、發出去、成效再流回來。
            工班在粉專上看到的那一則，走的就是這個循環。
          </p>
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>從題材到成效</h2>
          <div className="lp-flow">
            {FLOW.map((f) => (
              <div key={f.step} className="lp-flow-item">
                <span>{f.step}</span>
                <b>{f.title}</b>
                <small>{f.body}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">功能模組</div>
          <h2>行銷團隊每天開的是這些</h2>
          <p className="lp-muted lp-sub">
            這些是中心內部的工作台，不是 999 方案會另外開給你的後台。
            Go 幫你發文用的是同一套撰寫和發布，你收到的是每週兩則已審過的貼文。
          </p>
          <div className="lp-modules">
            {MODULES.map((m) => (
              <div key={m.title} className="lp-module">
                <b>{m.title}</b>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
          <div className="lp-hero-cta">
            <Link className="lp-btn" to="/go-posting">看 999 方案包含什麼</Link>
            <Link className="lp-btn ghost" to="/show">聽三小編熱聊</Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
