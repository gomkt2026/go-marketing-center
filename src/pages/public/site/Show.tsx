import { Link } from 'react-router-dom';
import { BRANDS, PodcastBlock, PublicFrame } from '@/pages/public/Landing';

export function Show() {
  return (
    <PublicFrame title="三小編熱聊">
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-eyebrow">Podcast</div>
          <h1>行銷中心也會做節目</h1>
          <p className="lp-lead">
            《GO三小編熱聊》由同一套中心產出：題目、腳本、三位小編的聲音，再到 SoundOn 上架。
            工班、房東、洗衣店聽的是生活裡用得到的事，不是產品發表會。
          </p>
        </div>
      </section>

      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <PodcastBlock />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <h2>三位主持人，人設跟貼文是同一組</h2>
          <div className="lp-brands" style={{ marginTop: 28 }}>
            {BRANDS.map((b) => (
              <article key={b.slug} className="lp-brand" style={{ ['--c' as string]: b.color }}>
                <img src={b.editor} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
                <h3>{b.editorName}</h3>
                <p className="lp-brand-tag">{b.name}</p>
                <p>
                  {b.slug === 'taskgo' && '工班出身。聊報價、派工、業主現場那些不能只靠嘴巴交代的事。'}
                  {b.slug === 'homigo' && '包租管家。聊租約、修繕責任、房東房客怎麼把話說清楚。'}
                  {b.slug === 'washgo' && '洗衣店店員。聊衣物、收送、客人臨時改需求時店裡怎麼接。'}
                </p>
              </article>
            ))}
          </div>
          <p className="lp-note" style={{ marginTop: 20 }}>
            節目頁只放最新一集。完整集數在 SoundOn。訂閱連結不會顯示聯絡信箱。
          </p>
          <div className="lp-hero-cta">
            <Link className="lp-btn ghost" to="/center">看這套中心還能做什麼</Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
