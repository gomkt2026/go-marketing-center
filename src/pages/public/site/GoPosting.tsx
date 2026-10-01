import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, PublicFrame } from '@/pages/public/Landing';

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
              <a className="lp-btn" href="#inquiry">填需求，我們聯絡你</a>
              <Link className="lp-btn ghost" to="/proof">先看三品牌怎麼發</Link>
            </div>
          </div>
          <div className="lp-price-hero">
            <div className="lp-post-meta">只有這一檔</div>
            <div className="lp-amount">999<small> 元／月</small></div>
            <p>每週 2 則，發到 Facebook、Instagram、Threads。</p>
          </div>
          <figure className="lp-poster" style={{ gridColumn: '1 / -1' }}>
            <img
              src="/site/go-posting-dm.jpg"
              alt="GO 行銷中心 DM：讓 AI 幫你找資料、想內容、做文案、排程發文。流程是搜尋資料、AI 分析、產生文案、人工審核、排程發布。正在招募測試夥伴。"
            />
          </figure>
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

      <section className="lp-section" id="inquiry">
        <div className="lp-wrap">
          <div className="lp-eyebrow">怎麼開始</div>
          <h2>留下聯絡方式，我們會打給你</h2>
          <div className="lp-flow">
            <div className="lp-flow-item"><span>1</span><b>填表</b><small>姓名、手機、行業。想先講的話也可以寫在備註。</small></div>
            <div className="lp-flow-item"><span>2</span><b>對口吻</b><small>我們用行銷中心的小編，依你的行業寫，不是套三個品牌的現成文。</small></div>
            <div className="lp-flow-item"><span>3</span><b>每週兩則</b><small>寫好、審過，發到你的 Facebook、Instagram 或 Threads。</small></div>
            <div className="lp-flow-item"><span>4</span><b>一個月 999</b><small>下個月同一件事再做。不想續就跟我們說一聲。</small></div>
          </div>
          <InquiryForm />
          <p className="lp-note">開通與續約由匠管團隊處理，這個網站沒有線上刷卡。也可以改寄信到 {CONTACT_EMAIL}。</p>
        </div>
      </section>
    </PublicFrame>
  );
}

function InquiryForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lineId, setLineId] = useState('');
  const [trade, setTrade] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr('');
    setDone('');
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, lineId, trade, message, website }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; duplicate?: boolean };
      if (!res.ok) throw new Error(data.error || '送出失敗，請再試一次');
      setDone(data.duplicate
        ? '這支手機今天已經留過資料，我們會再跟你聯絡。'
        : '已收到。我們會用這支手機跟你聯絡。');
      setName('');
      setPhone('');
      setLineId('');
      setTrade('');
      setMessage('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '送出失敗，請再試一次');
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="lp-form" onSubmit={submit} style={{ marginTop: 28 }}>
      <label className="lp-hp" aria-hidden="true">
        網站
        <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>
      <label>
        姓名
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" />
      </label>
      <label>
        手機
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" maxLength={20} />
      </label>
      <label>
        LINE ID（選填）
        <input value={lineId} onChange={(e) => setLineId(e.target.value)} maxLength={40} placeholder="沒有可以空白" />
      </label>
      <label>
        行業或店名
        <input value={trade} onChange={(e) => setTrade(e.target.value)} required maxLength={80} placeholder="例如：水電工班、洗衣店" />
      </label>
      <label>
        想先跟我們說的話（選填）
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="服務範圍、不能講的話、想先問的問題" />
      </label>
      {done && <p className="lp-form-msg ok">{done}</p>}
      {err && <p className="lp-form-msg bad">{err}</p>}
      <button className="lp-btn" type="submit" disabled={sending}>{sending ? '送出中…' : '送出，請跟我聯絡'}</button>
    </form>
  );
}
