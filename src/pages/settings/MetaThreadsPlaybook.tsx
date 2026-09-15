import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';

const APP_ID = '1050575724086471';
const BUSINESS_ID = '2534843870320856';
const SUBMISSION_ID = '10505757075132';
const PRODUCT_URL = 'https://go-marketing-center.pages.dev';
const PRIVACY_URL = `${PRODUCT_URL}/privacy`;
const CONTACT = 'service@inforcraft.com.tw';

const META_THREADS_USE_CASE = `https://developers.facebook.com/apps/${APP_ID}/use_cases/customize/?use_case_enum=THREADS_API&selected_tab=permissions`;
const META_SUBMISSION = `https://developers.facebook.com/apps/${APP_ID}/app-review/submissions/?submission_id=${SUBMISSION_ID}&business_id=${BUSINESS_ID}`;
const META_EXPLORER = 'https://developers.facebook.com/tools/explorer/';
const META_BUSINESS_VERIFY = 'https://www.facebook.com/settings?tab=business_verification';

const PASTE_MANAGE_REPLIES = `GO 行銷中心是 Homigo、TaskGo、Washgo 的內部行銷後台，只給授權小編使用，不是給一般消費者下載的 App。登入網址：${PRODUCT_URL}

我們使用 threads_manage_replies 做兩件事，都走官方 API，沒有爬蟲：
1. 小編在「Threads 工作台」核准回覆稿後，系統用 reply_to_id 把回覆發到該則公開貼文（包含回覆自己貼文底下的留言）。沒有這個權限就無法代品牌帳號留言。
2. 管理品牌自己貼文底下的留言（例如取消隱藏），維持公開討論品質。

價值：小編不必開 Threads App 逐則複製貼上，可在同一頁改稿、審核、發送，並用每小時／每日上限避免洗版。自動回覆可隨時關閉，預設需人工按「發」。

我們只處理公開內容與品牌已授權帳號；不讀私訊、不賣資料、不用於廣告再行銷。Token 加密存放。隱私與刪除說明：${PRIVACY_URL} ，聯絡 ${CONTACT}。`;

const PASTE_KEYWORD_SEARCH = `GO 行銷中心是 Homigo、TaskGo、Washgo 的內部行銷後台，只給授權小編使用，不是給一般消費者下載的 App。登入網址：${PRODUCT_URL}

我們使用 threads_keyword_search 呼叫官方 Keyword Search API，依產業關鍵字搜尋公開 Threads 貼文，例如：租屋／房東房客（Homigo）、裝修／工班／漏水（TaskGo）、洗衣／換季／發霉（Washgo）。搜尋結果只顯示給該品牌小編，系統會產生回覆草稿。

價值：小編不必自己在 Threads 手動搜熱門文。同一頁即可看到相關公開討論、改稿、審核後發送。未過審前此權限只能搜到自己的文，工作台回覆區會是空的；申請進階存取後，同一流程才能搜到別人的公開文。

預設需小編按「發」才會留言。若開啟自動回覆，也只在每小時／每日上限內發送，可隨時關閉。我們只搜公開內容，不搜私密帳號，不把搜尋結果出售、出租或用於廣告再行銷。Token 加密存放。隱私與刪除說明：${PRIVACY_URL} ，聯絡 ${CONTACT}。`;

const PASTE_PROCESSORS = `本公司（請改成商家驗證上的法定公司全名）、Cloudflare, Inc.（網站與 Workers 託管）、Neon, Inc.（PostgreSQL 資料庫）、OpenAI, L.L.C.（僅傳送產稿所需上下文）`;

const SCREENCAST_ZH = `這是 GO 行銷中心，品牌小編後台。我用測試帳號登入。進入 Washgo 的 Threads 工作台。按立即掃文，系統呼叫官方 Keyword Search。現在 App 還在開發模式，所以先搜到自己的文。小編可以改回覆、按發送。發送是走官方回覆 API。過審後，同一頁會出現別人的公開熱門文，流程不變。小編可以關掉自動回覆，全部改人工按發送。隱私政策在 go-marketing-center.pages.dev/privacy。`;

const SCREENCAST_EN = `This is GO Marketing Center, an internal editor console. I sign in with the reviewer account. I open Washgo → Threads Desk and click Scan now. That calls official Keyword Search. In development mode we only see our own posts. The editor can edit the draft and tap Send, which uses the official reply API. After App Review the same screen shows other people's public posts. Auto-reply can be turned off. Privacy policy: go-marketing-center.pages.dev/privacy.`;

const TABS = [
  { id: 'overview', label: '總覽' },
  { id: 'review', label: '送審步驟' },
  { id: 'paste', label: '可貼文案' },
  { id: 'data', label: '資料處理' },
  { id: 'brand', label: '過審後接品牌' },
  { id: 'media', label: '畫面與影片' },
];

const muted: CSSProperties = { fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-muted)' };
const body: CSSProperties = { fontSize: 13, lineHeight: 1.85 };
const list: CSSProperties = { fontSize: 13, lineHeight: 1.85, paddingLeft: 18, margin: '8px 0 0' };
const shot: CSSProperties = {
  width: '100%',
  maxWidth: 860,
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  display: 'block',
  marginTop: 10,
};
const pre: CSSProperties = {
  margin: 0,
  padding: '12px 14px',
  borderRadius: 8,
  background: 'var(--color-bg-soft)',
  border: '1px solid var(--color-border)',
  fontSize: 12.5,
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'inherit',
};

function CopyBlock({ title, hint, text }: { title: string; hint?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('請手動複製', text);
    }
  }
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          {hint && <p style={{ ...muted, marginTop: 4 }}>{hint}</p>}
        </div>
        <Button variant={copied ? 'primary' : 'secondary'} onClick={() => void copy()}>
          {copied ? '已複製' : '複製'}
        </Button>
      </div>
      <pre style={{ ...pre, marginTop: 10 }}>{text}</pre>
    </Card>
  );
}

function Shot({ src, caption }: { src: string; caption: string }) {
  return (
    <figure style={{ margin: '0 0 16px' }}>
      <img src={src} alt={caption} style={shot} />
      <figcaption style={{ ...muted, marginTop: 6 }}>{caption}</figcaption>
    </figure>
  );
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}>
      {children}
    </a>
  );
}

export function MetaThreadsPlaybook() {
  const [tab, setTab] = useState('overview');
  const { currentBrand, brands } = useBrand();
  const slug = currentBrand?.slug ?? brands[0]?.slug ?? 'washgo';

  return (
    <div>
      <PageHeader
        title="Threads／Meta 申請手冊"
        subtitle="WashgoMarketing App Review 的實做紀錄。之後接新品牌先看這一頁，不要另開一支 App。"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/${slug}/social`}><Button variant="secondary">去社群帳號</Button></Link>
            <Link to={`/${slug}/threads`}><Button variant="ghost">去 Threads 工作台</Button></Link>
          </div>
        }
      />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </Card>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'review' && <ReviewTab />}
      {tab === 'paste' && <PasteTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'brand' && <BrandTab slug={slug} />}
      {tab === 'media' && <MediaTab />}
    </div>
  );
}

function OverviewTab() {
  return (
    <div>
      <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-primary)' }}>
        <strong style={{ fontSize: 14 }}>2026-09-15 送審現況</strong>
        <p style={{ ...body, marginTop: 8 }}>
          App <code>WashgoMarketing</code> 已開「存取 Threads API」。商家驗證過了。
          Threads 五個權限測試都綠：<code>threads_basic</code>、<code>threads_content_publish</code>、
          <code>threads_manage_insights</code>、<code>threads_keyword_search</code>、<code>threads_manage_replies</code>。
          正在填應用程式檢閱 <code>{SUBMISSION_ID}</code>，一次送 keyword search 與 manage replies。
        </p>
        <p style={{ ...muted, marginTop: 8 }}>
          主控板若還寫「測試進行中」，多半是廣告 API、WhatsApp 沒測完。那兩塊可以不管，不擋 Threads 送審。
        </p>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>固定編號（三品牌共用同一支 App）</strong>
        <ul style={list}>
          <li>App 名稱：WashgoMarketing</li>
          <li>App ID：<code>{APP_ID}</code></li>
          <li>Business ID：<code>{BUSINESS_ID}</code></li>
          <li>本次送審 ID：<code>{SUBMISSION_ID}</code></li>
          <li>產品：<External href={PRODUCT_URL}>{PRODUCT_URL}</External></li>
          <li>隱私／資料刪除：<External href={PRIVACY_URL}>{PRIVACY_URL}</External></li>
          <li>聯絡：{CONTACT}</li>
        </ul>
        <p style={{ ...muted, marginTop: 10 }}>
          後台入口：<External href={META_THREADS_USE_CASE}>Threads 使用案例／權限</External>
          {' · '}
          <External href={META_SUBMISSION}>本次檢閱表單</External>
        </p>
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>記住這幾件事，之後才不會重做</strong>
        <ol style={list}>
          <li>回自己貼文底下的留言，多半算 <code>threads_content_publish</code>，<strong>不會</strong>點亮 <code>threads_manage_replies</code>。要打 <code>POST {'{REPLY_ID}'}/manage_reply</code>，參數 <code>hide=false</code>。</li>
          <li><code>threads_keyword_search</code> 未過審只能搜到自己的文。系統會略過自己，所以工作台回覆區會是空的。這是 Meta 規定，不是連線壞掉。</li>
          <li>資料控管者只能填商家驗證上的<strong>法定公司全名</strong>，不要填 Washgo、匠管、GO 行銷中心。</li>
          <li>過審後不要另開 App。新品牌只要把 Threads 帳號加進測試人員（或正式上線後直接授權），在「社群帳號」重走授權、換長效 token。</li>
          <li>不要用非官方爬蟲或 RPA 掃別人的 Threads。</li>
        </ol>
      </Card>
    </div>
  );
}

function ReviewTab() {
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>一、先點亮權限測試（已完成，留著對照）</strong>
        <p style={{ ...body, marginTop: 8 }}>
          商家驗證必須先綠。keyword search 要有至少 1 次成功 API 測試呼叫；manage replies 不能靠發文或回自己文，要打官方「取消隱藏留言」。
        </p>
        <ol style={list}>
          <li>開 <External href={META_EXPLORER}>Graph API Explorer</External>，App 選 <code>{APP_ID}</code>，Graph 網域選 <code>graph.threads.net</code>。</li>
          <li>Generate Token，勾 <code>threads_basic</code>、<code>threads_read_replies</code>、<code>threads_manage_replies</code>。</li>
          <li><code>GET me/threads?fields=id,text,permalink,timestamp&limit=5</code>，複製一則底下已有留言的貼文 ID。</li>
          <li><code>GET {'{POST_ID}'}/replies?fields=id,text,username,timestamp</code>，複製一則留言 ID。</li>
          <li><code>POST {'{REPLY_ID}'}/manage_reply</code>，參數名 <code>hide</code>、值 <code>false</code>。成功回 <code>{'{ "success": true }'}</code>。</li>
          <li>綠點可能要 1–2 天。這 30 天內送審才算數。</li>
        </ol>
        <Shot
          src="/docs/meta/01-keyword-search-requirements.png"
          caption="送審前：keyword_search 商家驗證與 API 測試已綠，存取權驗證／應用程式檢閱／資料處理還是灰。"
        />
        <Shot
          src="/docs/meta/02-manage-replies-requirements.png"
          caption="同一時期 manage_replies 使用量還是 0。發文、回自己文不會點亮這顆，必須打 manage_reply。"
        />
        <Shot
          src="/docs/meta/03-threads-permissions-tested.png"
          caption="2026-09-15：Threads 五個權限都「測試完成」。上方廣告 API、下方 WhatsApp 可略過。"
        />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>二、應用程式檢閱表單（你正在填的）</strong>
        <p style={{ ...body, marginTop: 8 }}>
          左側「檢閱」開新送審。每個權限一頁：貼說明、上傳 2–3 分鐘錄影、勾最下面那格。測試綠點已完成就可以繼續。
        </p>
        <Shot
          src="/docs/meta/04-manage-replies-justification.png"
          caption="「告訴我們你申請 threads_manage_replies 的原因」。說明欄貼「可貼文案」分頁的 manage replies 稿，再上傳錄影並勾同意。"
        />
        <Shot
          src="/docs/meta/05-keyword-search-justification.png"
          caption="下一頁是 threads_keyword_search。同一支錄影可再用，說明欄改貼 keyword search 稿。"
        />
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>三、資料處理之後</strong>
        <p style={{ ...body, marginTop: 8 }}>
          填完資料處理會進「審核人員指示」。把測試小編帳密、已連線的 Threads 帳號寫上去，並給審核員登入 {PRODUCT_URL} 的步驟。
          送出後等審核。核准後到社群帳號重新授權，工作台「立即掃文」才能看到別人的公開文。
        </p>
      </Card>
    </div>
  );
}

function PasteTab() {
  return (
    <div>
      <CopyBlock
        title="threads_manage_replies 說明欄"
        hint="對應畫面：告訴我們你申請 threads_manage_replies 的原因"
        text={PASTE_MANAGE_REPLIES}
      />
      <CopyBlock
        title="threads_keyword_search 說明欄"
        hint="你現在這頁就貼這段。最下面同意格要勾，再按繼續。"
        text={PASTE_KEYWORD_SEARCH}
      />
      <CopyBlock
        title="螢幕錄影旁白（中文）"
        hint="約 2–3 分鐘。要看得到網址列、登入、Threads 工作台、掃文或發送。"
        text={SCREENCAST_ZH}
      />
      <CopyBlock
        title="Screencast voiceover (English)"
        hint="審核員若看英文介面，同一支影片用這段即可。"
        text={SCREENCAST_EN}
      />
    </div>
  );
}

function DataTab() {
  return (
    <div>
      <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-primary)' }}>
        <strong style={{ fontSize: 14 }}>填表原則</strong>
        <p style={{ ...body, marginTop: 8 }}>
          法定名稱必須和商家驗證一字不差。到{' '}
          <External href={META_BUSINESS_VERIFY}>商家驗證</External>
          {' '}或商家專用設定 → 商家資訊複製。不要填品牌名。
        </p>
      </Card>

      <CopyBlock
        title="processor-0：是否有處理者／供應商可存取平台資料（含自己公司）"
        hint="選「是」。下一格列出法定公司名與子處理者。"
        text={`是

${PASTE_PROCESSORS}`}
      />
      <Shot
        src="/docs/meta/06-data-handling-processors.png"
        caption="資料處理第一題。選「是」，再列出自己公司與 Cloudflare、Neon、OpenAI。"
      />

      <CopyBlock
        title="responsible-1：誰負責 Meta 分享給你的平台資料"
        hint="只填商家驗證上的法定中文或英文公司全名，例如 ○○○有限公司。"
        text="（請貼商家驗證上的法定公司全名，不要填 Washgo / 匠管 / GO 行銷中心）"
      />
      <Shot
        src="/docs/meta/07-data-handling-controller.png"
        caption="資料控管者這一格。自然人、法人、公家機關都可以，我們填法人公司全名。"
      />
      <Shot
        src="/docs/meta/07b-data-controller-field.png"
        caption="同一題的輸入框特寫。中英文擇一，有「股份」就要寫股份。"
      />

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>國家／實體類型</strong>
        <ul style={list}>
          <li>國家：Taiwan／台灣</li>
          <li>類型：法人</li>
        </ul>
      </Card>

      <CopyBlock
        title="requestso-3：過去 12 個月是否因國家安全把用戶資料交給公家機關"
        hint="選「否」。這題不含刑事調查或法院命令。"
        text="否"
      />
      <Shot
        src="/docs/meta/08-data-handling-national-security.png"
        caption="國家安全揭露選「否」。"
      />

      <Card>
        <strong style={{ fontSize: 14 }}>其他資料處理對照（若後續還問）</strong>
        <ul style={list}>
          <li>誰能使用：僅品牌授權員工，不是公開下載的消費 App</li>
          <li>向使用者收集：管理者登入帳密；經授權的 Threads 使用者 ID、帳號名稱、access token</li>
          <li>從 Threads API 讀：公開貼文 ID、原文、作者帳號、permalink；自己貼文的留言；發布結果</li>
          <li>是否賣給第三方／廣告再行銷：否</li>
          <li>Token：AES-256-GCM 加密後存資料庫，僅後端解密</li>
          <li>保存：帳號連接期間；搜尋快照僅供檢視所需期間；生成圖片最多 31 天</li>
          <li>撤銷：Threads「設定 → 帳號 → 網站權限」移除，或來信 {CONTACT}</li>
        </ul>
      </Card>
    </div>
  );
}

function BrandTab({ slug }: { slug: string }) {
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>過審後：現有品牌（Washgo／Homigo／TaskGo）</strong>
        <ol style={list}>
          <li>到 Meta App 確認 <code>threads_keyword_search</code>、<code>threads_manage_replies</code> 已是進階存取／Live。</li>
          <li>在該品牌「<Link to={`/${slug}/social`}>社群帳號</Link>」重新走 Threads 授權視窗。</li>
          <li>權限一定要勾 <code>threads_basic</code>、<code>threads_content_publish</code>、<code>threads_keyword_search</code>、<code>threads_manage_replies</code>。成效再加 <code>threads_manage_insights</code>。</li>
          <li>換成 60 天長效 token，貼回本系統，按「測試連線」。</li>
          <li>到「<Link to={`/${slug}/threads`}>Threads 工作台</Link>」按「立即掃文」。能看到別人的公開文，回覆佇列才會開始有東西。</li>
        </ol>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>之後再接一個新品牌</strong>
        <p style={{ ...body, marginTop: 8 }}>
          不要新開 Meta App，繼續用 WashgoMarketing（<code>{APP_ID}</code>）。App Review 過一次，三品牌共用。
        </p>
        <ol style={list}>
          <li>在本系統設定裡為新品牌建立登入帳號，並指定可管理的品牌。</li>
          <li>開發模式期間：把該品牌 Threads 帳號加進 App 測試人員，對方要在手機 Threads「設定 → 帳號 → 網站權限」接受邀請。</li>
          <li>走同一套授權視窗，勾齊上面五個權限，換長效 token。</li>
          <li>到該品牌「社群帳號」貼 token、測連線。自動回覆預設關，先走工作台人工按「發」。</li>
          <li>到期安全網、每小時／每日回覆上限依品牌再調。建議先 3–5／10–15。</li>
        </ol>
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>還不能掃到別人的文時</strong>
        <ul style={list}>
          <li>測試連線若寫「只能搜到自己的文」＝ App Review 還沒過，或 token 沒勾 keyword search。</li>
          <li>權限已過但佇列仍空：token 是過審前發的，必須重新授權。</li>
          <li>行程表出現 <code>API access blocked</code>：先完成開發者帳號驗證，確認發文帳號是測試人員或 App 已 Live。</li>
        </ul>
      </Card>
    </div>
  );
}

function MediaTab() {
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>送審錄影：Threads 工作台自動發文</strong>
        <p style={{ ...muted, marginTop: 6 }}>
          來源：桌面「Threads自動發文影片.mov」（2026-09-15）。可直接上傳到 keyword search／manage replies 的「上傳播放檔案」。
        </p>
        <video
          controls
          preload="metadata"
          src="/docs/meta/threads-desk-screencast.mp4"
          style={{ ...shot, background: '#111' }}
        />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>設定過程螢幕錄影</strong>
        <p style={{ ...muted, marginTop: 6 }}>
          來源：桌面「螢幕錄影 2026-09-14 上午11.16.21.mov」。保留作申請動作對照，不一定要再傳給 Meta。
        </p>
        <video
          controls
          preload="metadata"
          src="/docs/meta/threads-setup-screencast.mp4"
          style={{ ...shot, background: '#111' }}
        />
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>本次送審截圖</strong>
        <p style={{ ...muted, marginTop: 6, marginBottom: 12 }}>
          都存在 <code>/docs/meta/</code>，之後對表單時對這幾張即可。
        </p>
        <Shot src="/docs/meta/01-keyword-search-requirements.png" caption="keyword_search 要求清單（測試已綠、檢閱還灰）" />
        <Shot src="/docs/meta/02-manage-replies-requirements.png" caption="manage_replies 當時使用量 0" />
        <Shot src="/docs/meta/03-threads-permissions-tested.png" caption="Threads 使用案例五權限測試完成" />
        <Shot src="/docs/meta/04-manage-replies-justification.png" caption="manage_replies 申請原因頁" />
        <Shot src="/docs/meta/05-keyword-search-justification.png" caption="keyword_search 申請原因頁（你正在填的）" />
        <Shot src="/docs/meta/06-data-handling-processors.png" caption="資料處理：處理者／供應商" />
        <Shot src="/docs/meta/07-data-handling-controller.png" caption="資料處理：資料控管者" />
        <Shot src="/docs/meta/08-data-handling-national-security.png" caption="資料處理：國家安全揭露" />
      </Card>
    </div>
  );
}
