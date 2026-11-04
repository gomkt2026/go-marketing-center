/**
 * IG 圖文的觸及檢查。
 * 做法來自 Jake Schincariol / instagram-agent-skill（MIT）：
 * 摺疊前那一行、最多 5 個 hashtag、鉤子評分、人話清理、留言不代發、
 * 用「相對自己帳號中位數的倍數」看爆文，不看原始曝光。
 * 詞庫與門檻改成台灣繁中圖文。這是本地啟發式，不是觀看數預測，
 * 也不能保證任何偵測器會給過。
 */

export const IG_VISIBLE_CHARS = 125;
export const IG_HASHTAG_CAP = 5;

const FILLER_TAGS = new Set([
  'viral', 'fyp', 'foryou', 'foryoupage', 'explore', 'explorepage', 'trending',
  'instagood', 'love', 'follow', 'like4like', 'reels', 'reelsinstagram',
  'viralreels', 'instadaily', '爆款', '必看', '分享', '生活', '日常',
]);

const INVISIBLE = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu;

const SLOP_REPLACE: Array<[RegExp, string]> = [
  [/在這個快節奏的時代[，,]?/g, ''],
  [/在當今(社會|時代)?[，,]?/g, ''],
  [/隨著[^，。\n]{0,16}的發展[，,]?/g, ''],
  [/值得注意的是[，,]?/g, ''],
  [/無縫(接軌|整合)/g, ''],
  [/賦能/g, ''],
  [/告別繁瑣[，,]?/g, ''],
  [/輕鬆數位化[！!。]?/g, ''],
  [/正?邁向數位化的未來就是現在[。！!]?/g, ''],
  [/數位轉型/g, ''],
  [/停止滑動[，,。！!\s]*/g, ''],
  [/別滑了[，,。！!\s]*/g, ''],
  [/(?:歡迎)?追蹤(?:看更多|以了解更多|我看更多)[，,。！!\s]*/g, ''],
  [/標記(一位)?需要(這則|這篇)的(朋友|人)/g, ''],
  [/演算法(很)?喜歡/g, ''],
  [/在今天的(影片|貼文|限動)(裡|中)?[，,]?/g, ''],
  [/雙擊(螢幕)?如果/g, ''],
];

const STRUCTURES: Array<[RegExp, string]> = [
  [/不是[^，。\n]{1,18}而是/, '「不是…而是…」'],
  [/不僅[^，。\n]{1,18}(更|也)/, '「不僅…更…」'],
  [/你們覺得(呢|勒)/, '「你們覺得呢」'],
  [/歡迎留言/, '歡迎留言'],
  [/留言才告訴你/, '留言才告訴你'],
  [/這(支|篇)(影片|貼文)要(跟你|帶你)/, '影片開場白'],
];

const SCENE = /白板|LINE|單據|手寫|羽絨|工地|派工|櫃檯|衣服|雨|下午|月底|師傅|店主|老闆|工班|案場|調撥|履歷|打卡|群組|請款|水電|泥作|收租|租約|房客/;
const STAKES = /沒人|不要|還沒|賠|對不攏|打掉|找不到|漏掉|漏了|空白|已讀|不理|洗壞|弄壞|加班|請假|考古|奪命/;
const GREETING = /^(大家好|哈囉|嗨|各位|朋友們|大家早安|各位老闆)/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;
const ASK_GROUPS: Array<[RegExp, string]> = [
  [/留言才告訴你|留言.{0,8}(領|拿|告訴你)/, '留言換資訊'],
  [/私訊|小盒子/, '私訊'],
  [/追蹤(我|看|以)/, '追蹤'],
  [/收藏這/, '收藏'],
  [/分享給/, '分享'],
  [/點(擊)?連結|連結在簡介|link in bio/i, '連結'],
  [/來信|來電|0972[\s-]?395[\s-]?117|inforcraft\.com\.tw|@BBBOX|2355[\s-]?0256|預約賞屋/, '聯絡'],
  [/你們覺得|歡迎留言|留言告訴我/, '邀請留言'],
];

export interface IgFormula {
  id: string;
  name: string;
  line: string;
  comments: Array<{ id: number; name: string; shape: string }>;
}

/** 圖文用的六種鉤子。同一主題固定抽同一種，避免每篇都長一樣。 */
export const IG_FORMULAS: IgFormula[] = [
  {
    id: 'nobody',
    name: '沒人講',
    line: '第一句用「沒人跟你講」帶一件這行真的會發生、但不常被講破的事。不要講大家都已經在轉的話。',
    comments: [
      { id: 3, name: '先同意再岔開', shape: '先接他講對的那半句，再講你現場看到不一樣的條件。不推產品。' },
      { id: 8, name: '換一個讀法', shape: '事實可以留著，換一個讀法，兩句內講完。' },
    ],
  },
  {
    id: 'receipt',
    name: '現場收據',
    line: '第一句是一個發生過的場面，加上一個時間或數量（下午、兩組人、一週）。不要發明營收、客戶數、百分比。',
    comments: [
      { id: 6, name: '收據', shape: '你自己遇過的那一次，兩句，要有時間或數量。' },
      { id: 1, name: '補一個數字', shape: '他有主張時，補一個你數得出來的數量，不誇大。' },
    ],
  },
  {
    id: 'time',
    name: '時間對比',
    line: '第一句寫以前卡在哪、現在還卡在哪。不要寫誇張倍數，沒有把握的分鐘數不要寫。',
    comments: [
      { id: 1, name: '補一個數字', shape: '只補一個你確定的時間或件數。' },
      { id: 5, name: '問真的問題', shape: '問他跳過的那一步，一個問題就好。' },
    ],
  },
  {
    id: 'instead',
    name: '先別這樣',
    line: '第一句點出大家正在做的那個習慣（白板、手寫單、LINE 考古），下一句才說改看哪一件事。不要寫「停止滑動」。',
    comments: [
      { id: 2, name: '補漏掉的情況', shape: '他講的在一種店成立，寫出換一種規模就不成立的條件。' },
      { id: 4, name: '接他最好的一句', shape: '只延伸他貼文裡的一句，不重講整篇。' },
    ],
  },
  {
    id: 'quote',
    name: '一句原話',
    line: '第一句用引號放進業主、店主或師傅真的會講的一句話。引號裡不要放品牌名。',
    comments: [
      { id: 4, name: '接他最好的一句', shape: '引用對方那句，再補一個場面。' },
      { id: 9, name: '一句話', shape: '十個字內，要好笑或要真，二選一。' },
    ],
  },
  {
    id: 'chain',
    name: '後面的人在付',
    line: '第一句寫前面漏掉的那一步，以及後面誰在收拾。一句因果，不要列教學清單。',
    comments: [
      { id: 2, name: '補漏掉的情況', shape: '補上他沒寫到的下一個環節。' },
      { id: 6, name: '收據', shape: '講一次後面的人真的在收拾的場面。' },
    ],
  },
];

export function pickIgFormula(topic: string): IgFormula {
  let hash = 0;
  const text = topic.trim() || 'ig';
  for (const ch of text) hash = (Math.imul(hash, 33) + ch.codePointAt(0)!) >>> 0;
  return IG_FORMULAS[hash % IG_FORMULAS.length];
}

export function igReachBrief(params: { topic: string; searchQueries?: string[] }): string {
  const formula = pickIgFormula(params.topic);
  const queries = (params.searchQueries ?? []).filter(Boolean);
  return [
    `這篇 IG 用「${formula.name}」：${formula.line}`,
    `摺疊前大約 ${IG_VISIBLE_CHARS} 字。第一行就是完整的一句，讀者不點開也知道在講什麼。`,
    '禁止大家好、哈囉、停止滑動、在這個時代、在今天的影片。第一個字不要是 emoji，也不要是 hashtag。',
    `Hashtag 最多 ${IG_HASHTAG_CAP} 個，放在全文最後，只留品牌名和搜尋詞。禁止 viral、fyp、爆款、必看、分享、生活、日常。`,
    queries.length ? `搜尋詞只挑下面一個，寫進句子裡，不要只丟在 hashtag：${queries.join('、')}。` : '',
    '全文只留一個詢問。Homigo、TaskGo、Washgo 把匠管聯絡放在最後一句；不要再加追蹤、私訊、收藏、留言才告訴你。',
    '不要寫「不是…而是…」「不僅…更…」，不要堆 emoji，不要標題黨。',
    '系統不會代發留言，也不要寫成留言誘餌。同溫層留言要另寫，不放進這篇正文。',
  ].filter(Boolean).join('\n');
}

export function clampIgHashtags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (FILLER_TAGS.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(tag);
    if (kept.length >= IG_HASHTAG_CAP) break;
  }
  return kept;
}

export function humanizeIgText(text: string): string {
  let out = text.replace(INVISIBLE, '');
  out = out.replace(/\u00A0/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  out = out.replace(/[—–]/g, '，').replace(/——/g, '，').replace(/…/g, '...');
  out = out.replace(/[•·]/g, '');
  out = out.replace(/#[^\s#]+/g, '');
  for (const [pattern, replacement] of SLOP_REPLACE) out = out.replace(pattern, replacement);
  out = out.replace(/正在(?=[。！？]|$)/g, '');
  out = out.replace(/[，,]{2,}/g, '，');
  out = out.replace(/，\s*([。！？])/g, '$1');
  out = out.replace(/([。！？])[。！？]+/g, '$1');
  out = out.replace(/^[，,。！？\s]+/gm, '');
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  out = out.split('\n').map((line) => line.trim()).filter((line) => line && line !== '。').join('\n');
  return out.trim();
}

export interface HookScore {
  score: number;
  label: 'STRONG' | 'OK' | 'WEAK';
  weakest: string;
  dealbreaker: string | null;
}

export function scoreIgHook(firstLine: string): HookScore {
  const line = firstLine.trim();
  const dealbreaker = GREETING.test(line)
    ? '用打招呼開場。沒有人滑進來是要被打招呼的。'
    : /停止滑動|別滑了/.test(line)
      ? '用「停止滑動」開場。開口跟人家要注意力，代表這句還沒有內容。'
      : /在今天的(影片|貼文|限動)|這(支|篇)要(跟你|帶你)/.test(line)
        ? '影片開場白。刪掉，直接從事情開始。'
        : line.startsWith('#') || line.startsWith('@')
          ? '第一行是 hashtag 或標記。那一行應該是一句話。'
          : EMOJI.test(line.slice(0, 2))
            ? '第一個字是 emoji。'
            : null;

  let specificity = SCENE.test(line) || /\d/.test(line) ? 85 : 35;
  const stakes = STAKES.test(line) || /沒人跟你講|先別/.test(line) ? 85 : 40;
  const length = line.length;
  const frontload = length >= 10 && length <= 42 ? 90 : length > 80 ? 30 : length < 8 ? 35 : 60;
  const address = /你|老闆|店主|工班|師傅|客人|房東/.test(line) ? 80 : 55;
  const parts = [
    ['具體', specificity],
    ['利害', stakes],
    ['開頭長度', frontload],
    ['對誰說', address],
  ] as const;
  let score = Math.round(parts.reduce((sum, [, n]) => sum + n, 0) / parts.length);
  if (dealbreaker) score = Math.min(score, 18);
  const weakest = [...parts].sort((a, b) => a[1] - b[1])[0][0];
  const label = score >= 75 ? 'STRONG' : score >= 55 ? 'OK' : 'WEAK';
  return { score, label, weakest, dealbreaker };
}

interface HumanCheck {
  name: string;
  score: number;
  detail: string;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreIgHuman(text: string): {
  score: number;
  verdict: 'PASS' | 'REVIEW' | 'FLAGGED';
  checks: HumanCheck[];
  tells: string[];
} {
  const body = text.trim();
  const sentences = body.split(/[。！？\n]+/).map((s) => s.trim()).filter(Boolean);
  const lengths = sentences.map((s) => s.length);
  let burstiness = 72;
  if (lengths.length >= 4) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
    const cv = Math.sqrt(variance) / Math.max(mean, 1);
    burstiness = clampScore(40 + cv * 120);
  }
  const sceneHits = body.match(new RegExp(SCENE, 'g'))?.length ?? 0;
  const digits = body.match(/\d/g)?.length ?? 0;
  const markers = sceneHits + (digits > 0 ? 1 : 0);
  const specificity = markers >= 2 ? 88 : markers === 1 ? 70 : body.length < 40 ? 60 : 36;

  const slopLeft = SLOP_REPLACE.reduce((n, [pattern]) => n + (body.match(pattern)?.length ?? 0), 0);
  const slop = slopLeft === 0 ? 100 : clampScore(100 - slopLeft * 28);

  const fingerprintHits = (body.match(/[—–―]/g)?.length ?? 0) + (body.match(INVISIBLE)?.length ?? 0);
  const fingerprint = fingerprintHits === 0 ? 100 : clampScore(100 - fingerprintHits * 30);

  const tells = STRUCTURES.filter(([pattern]) => pattern.test(body)).map(([, name]) => name);
  let voice = 82 - tells.length * 24;
  if (!/[我你咱]/.test(body) && !/[啦欸吧喔吼]/.test(body) && body.length > 80) voice -= 12;
  voice = clampScore(voice);

  const checks: HumanCheck[] = [
    { name: '句子節奏', score: burstiness, detail: lengths.length >= 4 ? `${lengths.length} 句` : '短文，不拿等長句子扣分' },
    { name: '具體', score: specificity, detail: `${markers} 個場面或數字` },
    { name: '套話', score: slop, detail: slopLeft ? `還有 ${slopLeft} 個套話` : '沒有套話' },
    { name: '字元指紋', score: fingerprint, detail: fingerprintHits ? '還有破折號或看不見的字元' : '沒有' },
    { name: '口氣', score: voice, detail: tells.length ? tells.join('、') : '沒有公式句' },
  ];
  const mean = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const weakest = Math.min(...checks.map((c) => c.score));
  const score = clampScore(mean * 0.6 + weakest * 0.4);
  const verdict = score >= 70 && weakest >= 55 ? 'PASS' : score >= 55 ? 'REVIEW' : 'FLAGGED';
  return { score, verdict, checks, tells };
}

export interface CaptionCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

function contactOk(slug: string, text: string): boolean {
  if (slug === 'bbbox') return /04[\s-]?2355[\s-]?0256|@BBBOX|預約賞屋/.test(text);
  if (slug === 'homigo' || slug === 'taskgo' || slug === 'washgo') {
    return /inforcraft\.com\.tw|0972[\s-]?395[\s-]?117/.test(text);
  }
  return true;
}

function searchHits(text: string, queries: string[]): string[] {
  return queries.filter((query) => {
    if (text.includes(query)) return true;
    const stem = query.slice(0, 2);
    return query.length >= 4 && stem.length === 2 && text.includes(stem);
  });
}

export function lintIgCaption(params: {
  body: string;
  hashtags: string[];
  searchQueries?: string[];
  slug?: string;
}): { checks: CaptionCheck[]; verdict: 'READY' | 'REVIEW' | 'FIX'; visible: string; truncated: boolean; asks: string[] } {
  const body = params.body.trim();
  const lines = body.split('\n');
  const first = (lines[0] ?? '').trim();
  const visible = body.length <= IG_VISIBLE_CHARS ? body : body.slice(0, IG_VISIBLE_CHARS);
  const tags = params.hashtags;
  const asks = ASK_GROUPS.filter(([pattern]) => pattern.test(body)).map(([, name]) => name);
  const queries = (params.searchQueries ?? []).filter(Boolean);
  const found = searchHits(`${body}\n${tags.join(' ')}`, queries);
  const checks: CaptionCheck[] = [];

  checks.push(first
    ? first.length > IG_VISIBLE_CHARS
      ? { name: '第一行', status: 'WARN', detail: `第一行 ${first.length} 字，會在 ${IG_VISIBLE_CHARS} 字被截斷` }
      : { name: '第一行', status: 'PASS', detail: `${first.length} 字，整句看得到` }
    : { name: '第一行', status: 'FAIL', detail: '沒有第一行' });

  const hook = scoreIgHook(first);
  checks.push(hook.dealbreaker
    ? { name: '鉤子', status: 'FAIL', detail: hook.dealbreaker }
    : hook.label === 'WEAK'
      ? { name: '鉤子', status: 'FAIL', detail: `${hook.score} 分，最弱的是${hook.weakest}` }
      : { name: '鉤子', status: 'PASS', detail: `${hook.score} ${hook.label}` });

  checks.push(/\d/.test(visible) || SCENE.test(visible)
    ? { name: '看得到的具體', status: 'PASS', detail: '摺疊前有場面或數字' }
    : { name: '看得到的具體', status: 'WARN', detail: '摺疊前沒有場面或數字' });

  checks.push(tags.length > IG_HASHTAG_CAP
    ? { name: 'Hashtag', status: 'FAIL', detail: `${tags.length} 個，超過 ${IG_HASHTAG_CAP} 個` }
    : { name: 'Hashtag', status: 'PASS', detail: `${tags.length} 個` });

  if (asks.length === 1) checks.push({ name: '一個詢問', status: 'PASS', detail: asks[0] });
  else if (asks.length === 0) checks.push({ name: '一個詢問', status: 'WARN', detail: '沒有行動呼籲' });
  else checks.push({ name: '一個詢問', status: 'FAIL', detail: `有 ${asks.length} 個：${asks.join('、')}` });

  if (params.slug && !contactOk(params.slug, body)) {
    const expect = params.slug === 'bbbox' ? '預約賞屋電話或 LINE @BBBOX' : '匠管信箱或 0972-395-117';
    checks.push({ name: '聯絡', status: 'FAIL', detail: `最後一句要有${expect}。cta 欄位不會跟著貼出去。` });
  }

  if (queries.length) {
    checks.push(found.length
      ? { name: '搜尋詞', status: 'PASS', detail: `有寫到：${found[0]}` }
      : { name: '搜尋詞', status: 'FAIL', detail: `句子和 hashtag 都沒有這些詞：${queries.join('、')}` });
  }

  const emojiCount = body.match(new RegExp(EMOJI, 'gu'))?.length ?? 0;
  const density = emojiCount * 100 / Math.max(body.length, 1);
  checks.push(density > 4
    ? { name: 'Emoji', status: 'WARN', detail: `${emojiCount} 個，讀起來像裝飾` }
    : { name: 'Emoji', status: 'PASS', detail: `${emojiCount} 個` });

  const fails = checks.some((c) => c.status === 'FAIL');
  const warns = checks.some((c) => c.status === 'WARN');
  return {
    checks,
    verdict: fails ? 'FIX' : warns ? 'REVIEW' : 'READY',
    visible,
    truncated: body.length > IG_VISIBLE_CHARS,
    asks,
  };
}

export interface IgCraftReceipt {
  formulaId: string;
  formulaName: string;
  visible: string;
  truncated: boolean;
  hookScore: number;
  hookLabel: string;
  hookDealbreaker: string | null;
  humanScore: number;
  humanVerdict: string;
  captionVerdict: string;
  tells: string[];
  commentTypes: Array<{ id: number; name: string; shape: string }>;
  checks: CaptionCheck[];
  rewriteReason: string | null;
  disclaimer: string;
}

export function prepareInstagramCopy(params: {
  body: string;
  hashtags?: string[];
  topic: string;
  searchQueries?: string[];
  slug?: string;
}): { body: string; hashtags: string[]; receipt: IgCraftReceipt } {
  const body = humanizeIgText(params.body);
  const hashtags = clampIgHashtags(params.hashtags);
  const formula = pickIgFormula(params.topic);
  const first = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const hook = scoreIgHook(first);
  const human = scoreIgHuman(body);
  const caption = lintIgCaption({
    body,
    hashtags,
    searchQueries: params.searchQueries,
    slug: params.slug,
  });
  const reasons = [
    ...caption.checks.filter((c) => c.status === 'FAIL').map((c) => `${c.name}：${c.detail}`),
    ...human.tells.map((tell) => `口氣：拿掉${tell}`),
  ];
  if (human.checks.find((c) => c.name === '套話' && c.score < 55)) {
    reasons.push('套話還在，改成現場會講的話');
  }
  const rewriteReason = reasons.length ? reasons.join('；') : null;
  return {
    body,
    hashtags,
    receipt: {
      formulaId: formula.id,
      formulaName: formula.name,
      visible: caption.visible,
      truncated: caption.truncated,
      hookScore: hook.score,
      hookLabel: hook.label,
      hookDealbreaker: hook.dealbreaker,
      humanScore: human.score,
      humanVerdict: human.verdict,
      captionVerdict: caption.verdict,
      tells: human.tells,
      commentTypes: formula.comments,
      checks: caption.checks,
      rewriteReason,
      disclaimer: '本地啟發式，不是觀看數預測，也不代表偵測器會給過。留言只起草，不代發。',
    },
  };
}

export function formatIgCraftNote(receipt: IgCraftReceipt): string {
  const comments = receipt.commentTypes.map((item) => item.name).join('、');
  return [
    `IG 觸及檢查：鉤子 ${receipt.hookScore} ${receipt.hookLabel}（${receipt.formulaName}），人話 ${receipt.humanScore} ${receipt.humanVerdict}，文案 ${receipt.captionVerdict}`,
    receipt.rewriteReason ? `還要改：${receipt.rewriteReason}` : '',
    `留言不代發。若要去同溫層留言，用「${comments}」。`,
    receipt.disclaimer,
  ].filter(Boolean).join('\n');
}

const COMMENT_OPENER = /^(好棒|好讚|太真了|太真實|說得太好|愛了|讚|需要這個|great\b|love this|so true|this\b)/i;
const COMMENT_PITCH = /私訊我|看我|主頁|加\s*LINE|免費試用|連結在|官網|來試|我們(的)?系統|TaskGo|Washgo|Homigo|匠管|0972|inforcraft/i;

export interface CommentReview {
  ok: boolean;
  reasons: string[];
  cleaned: string;
}

/** 給編輯自己貼的留言。不代發。 */
export function reviewIgComment(text: string): CommentReview {
  const cleaned = humanizeIgText(text);
  const reasons: string[] = [];
  const first = cleaned.trim();
  if (!first) reasons.push('空白');
  if (COMMENT_OPENER.test(first) || EMOJI.test(first.slice(0, 2))) {
    reasons.push('不要用好棒、太真了，或用 emoji 開頭');
  }
  if (COMMENT_PITCH.test(first)) reasons.push('留言裡不要推銷、不放聯絡方式');
  if (first.length > 140) reasons.push(`太長（${first.length} 字）。一到三句就好`);
  if (first.length > 0 && first.length < 6) reasons.push('短到沒有內容');
  const specific = SCENE.test(first) || /\d/.test(first) || /[「"]/.test(first) || /上週|昨天|今天|店裡|現場|月底/.test(first);
  if (first && !specific) reasons.push('這則放在任何貼文下面都成立，補一個只有這篇才有的細節');
  if (STRUCTURES.some(([pattern]) => pattern.test(first))) reasons.push('拿掉公式句');
  return { ok: reasons.length === 0, reasons, cleaned };
}

export interface SwipeRow {
  account: string;
  followers?: number;
  median?: number;
  views: number;
  hook: string;
}

export interface RankedSwipe extends SwipeRow {
  multiple: number | null;
  baseline: 'median' | 'followers' | 'none';
  signal: 'outlier' | 'watch' | 'quiet' | 'unknown';
  hookScore: number;
  hookLabel: string;
}

/** 相對該帳號自己的中位數。3 倍以上才當訊號，1.5 倍以下是平常的一天。 */
export function rankSwipe(rows: SwipeRow[]): RankedSwipe[] {
  const ranked = rows.map((row) => {
    const median = row.median ?? 0;
    const followers = row.followers ?? 0;
    const baseline: RankedSwipe['baseline'] = median > 0 ? 'median' : followers > 0 ? 'followers' : 'none';
    const base = baseline === 'median' ? median : baseline === 'followers' ? followers : 0;
    const multiple = base > 0 ? Math.round((row.views / base) * 10) / 10 : null;
    const signal: RankedSwipe['signal'] = baseline !== 'median' || multiple == null
      ? 'unknown'
      : multiple >= 3 ? 'outlier' : multiple >= 1.5 ? 'watch' : 'quiet';
    const hook = scoreIgHook(row.hook);
    return { ...row, multiple, baseline, signal, hookScore: hook.score, hookLabel: hook.label };
  });
  ranked.sort((a, b) => (b.multiple ?? -1) - (a.multiple ?? -1));
  return ranked;
}

export function medianOf(values: number[]): number | null {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
