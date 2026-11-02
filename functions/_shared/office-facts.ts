/** 行銷中心晨會的純規則。不碰資料庫，方便本地驗證三品牌方向。 */

export const OFFICE_MONTHLY_BUDGET_USD = 40;
export const BRAND_SLUGS = ['taskgo', 'homigo', 'washgo'] as const;
export type OfficeBrandSlug = (typeof BRAND_SLUGS)[number];

export const OFFICE_CAST = [
  { key: 'taskgo', nickname: '阿豪', role: 'brand_ai', slug: 'taskgo' },
  { key: 'homigo', nickname: '小咪', role: 'brand_ai', slug: 'homigo' },
  { key: 'washgo', nickname: '阿樂', role: 'brand_ai', slug: 'washgo' },
  { key: 'news', nickname: '新聞收集', role: 'market_analyst', slug: null },
  { key: 'strategy', nickname: '行銷小編', role: 'content_strategist', slug: null },
  { key: 'publisher', nickname: '發文小編', role: 'publisher', slug: null },
  { key: 'podcast', nickname: 'Podcast小編', role: 'podcast_producer', slug: null },
  { key: 'image', nickname: '圖片小編', role: 'art_director', slug: null },
  { key: 'video', nickname: '影片小編', role: 'video_editor', slug: null },
] as const;

export type OfficeCastKey = (typeof OFFICE_CAST)[number]['key'];

export function taipeiHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  return Number(hour);
}

/** 台灣 02:00–07:59 只留下一班方向，不拿來產新稿。 */
export function isOfficeQuietHour(date = new Date()): boolean {
  const hour = taipeiHour(date);
  return hour >= 2 && hour < 8;
}

export function haikuCostUsd(inputTokens: number, outputTokens: number): number {
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);
  return (input / 1_000_000) * 1 + (output / 1_000_000) * 5;
}

export function budgetBlocks(spentUsd: number): boolean {
  return spentUsd >= OFFICE_MONTHLY_BUDGET_USD;
}

export function standupApplies(autoPublish: boolean, date = new Date()): boolean {
  return autoPublish && !isOfficeQuietHour(date);
}

export interface SignalFact {
  title: string;
  summary: string | null;
  url: string | null;
}

export interface BrandPlan {
  slug: OfficeBrandSlug;
  theme: string;
  doMore: string[];
  doLess: string[];
  facts: string[];
  finding: string;
  sourceUrl: string | null;
}

export interface OfficePlan {
  brands: BrandPlan[];
  podcastTopic: string;
  imageBrief: string;
  imageSlug: OfficeBrandSlug;
  videoNote: string;
  citations: string[];
  bubbles: { who: string; text: string }[];
}

export function forbiddenNeedles(statement: string): string[] {
  return statement
    .replace(/不可宣稱|不得宣稱|禁止宣稱|不可以|不能說|不要寫|禁止/g, ' ')
    .split(/[\s,，。、；：!！?？「」]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && part.length <= 24);
}

const PRESS = /媒體報導|上了新聞|被報導|專訪了|我們曝光|客戶突破|用戶突破|下載破|全台第一|保證成交|保證找到/;

/** 貼文碰到不可宣稱、沒出處的媒體露出，或事實裡沒有的數字，就整則作廢。 */
export function factProblem(text: string, cannotClaims: string[], allowedFacts: string[]): string | null {
  const compactFacts = allowedFacts.join('\n');
  for (const claim of cannotClaims) {
    for (const needle of forbiddenNeedles(claim)) {
      if (text.includes(needle) && !compactFacts.includes(needle)) return `碰到不可宣稱：${needle}`;
    }
  }
  const press = text.match(PRESS);
  if (press && !PRESS.test(compactFacts)) return `寫了沒有出處的說法：${press[0]}`;
  const numbers = text.match(/\d[\d,.]*(?:\s*)(?:萬|%|％|位客戶|個客戶|件成交|家門市)/g) ?? [];
  for (const token of numbers) {
    const compact = token.replace(/\s/g, '');
    if (!compactFacts.includes(compact) && !compactFacts.includes(token)) return `寫了事實裡沒有的數字：${token}`;
  }
  return null;
}

export function decideOfficePublish(active: boolean, problem: string | null): 'scheduled' | 'rejected' | 'left' {
  if (!active) return 'left';
  return problem ? 'rejected' : 'scheduled';
}

export function officeInstruction(plan: OfficePlan, slug: string): string {
  const brand = plan.brands.find((item) => item.slug === slug);
  if (!brand) return '';
  const facts = brand.facts.slice(0, 6).join('；');
  return [
    `這 6 小時只打這個方向：${brand.theme}`,
    brand.doMore.length ? `多做：${brand.doMore.join('、')}` : '',
    brand.doLess.length ? `少做：${brand.doLess.join('、')}` : '',
    facts ? `只能沿用這些已查到的事實：${facts}` : '沒有新的查證事實，就不要寫數字、媒體露出或客戶名。',
    '禁止發明媒體報導、客戶數、排名。',
  ].filter(Boolean).join('\n');
}

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item, 40)).filter(Boolean).slice(0, 4);
}

export function parseStandupPayload(raw: unknown, signals: SignalFact[]): OfficePlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const incoming = Array.isArray(body.brands) ? body.brands : [];
  const brands: BrandPlan[] = [];
  for (const slug of BRAND_SLUGS) {
    const found = incoming.find((item) => {
      return !!item && typeof item === 'object' && (item as { slug?: string }).slug === slug;
    }) as Record<string, unknown> | undefined;
    const indexes = Array.isArray(found?.signalIndexes) ? found.signalIndexes : [];
    const picked = indexes
      .map((index) => signals[Number(index)])
      .filter((signal): signal is SignalFact => !!signal);
    const facts = picked
      .map((signal) => [signal.title, signal.summary].filter(Boolean).join('：'))
      .slice(0, 4);
    const theme = asString(found?.theme, 40) || picked[0]?.title || '延續已經驗證過的題，不開新宣稱';
    brands.push({
      slug,
      theme,
      doMore: asList(found?.doMore),
      doLess: asList(found?.doLess),
      facts,
      finding: picked[0] ? `記下：${picked[0].title}` : '這輪沒有新的查證事實',
      sourceUrl: picked.find((signal) => signal.url)?.url ?? null,
    });
  }
  const bubbles = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => {
      if (!line || typeof line !== 'object') return null;
      const who = asString((line as { who?: string }).who, 12);
      const text = asString((line as { text?: string }).text, 42);
      if (!who || !text) return null;
      return { who, text };
    })
    .filter((line): line is { who: string; text: string } => !!line)
    .slice(0, 8);
  const imageSlugRaw = asString(body.imageSlug, 12);
  const imageSlug = (BRAND_SLUGS as readonly string[]).includes(imageSlugRaw)
    ? imageSlugRaw as OfficeBrandSlug
    : 'taskgo';
  return {
    brands,
    podcastTopic: asString(body.podcastTopic, 40) || brands[0]?.theme || '這週三個小編各自碰到的一件小事',
    imageBrief: asString(body.imageBrief, 60) || brands.find((brand) => brand.slug === imageSlug)?.theme || '',
    imageSlug,
    videoNote: asString(body.videoNote, 60),
    citations: brands.flatMap((brand) => brand.facts),
    bubbles,
  };
}

export interface VideoSnap { title: string; status: string }
export interface PodcastSnap { title: string; status: string }

export interface Nameplate {
  key: OfficeCastKey;
  status: 'working' | 'done' | 'blocked';
  task: string;
}

export function nameplates(plan: OfficePlan, ctx: {
  quiet: boolean;
  autoPublish: boolean;
  videos: VideoSnap[];
  podcasts: PodcastSnap[];
}): Nameplate[] {
  const bySlug = Object.fromEntries(plan.brands.map((brand) => [brand.slug, brand]));
  const readyVideo = ctx.videos.find((video) => video.status === 'ready' && video.title);
  const openVideo = ctx.videos.find((video) => video.status !== 'ready' && video.status !== 'rejected' && video.title);
  const videoTask = readyVideo
    ? `這支可以推：${readyVideo.title}`
    : openVideo
      ? `這支先維持：${openVideo.title}`
      : '在等素材，這班不剪新片';
  const unpublished = ctx.podcasts.filter((episode) => !['approved', 'archived', 'rejected'].includes(episode.status));
  const podcastTask = unpublished.length
    ? `還有 ${unpublished.length} 集沒上架。下一題：${plan.podcastTopic}`
    : `沒有待上架。下一題可以聊：${plan.podcastTopic}`;
  const publishTask = !ctx.autoPublish
    ? '總開關關著，這班不發出去'
    : ctx.quiet
      ? '方向先記下，早上八點才發'
      : '通過檢查的稿直接排進發布';
  const imageTheme = plan.imageBrief || bySlug[plan.imageSlug]?.theme || '這一班的題';
  return [
    { key: 'taskgo', status: 'done', task: `正在把「${bySlug.taskgo?.theme ?? ''}」收進品牌筆記` },
    { key: 'homigo', status: 'done', task: `正在把「${bySlug.homigo?.theme ?? ''}」收進品牌筆記` },
    { key: 'washgo', status: 'done', task: `正在把「${bySlug.washgo?.theme ?? ''}」收進品牌筆記` },
    { key: 'news', status: 'done', task: plan.citations[0] ? `在看：${plan.citations[0].slice(0, 32)}` : '這輪沒有新的熱門題' },
    { key: 'strategy', status: 'done', task: '這一班的三個發文方向定了' },
    { key: 'publisher', status: ctx.autoPublish ? 'done' : 'blocked', task: publishTask },
    { key: 'podcast', status: 'done', task: podcastTask },
    { key: 'image', status: 'done', task: `這班的圖跟「${imageTheme}」一起出` },
    { key: 'video', status: readyVideo || openVideo ? 'done' : 'blocked', task: videoTask },
  ];
}

export function scrubPlanThemes(plan: OfficePlan, claimsBySlug: Record<string, string[]>): OfficePlan {
  return {
    ...plan,
    brands: plan.brands.map((brand) => {
      const claims = claimsBySlug[brand.slug] ?? [];
      const problem = factProblem(brand.theme, claims, brand.facts);
      if (!problem) return brand;
      return {
        ...brand,
        theme: brand.facts[0]?.split('：')[0] || '延續已經驗證過的題，不開新宣稱',
      };
    }),
  };
}
