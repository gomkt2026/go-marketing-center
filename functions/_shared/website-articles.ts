import type { Env } from './env';
import { getSql } from './db';
import { encryptToken, decryptToken } from './crypto';

export type WebsiteCategory = 'pain' | 'product' | 'policy' | 'trust' | 'talk';
export type WebsiteAudience = 'consumer' | 'merchant';
export type WebsiteSearchIntent = 'informational' | 'solution';

export interface WebsiteFaq {
  question: string;
  answer: string;
}

export interface WebsiteSeoMeta {
  slug: string;
  title?: string;
  description?: string;
  seo_title: string;
  seo_description: string;
  primary_keyword: string;
  related_terms: string[];
  search_intent: WebsiteSearchIntent;
  category: WebsiteCategory;
  audience?: WebsiteAudience;
  answer_box: string;
  faq: WebsiteFaq[];
  tags?: string[];
  author?: string;
  cover_image_url?: string | null;
  og_image_url?: string | null;
  pillar?: string;
  brand_version_id?: string;
  market_signal_id?: string | null;
  public_url?: string;
  keywords?: string[];
  canonicalHint?: string;
  schema_recommendation?: string[];
  internal_links?: { anchor: string; href: string }[];
  editorial_qa?: string[];
}

export interface WebsiteArticlePayload {
  external_id: string;
  slug: string;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  primary_keyword: string;
  related_terms: string[];
  search_intent: WebsiteSearchIntent;
  category: WebsiteCategory;
  audience?: WebsiteAudience;
  answer_box: string;
  body_md: string;
  faq: WebsiteFaq[];
  cta: string;
  status: 'published';
  published_at: string;
  cover_image_url?: string | null;
  og_image_url?: string | null;
  tags?: string[];
  author?: string;
  market_signal_id?: string | null;
  brand_version_id?: string;
  pillar?: string;
}

export interface WebsiteDestination {
  brandId: string;
  slug: string;
  blogBaseUrl: string;
  ingestBaseUrl: string;
  hasIngestKey: boolean;
  ingestKeyEnc: string | null;
}

/** 官網 SEO 長文正文（不含答案區與 FAQ）。三品牌 ingest 都要求 800–1800 字。 */
export const WEBSITE_BODY_MIN_CHARS = 800;
export const WEBSITE_BODY_MAX_CHARS = 1800;
/** 自動補文時多留一點，避免卡在 800 字邊界。 */
const WEBSITE_BODY_TARGET_CHARS = 900;

const DEFAULT_DESTINATIONS: Record<string, { blogBaseUrl: string; ingestBaseUrl: string }> = {
  homigo: {
    blogBaseUrl: 'https://www.homigo.com.tw',
    ingestBaseUrl: 'https://housego-api.homigo.workers.dev',
  },
  taskgo: {
    blogBaseUrl: 'https://dev.taskgo.com.tw',
    ingestBaseUrl: 'https://api.dev.taskgo.com.tw',
  },
  washgo: {
    blogBaseUrl: 'https://washgo.com.tw',
    ingestBaseUrl: 'https://washgo-api.washgotaskgo.workers.dev',
  },
};

const SLUG_RE = /^[a-z0-9-]{3,80}$/;
const CATEGORIES: WebsiteCategory[] = ['pain', 'product', 'policy', 'trust', 'talk'];

export function isWebsiteSeoContent(content: {
  contentType?: string | null;
  content_type?: string | null;
  targetPlatform?: string | null;
  target_platform?: string | null;
}): boolean {
  const type = content.contentType ?? content.content_type;
  const platform = content.targetPlatform ?? content.target_platform;
  return type === 'article' && (platform === 'website' || !platform);
}

export function isMissingWebsiteArticleSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?(blog_base_url|ingest_base_url|ingest_key_enc)["']? does not exist/i.test(msg)
    || /invalid input value for enum publishing_platform: ["']?website["']?/i.test(msg);
}

export async function applyWebsiteArticleMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];
  try {
    await sql`ALTER TYPE publishing_platform ADD VALUE IF NOT EXISTS 'website'`;
    steps.push('enum:publishing_platform.website');
  } catch (e) {
    steps.push(`enum:skipped:${e instanceof Error ? e.message : 'failed'}`);
  }
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS blog_base_url TEXT`;
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS ingest_base_url TEXT`;
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS ingest_key_enc TEXT`;
  steps.push('columns:brands.blog_ingest');
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://www.homigo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://housego-api.homigo.workers.dev')
    WHERE slug = 'homigo'
  `;
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://dev.taskgo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://api.dev.taskgo.com.tw')
    WHERE slug = 'taskgo'
  `;
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://washgo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://washgo-api.washgotaskgo.workers.dev')
    WHERE slug = 'washgo'
  `;
  steps.push('seed:blog_ingest_urls');
  return steps;
}

export function websiteCta(slug: string, audience?: string | null): string {
  if (slug === 'homigo') {
    return '想把催繳、逾期與對帳放在同一處，加入 Homigo LINE 官方帳號 @933pdush，免費開始、不綁信用卡。';
  }
  if (slug === 'taskgo') {
    return '想把打卡、排班與請款放在同一處，免費試用 TaskGo 14 天（不綁信用卡），或加入 LINE 官方帳號 @taskgo。';
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return '想了解洗衣店怎麼用同一套流程管訂單與門市，請來信 hello@washgo.com.tw。';
  }
  if (slug === 'washgo') {
    return '想把到府收衣服、線上報價和衣物追蹤放在同一處，加入 Washgo LINE 官方帳號 @washgo，加入即可下單。';
  }
  return `想了解更多，歡迎到${websiteAuthor(slug)}官網閱讀完整說明，或來信 Service@inforcraft.com.tw。`;
}

export function websiteCtaRule(slug: string, audience?: string | null): string {
  if (slug === 'homigo') {
    return '官網長文文末 CTA 必須含 LINE @933pdush。禁止把匠管信箱當主 CTA。禁止開頭先推 Homigo。';
  }
  if (slug === 'taskgo') {
    return '官網長文文末 CTA 必須含免費試用 14 天或 LINE @taskgo。禁止開頭先廣告。禁止「全台第一」。';
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return '業者文文末 CTA 必須含 hello@washgo.com.tw。禁止把後台登入當主 CTA。禁止洗車聯想。';
  }
  if (slug === 'washgo') {
    return '消費者文文末 CTA 必須含 @washgo 或 line.me/R/ti/p/@washgo。禁止洗車、未核實客戶數、保證不縮水。';
  }
  return '文末才放品牌與行動呼籲。';
}

export function websiteAuthor(slug: string): string {
  if (slug === 'homigo') return 'Homigo';
  if (slug === 'taskgo') return 'TaskGo';
  if (slug === 'washgo') return 'Washgo';
  return slug;
}

export function defaultWebsiteDestination(slug: string): { blogBaseUrl: string; ingestBaseUrl: string } | undefined {
  return DEFAULT_DESTINATIONS[slug];
}

export function ingestKeyFromEnv(env: Env, slug: string): string | undefined {
  if (slug === 'homigo') return env.HOMIGO_INGEST_KEY?.trim() || undefined;
  if (slug === 'taskgo') return env.TASKGO_INGEST_KEY?.trim() || undefined;
  if (slug === 'washgo') return env.WASHGO_INGEST_KEY?.trim() || undefined;
  return undefined;
}

async function resolveIngestKey(env: Env, dest: WebsiteDestination): Promise<string> {
  if (dest.ingestKeyEnc) return decryptToken(env, dest.ingestKeyEnc);
  const fromEnv = ingestKeyFromEnv(env, dest.slug);
  if (fromEnv) return fromEnv;
  throw new Error('尚未填入官網 ingest 金鑰（品牌智慧 → 官網長文目的地）');
}

export function ingestPutPath(slug: string): string {
  return slug === 'washgo'
    ? '/v1/integrations/gomarketing/articles'
    : '/api/integrations/gomarketing/articles';
}

export function ingestUnpublishPath(slug: string, externalId: string): string {
  const prefix = slug === 'washgo' ? '/v1' : '/api';
  return `${prefix}/integrations/gomarketing/articles/${encodeURIComponent(externalId)}/unpublish`;
}

export function zhCharCount(text: string): number {
  return Array.from((text || '').replace(/\s+/g, '')).length;
}

/**
 * 官網 ingest 的正文字數。
 * Homigo、TaskGo：trim 後每個字元都算，換行與空白也算。
 * Washgo：去掉所有空白再算。
 */
export function websiteBodyChars(text: string, slug?: string): number {
  const trimmed = (text || '').trim();
  if (slug === 'washgo') return Array.from(trimmed.replace(/\s+/g, '')).length;
  return Array.from(trimmed).length;
}

export function clipZh(text: string, max: number): string {
  const source = (text || '').replace(/\s+/g, ' ').trim();
  if (zhCharCount(source) <= max) return source;
  let out = '';
  let count = 0;
  for (const ch of source) {
    if (/\s/.test(ch)) {
      if (out) out += ch;
      continue;
    }
    if (count >= max) break;
    out += ch;
    count += 1;
  }
  return out.trim();
}

export function ensureZhRange(text: string, min: number, max: number, extras: string[] = []): string {
  let current = (text || '').replace(/\s+/g, ' ').trim();
  if (zhCharCount(current) > max) return clipZh(current, max);
  if (zhCharCount(current) >= min) return current;
  const FILLERS = [
    '做得到的做法有三：把該看的紀錄留在同一處、逾期或未完成自動提醒、對帳時項目對得上。',
    '少用人追、少用試算表重抄，每天只要看一眼有沒有還沒做完的事。',
    '流程寫下來、每次留時間與內容，才不會口頭對口頭。',
  ];
  for (const extra of [...extras, ...FILLERS]) {
    const piece = (extra || '').replace(/\s+/g, ' ').trim();
    if (!piece) continue;
    if (current.includes(piece)) continue;
    const glue = !current ? '' : /[。！？、，；]$/.test(current) ? '' : '。';
    current = `${current}${glue}${piece}`;
    if (zhCharCount(current) >= min) return clipZh(current, max);
  }
  return clipZh(current, max);
}

function tidyWebsiteBody(body: string): string {
  return (body || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipBodyToBrand(body: string, slug: string): string {
  let current = tidyWebsiteBody(body);
  if (websiteBodyChars(current, slug) <= WEBSITE_BODY_MAX_CHARS) return current;
  const parts = current.split(/\n{2,}/);
  while (parts.length > 1 && websiteBodyChars(parts.join('\n\n'), slug) > WEBSITE_BODY_MAX_CHARS) {
    parts.pop();
  }
  current = parts.join('\n\n').trim();
  if (websiteBodyChars(current, slug) <= WEBSITE_BODY_MAX_CHARS) return current;
  if (slug === 'washgo') return clipZh(current, WEBSITE_BODY_MAX_CHARS);
  return Array.from(current).slice(0, WEBSITE_BODY_MAX_CHARS).join('').trim();
}

function appendBodyBlock(current: string, block: string, slug: string): string | null {
  const piece = block.trim();
  if (!piece) return current;
  const marker = piece.slice(0, 18);
  if (marker && current.includes(marker)) return current;
  const next = current ? `${current}\n\n${piece}` : piece;
  if (websiteBodyChars(next, slug) > WEBSITE_BODY_MAX_CHARS) return null;
  return next;
}

/** 依該品牌官網的字數算法，把正文收進 800–1800。過長先截，過短再補可核實的段落。 */
export function ensureWebsiteBody(
  body: string,
  params: {
    slug: string;
    topic: string;
    angle?: string;
    primaryKeyword?: string;
    relatedTerms?: string[];
    audience?: string | null;
  },
): string {
  const slug = params.slug;
  let current = clipBodyToBrand(body, slug);
  const count = () => websiteBodyChars(current, slug);
  const headingCount = (text: string) => (text.match(/^##\s+\S/gm) ?? []).length;

  const keyword = (params.primaryKeyword || params.topic || '這件事').replace(/\s+/g, ' ').trim();
  const angle = (params.angle || '').replace(/\s+/g, ' ').trim();
  const terms = (params.relatedTerms ?? []).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 2).slice(0, 6);
  const checklist = terms.length
    ? terms.map((term) => `- ${term}：先看紀錄現在在哪、誰會知道沒做完、下次對帳能不能對上。`).join('\n')
    : '- 先把現在用的表格、聊天紀錄和口頭交代列出來，再決定哪一段要留在同一個地方。';
  const supplements = [
    [
      `## ${keyword}實際會卡在哪`,
      angle || '多數人不是不會做，而是同一件事分在聊天室、表格和口頭交代，下次對不上。',
      '先問三件事：這筆記錄現在在哪、逾期或未完成誰會知道、月底對帳時項目能不能對上。對不上的時候，再考慮要不要換工具，不要一開始就整套重來。',
    ].join('\n\n'),
    [
      '## 開始前可以先核對',
      checklist,
      '核對完再把提醒改到同一個管道。做得到的做法是：該看的紀錄留在同一處、未完成會被看到、對帳時項目對得上。',
    ].join('\n\n'),
    websiteBodyCloser(slug, params.audience),
  ];

  if (!(count() >= WEBSITE_BODY_MIN_CHARS && headingCount(current) >= 3)) {
    for (const section of supplements) {
      if (count() >= WEBSITE_BODY_MIN_CHARS && headingCount(current) >= 3) break;
      const next = appendBodyBlock(current, section, slug);
      if (next == null) break;
      current = next;
    }
  }
  for (const piece of websiteBodyPads(slug, params.audience)) {
    if (count() >= WEBSITE_BODY_TARGET_CHARS) break;
    const next = appendBodyBlock(current, piece, slug);
    if (next == null) break;
    current = next;
  }
  if (count() < WEBSITE_BODY_TARGET_CHARS) {
    const next = appendBodyBlock(
      current,
      '若還沒對過一次，就先列出帳單、進度與通知現在各放在哪。三項都留在同一筆之後，再決定要不要改流程。沒有把握的客戶數、滿意度與保證成效，都不要寫成已經發生的事。',
      slug,
    );
    if (next) current = next;
  }
  if (count() > WEBSITE_BODY_MAX_CHARS) current = clipBodyToBrand(current, slug);
  return current;
}

function websiteBodyPads(slug: string, audience?: string | null): string[] {
  if (slug === 'homigo') {
    return [
      '催繳可以先看這一期還沒付的帳單，再決定要不要發 LINE 通知。通知只講金額與截止日，不要把所有歷史一次洗版。逾期幾天、有沒有部分付款，都留在同一筆紀錄裡，下次對帳才對得上。',
      '報修則把房客回報、照片與目前進度放在同一筆。房東不用在聊天室翻「修好了沒」，房客也看得到處理到哪一步。結案時留下時間與照片，之後退租或押金爭議才有得對。',
      '合約與點交照片分開存，到期前提醒續約或退租。押金怎麼算仍以契約為準，系統只幫你把入住、修繕與繳款紀錄留在同一個地方，不代替法律判斷，也不保證收租率。',
      '入住之後，催繳、報修與續約查的是同一間房。房東看得到哪一期還沒付、修到哪一步、合約何時到期，不用在三個聊天室各翻一次。系統只把這些紀錄留在一起，不代替契約，也不保證每一期都收得到。',
      '下一期帳單開出去之前，先看上一期有沒有部分付款，以及還在修的項目。兩邊各記各的，催繳時就容易把已經處理過的事再問一次。',
    ];
  }
  if (slug === 'taskgo') {
    return [
      '派工當天先看誰被排到哪個案場、有沒有打卡。沒到的人要能從名單裡看出來，而不是等師傅回覆聊天室。出勤、定位與照片是為了讓現場和請款對得上，不是用來監控員工。',
      '施工回報至少留下做了什麼、拍了哪裡、誰簽名。浮水印照片和簽名之後才能拿來對帳。月底才發現案子賠錢，通常是因為這些紀錄散在不同群組，而不是因為沒有人做事。',
      '請款時把打卡、回報與成本放在同一處對。對不上的項目先標出來，不要先保證幾天內入帳，也不要寫成接案量會因此增加。TaskGo 只把現場已經發生的事留成可以回查的紀錄。',
      '隔天打開同一個案子，要能看出誰去過、做了什麼、請款卡在哪一項。這些是給現場和會計對帳用的，不是考勤排名，也不用來承諾師傅一定收得到款。',
      '換人接手時，不要靠上一個人的記憶。案子上要留得到場時間、施工內容和還沒請的項目，下一個人才接得下去。',
    ];
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return [
      '店裡可以先改收件這一段：手寫單改成雲端訂單，品項、洗標與報價留在同一筆。關店對帳時不用再翻紙本。沒有寫在訂單上的客戶數、門市數或滿意度，都不要當成事實。',
      '門市和洗廠之間的衣物調撥，用任務而不是群組訊息。司機取件、簽收與回貨要能對到原來那一筆訂單。Washgo 是衣物洗滌，不是洗車，也不保證布料不縮水。',
      '客人問衣服洗到哪，店主要能回答現在在門市、在途中還是在洗廠。這個節點來自訂單紀錄，不是事後回想。客戶與門市員工都不必另外下載 App。',
      '關店前先對今天收進來的件數、還在洗廠的件數，以及客人已經能取的件數。對不上的那幾件先標出來，不要用未核實的門市數或滿意度把缺口補上。',
      '隔天開店先看昨天沒取走的衣服還在不在架上。在的話，訂單狀態就不要改成已完成，免得客人來問時對不上。',
    ];
  }
  if (slug === 'washgo') {
    return [
      '送洗前先看洗標，線上報價確認後才洗。羽絨、大衣或容易縮水的材質，不要自己保證洗完跟新的一樣。到府收送是為了避開洗衣店上班時間，不是把店裡的流程省略掉。',
      '衣服走出門之後，要能在 LINE 看到收到、清洗、可取件這幾個節點。問「洗到哪了」時，答案來自這筆記錄，而不是請店家再翻一次單。Washgo 是衣物洗滌，不是洗車。',
      '週末衣服堆在家、平日店沒開，是到府收送要處理的情境。取件範圍、時段與報價以當次訂單為準。不要寫未核實的客戶數，也不要寫保證不縮水。',
      '取件之後若要改時間或改地址，以這一筆訂單上的紀錄為準，不要只留在聊天室。洗標看不懂、材質容易縮水時，先在報價裡寫清楚，洗完再爭執就來不及。',
      '衣服回到手上，先對一下訂單寫的品項和實際收到的是不是同一件。不一樣就先記在這一筆，不要等洗完才發現送錯。',
    ];
  }
  return [
    '先把紀錄現在放在哪裡寫下來：表格、聊天室，還是口頭交代。沒做完的事要有人看得到，月底對帳時項目要對得上。不確定的數字不要寫成事實。',
  ];
}

function websiteBodyCloser(slug: string, audience?: string | null): string {
  if (slug === 'homigo') {
    return [
      '## 紀錄放回同一處之後',
      'Homigo 把收租、報修與合約留在同一個地方：帳單與逾期看得到，修繕進度可以回查，租約與點交照片不會只留在聊天室。',
      '它不保證收租率，也不代替租賃契約的法律判斷。適合不想再用試算表和 LINE 群追每一間房子的房東或代管。',
    ].join('\n\n');
  }
  if (slug === 'taskgo') {
    return [
      '## 現場回報怎麼對上請款',
      'TaskGo 把打卡、排班、施工回報和請款留在同一處。現場照片、簽名與出勤可以回查，月底才不會只靠聊天紀錄翻進度。',
      '定位與照片是為了讓出勤和施工對得上，不是用來監控員工。它不保證接案量，也不保證請款一定準時入帳。',
    ].join('\n\n');
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return [
      '## 店裡可以先改哪一段',
      '洗衣店可以把手寫單改成雲端訂單，門市與洗廠的流轉留在後台，司機任務與簽收也不必再翻群組。客戶與門市員工都不必另外下載 App。',
      'Washgo 是衣物洗滌，不是洗車。不要把未核實的客戶數、門市數或滿意度寫成事實。',
    ].join('\n\n');
  }
  if (slug === 'washgo') {
    return [
      '## 衣服送洗前可以先確認',
      'Washgo 是衣物洗滌與到府收送，不是洗車。送洗前先看洗標，線上報價確認後才洗，衣物走到哪個節點可以在 LINE 回查。',
      '它不保證布料不縮水，也不用未核實的客戶數當證據。週末洗衣店沒開、衣服堆在家，是這套收送要解決的情境。',
    ].join('\n\n');
  }
  return [
    '## 先留紀錄再決定要不要換工具',
    '把現在散落的表格、聊天與口頭交代收成可以回查的紀錄。不確定的數字、客戶數與保證成效都不要寫成事實。',
  ].join('\n\n');
}

function bodySentences(bodyMd: string): string[] {
  return (bodyMd || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`]/g, ' ')
    .split(/[。！？\n]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => zhCharCount(s) >= 12 && !/^faq$/i.test(s));
}

function extractFaqFromMarkdown(bodyMd: string): WebsiteFaq[] {
  const text = bodyMd || '';
  const out: WebsiteFaq[] = [];
  const bold = /\*\*([^*]{6,80}[？?])\*\*\s*\n+([^#*]+?)(?=\n\s*\*\*|\n\s*##|$)/g;
  let match: RegExpExecArray | null;
  while ((match = bold.exec(text)) && out.length < 5) {
    const question = match[1].trim();
    const answer = match[2].replace(/\s+/g, ' ').trim();
    if (question && answer) out.push({ question, answer });
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && out.length < 5; i += 1) {
    const hm = lines[i].match(/^#{2,3}\s+(.{6,80}[？?])\s*$/);
    if (!hm) continue;
    const question = hm[1].trim();
    const buf: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^#{2,3}\s+/.test(lines[j])) break;
      const line = lines[j].replace(/^[-*]\s+/, '').trim();
      if (line) buf.push(line);
      if (buf.join('').length > 80) break;
    }
    const answer = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (question && answer && !out.some((f) => f.question === question)) {
      out.push({ question, answer });
    }
  }
  return out.slice(0, 5);
}

const RELATED_FALLBACK: Record<string, string[]> = {
  homigo: ['收租', '對帳', '報修', '催繳', '逾期', 'LINE 通知', '房東', '房客', '合約', 'Excel'],
  taskgo: ['派工', '打卡', '排班', '請款', '工班', '案場', 'LINE 通知', '施工回報'],
  washgo: ['到府收送', '衣物追蹤', 'LINE 下單', '乾洗', '報價', '取件', '品管', '送洗履歷'],
};

function ensureRelatedTerms(existing: string[], slug: string, extras: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const term = raw.replace(/\s+/g, ' ').trim();
    const key = term.replace(/\s+/g, '');
    if (key.length < 2 || key.length > 20 || seen.has(key)) return;
    seen.add(key);
    out.push(term);
  };
  existing.forEach(add);
  extras.forEach(add);
  (RELATED_FALLBACK[slug] ?? RELATED_FALLBACK.homigo).forEach(add);
  return out.slice(0, 12);
}

function ensureFaq(faq: WebsiteFaq[], bodyMd: string, primary: string, description: string): WebsiteFaq[] {
  const merged: WebsiteFaq[] = [];
  const seen = new Set<string>();
  const add = (item: WebsiteFaq) => {
    const question = item.question.trim();
    const answer = item.answer.trim();
    if (!question || !answer) return;
    const key = question.replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ question, answer });
  };
  faq.forEach(add);
  extractFaqFromMarkdown(bodyMd).forEach(add);
  const templates: WebsiteFaq[] = [
    { question: `${primary}是什麼？`, answer: description || `${primary}是把日常流程留在同一處，讓催辦、對帳與進度可以回查。` },
    { question: `${primary}適合誰用？`, answer: '適合不想再用試算表或聊天室追進度的人。先把紀錄留在同一處，再決定要不要換工具。' },
    { question: `${primary}要怎麼開始？`, answer: '先看現在散落在哪：帳單、報修、通知。對得上之後，再把提醒改成同一管道。' },
  ];
  templates.forEach(add);
  return merged.slice(0, 5);
}

export function ensureWebsiteSeoMetaLengths(meta: WebsiteSeoMeta, fallbackTitle = '', bodyMd = '', slug = ''): WebsiteSeoMeta {
  const titleHint = fallbackTitle || meta.seo_title || meta.title || '';
  const sentences = bodySentences(bodyMd);
  const extras = [
    meta.answer_box,
    titleHint,
    meta.primary_keyword,
    (meta.related_terms || []).join('、'),
    ...sentences,
  ];
  const description = ensureZhRange(meta.description || meta.seo_description || '', 40, 160, extras);
  const seo_description = ensureZhRange(
    meta.seo_description || description,
    70,
    160,
    [description, meta.answer_box, titleHint, ...sentences],
  );
  const answer_box = ensureZhRange(
    meta.answer_box || description,
    80,
    150,
    [description, titleHint, meta.primary_keyword, ...sentences],
  );
  const seo_title = ensureZhRange(
    meta.seo_title || titleHint,
    12,
    60,
    [titleHint, meta.primary_keyword, '怎麼選、怎麼用一次看懂'],
  );
  const related_terms = ensureRelatedTerms(
    meta.related_terms || [],
    slug,
    [meta.primary_keyword, titleHint, ...sentences.slice(0, 4)],
  );
  const faq = ensureFaq(meta.faq || [], bodyMd, meta.primary_keyword || '這項服務', description);
  return {
    ...meta,
    description,
    seo_description,
    answer_box,
    related_terms,
    keywords: related_terms,
    faq,
    title: meta.title || seo_title,
    seo_title,
  };
}

export function sanitizeSlug(raw: string, fallback: string): string {
  const fromRaw = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  if (SLUG_RE.test(fromRaw)) return fromRaw;
  const fromFallback = fallback
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  if (SLUG_RE.test(fromFallback)) return fromFallback;
  return 'website-article';
}

function asCategory(value: unknown): WebsiteCategory {
  return CATEGORIES.includes(value as WebsiteCategory) ? value as WebsiteCategory : 'pain';
}

function asIntent(value: unknown): WebsiteSearchIntent {
  return value === 'informational' ? 'informational' : 'solution';
}

function asAudience(value: unknown): WebsiteAudience | undefined {
  if (value === 'merchant' || value === 'consumer') return value;
  return undefined;
}

function normalizeFaq(raw: unknown): WebsiteFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as { question?: string; answer?: string; q?: string; a?: string };
    return {
      question: String(row.question || row.q || '').trim(),
      answer: String(row.answer || row.a || '').trim(),
    };
  }).filter((f) => f.question && f.answer).slice(0, 5);
}

export function normalizeWebsiteSeoMeta(input: Partial<WebsiteSeoMeta> & Record<string, unknown>, slug: string): WebsiteSeoMeta {
  const relatedRaw = input.related_terms ?? input.relatedTerms ?? input.keywords;
  const related = Array.isArray(relatedRaw)
    ? relatedRaw.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const faq = normalizeFaq(input.faq);
  const primary = String(input.primary_keyword || input.primaryKeyword || related[0] || '').trim() || '服務說明';
  const seoTitle = String(input.seo_title || input.seoTitle || input.title || '').trim();
  const listDesc = String(input.description || '').trim();
  const seoDesc = String(input.seo_description || input.seoDescription || '').trim();
  const articleSlug = sanitizeSlug(String(input.slug || ''), primary);
  return ensureWebsiteSeoMetaLengths({
    slug: articleSlug,
    title: seoTitle,
    description: listDesc || seoDesc,
    seo_title: seoTitle,
    seo_description: seoDesc || listDesc,
    primary_keyword: primary.slice(0, 20),
    related_terms: related.slice(0, 12),
    search_intent: asIntent(input.search_intent || input.searchIntent),
    category: asCategory(input.category),
    audience: slug === 'washgo' ? (asAudience(input.audience) ?? 'consumer') : asAudience(input.audience),
    answer_box: String(input.answer_box || input.answerBox || '').trim(),
    faq,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t)).slice(0, 8) : undefined,
    author: String(input.author || websiteAuthor(slug)),
    cover_image_url: typeof input.cover_image_url === 'string' ? input.cover_image_url : (typeof input.coverImageUrl === 'string' ? input.coverImageUrl : null),
    og_image_url: typeof input.og_image_url === 'string' ? input.og_image_url : (typeof input.ogImageUrl === 'string' ? input.ogImageUrl : null),
    pillar: input.pillar ? String(input.pillar) : undefined,
    brand_version_id: input.brand_version_id ? String(input.brand_version_id) : (input.brandVersionId ? String(input.brandVersionId) : undefined),
    market_signal_id: input.market_signal_id ? String(input.market_signal_id) : (input.marketSignalId ? String(input.marketSignalId) : null),
    public_url: input.public_url ? String(input.public_url) : (input.publicUrl ? String(input.publicUrl) : undefined),
    keywords: related.slice(0, 12),
    canonicalHint: input.canonicalHint ? String(input.canonicalHint) : `/blog/${articleSlug}`,
    schema_recommendation: Array.isArray(input.schema_recommendation)
      ? input.schema_recommendation.map((t) => String(t)).slice(0, 6)
      : ['Article', 'FAQPage'],
    internal_links: Array.isArray(input.internal_links)
      ? (input.internal_links as { anchor?: string; href?: string }[])
        .map((l) => ({ anchor: String(l.anchor || '').trim(), href: String(l.href || '').trim() }))
        .filter((l) => l.anchor && l.href)
        .slice(0, 6)
      : undefined,
    editorial_qa: Array.isArray(input.editorial_qa)
      ? input.editorial_qa.map((t) => String(t)).filter(Boolean).slice(0, 8)
      : undefined,
  }, seoTitle, '', slug);
}

/** policy 必須綁市場情報；沒有來源 signal 的文章改為 talk，避免官網 ingest 拒收。 */
export function reconcilePolicyCategory(seoMeta: WebsiteSeoMeta, fallbackSignalId?: string | null): WebsiteSeoMeta {
  if (seoMeta.category !== 'policy' || seoMeta.market_signal_id) return seoMeta;
  if (fallbackSignalId) return { ...seoMeta, market_signal_id: fallbackSignalId };
  return { ...seoMeta, category: 'talk' };
}

export function validateWebsitePayload(params: {
  slug: string;
  title: string;
  description: string;
  seoMeta: WebsiteSeoMeta;
  bodyMd: string;
  cta: string;
}): string[] {
  const errors: string[] = [];
  const { seoMeta, bodyMd, cta, title, description } = params;
  if (!SLUG_RE.test(seoMeta.slug)) errors.push('slug 須為 3–80 字元小寫英文、數字、連字號');
  const titleLen = zhCharCount(title);
  const descLen = zhCharCount(description);
  const seoDescLen = zhCharCount(seoMeta.seo_description);
  const answerLen = zhCharCount(seoMeta.answer_box);
  if (titleLen < 12 || titleLen > 60) errors.push(`title 須 12–60 字（目前 ${titleLen}）`);
  if (descLen < 40 || descLen > 160) errors.push(`description 須 40–160 字（目前 ${descLen}）`);
  if (seoDescLen < 70 || seoDescLen > 160) errors.push(`seo_description 須 70–160 字（目前 ${seoDescLen}）`);
  if (!seoMeta.primary_keyword || seoMeta.primary_keyword.length < 2) errors.push('須有主關鍵字');
  if (seoMeta.related_terms.length < 6) errors.push('related_terms 至少 6 個');
  if (answerLen < 80 || answerLen > 150) {
    errors.push(`answer_box 須 80–150 字（目前 ${answerLen}）`);
  }
  const bodyLen = websiteBodyChars(bodyMd, params.slug);
  if (bodyLen < WEBSITE_BODY_MIN_CHARS || bodyLen > WEBSITE_BODY_MAX_CHARS) {
    const how = params.slug === 'washgo' ? '不含空白' : '含換行';
    errors.push(`body_md 須 ${WEBSITE_BODY_MIN_CHARS}–${WEBSITE_BODY_MAX_CHARS} 字（目前 ${bodyLen}，${how}）`);
  }
  if (new TextEncoder().encode(bodyMd).length > 50 * 1024) errors.push('body_md 過長');
  if (seoMeta.faq.length < 3) errors.push('FAQ 至少 3 題');
  if (seoMeta.category === 'policy' && !seoMeta.market_signal_id) {
    errors.push('政策時事文必須綁 market_signal_id');
  }
  if (params.slug === 'homigo' && !/@933pdush|lin\.ee/i.test(cta)) {
    errors.push('Homigo CTA 須含 @933pdush');
  }
  if (params.slug === 'taskgo' && !(/@taskgo/i.test(cta) || /試用/.test(cta))) {
    errors.push('TaskGo CTA 須含免費試用或 @taskgo');
  }
  if (params.slug === 'washgo') {
    if (seoMeta.audience === 'merchant') {
      if (!/hello@washgo\.com\.tw/i.test(cta)) errors.push('業者 CTA 須含 hello@washgo.com.tw');
    } else if (!/@washgo|line\.me\/R\/ti\/p\/@washgo/i.test(cta)) {
      errors.push('消費者 CTA 須含 @washgo');
    }
    if (/洗車|汽車美容|車體鍍膜/.test(`${title}${bodyMd}${seoMeta.answer_box}`)) {
      errors.push('Washgo 文不得出現洗車聯想');
    }
  }
  return errors;
}

export async function loadWebsiteDestination(env: Env, brandId: string): Promise<WebsiteDestination | null> {
  const sql = getSql(env);
  const run = () => sql`
    SELECT id, slug, blog_base_url, ingest_base_url, ingest_key_enc
    FROM brands WHERE id = ${brandId}::uuid LIMIT 1
  `;
  let rows;
  try {
    rows = await run();
  } catch (e) {
    if (!isMissingWebsiteArticleSchema(e)) throw e;
    await applyWebsiteArticleMigration(env);
    rows = await run();
  }
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; slug: string; blog_base_url: string | null;
    ingest_base_url: string | null; ingest_key_enc: string | null;
  };
  const fallback = DEFAULT_DESTINATIONS[row.slug];
  return {
    brandId: row.id,
    slug: row.slug,
    blogBaseUrl: (row.blog_base_url || fallback?.blogBaseUrl || '').replace(/\/$/, ''),
    ingestBaseUrl: (row.ingest_base_url || fallback?.ingestBaseUrl || '').replace(/\/$/, ''),
    hasIngestKey: Boolean(row.ingest_key_enc) || Boolean(ingestKeyFromEnv(env, row.slug)),
    ingestKeyEnc: row.ingest_key_enc,
  };
}

export function publicArticleUrl(blogBaseUrl: string, articleSlug: string): string {
  return `${blogBaseUrl.replace(/\/$/, '')}/blog/${articleSlug}`;
}

export function buildWebsitePayload(params: {
  contentId: string;
  title: string;
  bodyMd: string;
  cta: string;
  seoMeta: WebsiteSeoMeta;
  publishedAt?: string;
}): WebsiteArticlePayload {
  const meta = params.seoMeta;
  const payload: WebsiteArticlePayload = {
    external_id: params.contentId,
    slug: meta.slug,
    title: params.title,
    description: meta.description || meta.seo_description,
    seo_title: meta.seo_title || params.title,
    seo_description: meta.seo_description || meta.description || '',
    primary_keyword: meta.primary_keyword,
    related_terms: meta.related_terms,
    search_intent: meta.search_intent,
    category: meta.category,
    answer_box: meta.answer_box,
    body_md: params.bodyMd,
    faq: meta.faq,
    cta: params.cta,
    status: 'published',
    published_at: params.publishedAt || new Date().toISOString(),
  };
  if (meta.author) payload.author = meta.author;
  if (meta.audience) payload.audience = meta.audience;
  if (meta.cover_image_url) payload.cover_image_url = meta.cover_image_url;
  if (meta.og_image_url || meta.cover_image_url) {
    payload.og_image_url = meta.og_image_url || meta.cover_image_url || undefined;
  }
  if (meta.tags?.length) payload.tags = meta.tags;
  if (meta.market_signal_id) payload.market_signal_id = meta.market_signal_id;
  if (meta.brand_version_id) payload.brand_version_id = meta.brand_version_id;
  if (meta.pillar) payload.pillar = meta.pillar;
  return payload;
}

interface IngestOk {
  success: true;
  article: { external_id: string; slug: string; status: string; public_url: string };
}

async function ingestFetch(params: {
  dest: WebsiteDestination;
  key: string;
  method: 'PUT' | 'POST';
  path: string;
  body?: unknown;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = `${params.dest.ingestBaseUrl}${params.path}`;
  const res = await fetch(url, {
    method: params.method,
    headers: {
      'content-type': 'application/json',
      'X-Go-Marketing-Key': params.key,
      Authorization: `Bearer ${params.key}`,
      'X-Api-Key': params.key,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { status: res.status, json };
}

export async function publishWebsiteArticle(
  env: Env,
  dest: WebsiteDestination,
  payload: WebsiteArticlePayload,
): Promise<IngestOk> {
  if (!dest.ingestBaseUrl) throw new Error('尚未設定官網 ingest 網址');
  const key = await resolveIngestKey(env, dest);
  const { status, json } = await ingestFetch({
    dest,
    key,
    method: 'PUT',
    path: ingestPutPath(dest.slug),
    body: payload,
  });
  if (status === 401) throw new Error('官網 ingest 金鑰不正確（401）');
  if (status === 409) throw new Error(String(json.error || 'slug 已被另一篇文章使用（409）'));
  if (status === 404) throw new Error('找不到 ingest 路徑，請確認對方 API 已上線');
  if (status >= 400) {
    throw new Error(String(json.error || `官網 ingest 失敗（${status}）`));
  }
  const article = (json.article ?? {}) as Record<string, unknown>;
  const publicUrl = String(article.public_url || publicArticleUrl(dest.blogBaseUrl, payload.slug));
  return {
    success: true,
    article: {
      external_id: String(article.external_id || payload.external_id),
      slug: String(article.slug || payload.slug),
      status: String(article.status || 'published'),
      public_url: publicUrl,
    },
  };
}

export async function unpublishWebsiteArticle(
  env: Env,
  dest: WebsiteDestination,
  externalId: string,
): Promise<void> {
  const key = await resolveIngestKey(env, dest);
  const { status, json } = await ingestFetch({
    dest,
    key,
    method: 'POST',
    path: ingestUnpublishPath(dest.slug, externalId),
  });
  if (status === 401) throw new Error('官網 ingest 金鑰不正確（401）');
  if (status === 404) throw new Error('對方找不到這篇文章（404）');
  if (status >= 400) throw new Error(String(json.error || `下架失敗（${status}）`));
}

export async function testWebsiteIngest(env: Env, dest: WebsiteDestination): Promise<{ ok: boolean; message: string }> {
  if (!dest.ingestBaseUrl) return { ok: false, message: '尚未設定 ingest 網址' };
  let key: string;
  try {
    key = await resolveIngestKey(env, dest);
  } catch {
    return { ok: false, message: '尚未填入 ingest 金鑰' };
  }
  try {
    const { status, json } = await ingestFetch({
      dest,
      key,
      method: 'POST',
      path: ingestUnpublishPath(dest.slug, 'go-marketing-ingest-ping'),
    });
    if (status === 401) return { ok: false, message: '金鑰被拒（401）。請向對方確認 X-Go-Marketing-Key。' };
    if (status === 404) return { ok: true, message: '連線成功：金鑰可用，ingest 路徑已通（測試 id 不存在是正常的）。' };
    if (status < 400) return { ok: true, message: '連線成功。' };
    return { ok: false, message: String(json.error || `對方回 ${status}`) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '連線失敗' };
  }
}

export async function saveBrandWebsiteDestination(
  env: Env,
  brandId: string,
  body: {
    blogBaseUrl?: string | null;
    ingestBaseUrl?: string | null;
    ingestKey?: string | null;
  },
): Promise<void> {
  const sql = getSql(env);
  const blog = body.blogBaseUrl?.trim() || undefined;
  const ingest = body.ingestBaseUrl?.trim() || undefined;
  const keyEnc = body.ingestKey?.trim()
    ? await encryptToken(env, body.ingestKey.trim())
    : undefined;

  const run = async () => {
    if (blog !== undefined && ingest !== undefined && keyEnc !== undefined) {
      await sql`
        UPDATE brands SET
          blog_base_url = ${blog}, ingest_base_url = ${ingest}, ingest_key_enc = ${keyEnc}, updated_at = now()
        WHERE id = ${brandId}::uuid
      `;
      return;
    }
    if (blog !== undefined && ingest !== undefined) {
      await sql`
        UPDATE brands SET blog_base_url = ${blog}, ingest_base_url = ${ingest}, updated_at = now()
        WHERE id = ${brandId}::uuid
      `;
      return;
    }
    if (blog !== undefined) {
      await sql`UPDATE brands SET blog_base_url = ${blog}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
    if (ingest !== undefined) {
      await sql`UPDATE brands SET ingest_base_url = ${ingest}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
    if (keyEnc !== undefined) {
      await sql`UPDATE brands SET ingest_key_enc = ${keyEnc}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
  };

  try {
    await run();
  } catch (e) {
    if (!isMissingWebsiteArticleSchema(e)) throw e;
    await applyWebsiteArticleMigration(env);
    await run();
  }
}
