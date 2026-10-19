import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_shared/env';
import { requireAuth, isSuperAdmin } from '../_shared/auth';
import { getSql } from '../_shared/db';
import { json } from '../_shared/response';
import { fetchGoogleTrendsTW, fetchTaiwanNews, type TrendItem } from '../_shared/sources';

// 即時熱門看板:自行抓取 Google Trends / 台灣新聞 RSS + 資料庫已蒐集的品牌情報(PTT/Dcard/新聞)
// 並做詞頻統計產出文字雲資料(免付費 API,全部自抓)

interface HotNewsItem {
  title: string;
  url: string | null;
  source: string;
  summary: string | null;
  brandSlug: string | null;
  brandName: string | null;
  relevance: number | null;
  signalId: string | null;
  discoveredAt: string | null;
}

interface KeywordItem {
  text: string;
  weight: number;
}

// 詞頻統計用停用詞(高頻但無分析意義的詞)
const STOPWORDS = new Set([
  '我們', '你們', '他們', '大家', '一個', '一下', '什麼', '怎麼', '可以', '需要', '應該', '還是', '這樣', '這個', '那個',
  '如果', '因為', '所以', '已經', '沒有', '不是', '就是', '真的', '知道', '現在', '今天', '昨天', '明天', '最近', '目前',
  '新聞', '影片', '直播', '快訊', '獨家', '報導', '記者', '網友', '民眾', '台灣', '全台', '國際', '中心', '綜合',
  '以及', '為何', '曝光', '揭密', '驚呆', '崩潰', '有片', '圖多', '請益', '請問', '心得', '分享', '討論', '問題',
  '影響', '持續', '宣布', '表示', '指出', '可能', '最新', '進行', '相關', '注意', '小心', '一次', '這些', '那些',
]);

function headlineKey(title: string): string {
  const cleaned = title
    .replace(/\s*[-|｜]\s*(自由時報|自由電子報|聯合報|ETtoday|三立|TVBS|中央社|Yahoo).*$/i, '')
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
  return cleaned.slice(0, 18);
}

/**
 * 熱門關鍵字：重複出現的完整標題只留一條，短詞必須跨到不同標題才算。
 * 不再對長標題做 8 字滑動視窗，避免「台南車站百年鐵軌」被切成一串重疊碎片。
 */
function extractKeywords(titles: string[], limit = 28): KeywordItem[] {
  const headlineCount = new Map<string, number>();
  const shortHeads = new Map<string, Set<string>>();

  titles.forEach((title) => {
    const head = headlineKey(title);
    if (head.length >= 4) headlineCount.set(head, (headlineCount.get(head) ?? 0) + 1);
    const seen = new Set<string>();
    for (const run of title.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i + n <= run.length; i++) {
          const gram = run.slice(i, i + n);
          if (seen.has(gram)) continue;
          let blocked = false;
          for (const sw of STOPWORDS) if (gram.includes(sw)) { blocked = true; break; }
          if (blocked) continue;
          seen.add(gram);
          if (!shortHeads.has(gram)) shortHeads.set(gram, new Set());
          if (head) shortHeads.get(gram)!.add(head);
        }
      }
    }
    for (const word of title.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? []) {
      const key = word.toUpperCase();
      if (!shortHeads.has(key)) shortHeads.set(key, new Set());
      if (head) shortHeads.get(key)!.add(head);
    }
  });

  const headlines = [...headlineCount.entries()].filter(([, count]) => count >= 2);
  const keptHeadlines = headlines.filter(([text, weight]) =>
    !headlines.some(([other, otherWeight]) =>
      other.length > text.length && otherWeight >= weight && other.includes(text)));

  const shorts = [...shortHeads.entries()]
    .map(([text, heads]) => [text, heads.size] as [string, number])
    .filter(([, count]) => count >= 2);
  const keptShorts = shorts.filter(([text, weight]) =>
    !shorts.some(([other, otherWeight]) =>
      other.length > text.length && otherWeight >= weight && other.includes(text))
    && !keptHeadlines.some(([head]) => head.includes(text)));

  const merged = new Map<string, number>();
  for (const [text, weight] of keptHeadlines) merged.set(text, Math.max(merged.get(text) ?? 0, weight));
  for (const [text, weight] of keptShorts) {
    if ([...merged.keys()].some((head) => head === text)) continue;
    merged.set(text, Math.max(merged.get(text) ?? 0, weight));
  }

  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([text, weight]) => ({ text, weight }));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const [trends, freshNews, signalRows] = await Promise.all([
    fetchGoogleTrendsTW(15),
    fetchTaiwanNews(10),
    sql`
      SELECT ms.id, ms.title, ms.summary, ms.source_url, ms.source_platform,
             ms.relevance_score, ms.discovered_at, b.slug AS brand_slug, b.name AS brand_name
      FROM market_signals ms
      JOIN brands b ON b.id = ms.brand_id
      WHERE ms.discovered_at > now() - interval '48 hours'
      ORDER BY ms.relevance_score DESC, ms.discovered_at DESC
      LIMIT 40
    `,
  ]);

  const allSignals = signalRows as {
    id: string; title: string; summary: string | null; source_url: string | null;
    source_platform: string | null; relevance_score: number | null; discovered_at: string;
    brand_slug: string; brand_name: string;
  }[];
  const signals = isSuperAdmin(auth)
    ? allSignals
    : allSignals.filter((s) => auth.brandSlugs.includes(s.brand_slug));

  // FB/IG 面向:品牌精選情報(新聞/RSS 類)+ 即時台灣新聞
  const curatedNews: HotNewsItem[] = signals
    .filter((s) => !['ptt', 'dcard'].includes(s.source_platform ?? ''))
    .map((s) => ({
      title: s.title, url: s.source_url, source: s.source_platform ?? 'news',
      summary: s.summary, brandSlug: s.brand_slug, brandName: s.brand_name,
      relevance: s.relevance_score, signalId: s.id, discoveredAt: s.discovered_at,
    }));
  const curatedTitles = new Set(curatedNews.map((n) => n.title));
  const liveNews: HotNewsItem[] = (freshNews as TrendItem[])
    .filter((n) => !curatedTitles.has(n.title))
    .slice(0, 15)
    .map((n) => ({
      title: n.title, url: n.url ?? null, source: '即時新聞', summary: n.snippet ?? null,
      brandSlug: null, brandName: null, relevance: null, signalId: null, discoveredAt: null,
    }));

  // Threads 面向:社群熱議(PTT/Dcard 情報)
  const community: HotNewsItem[] = signals
    .filter((s) => ['ptt', 'dcard'].includes(s.source_platform ?? ''))
    .map((s) => ({
      title: s.title, url: s.source_url, source: s.source_platform!,
      summary: s.summary, brandSlug: s.brand_slug, brandName: s.brand_name,
      relevance: s.relevance_score, signalId: s.id, discoveredAt: s.discovered_at,
    }));

  // 文字雲:全部標題做詞頻統計
  const allTitles = [
    ...trends.map((t) => t.title),
    ...(freshNews as TrendItem[]).map((n) => n.title),
    ...signals.map((s) => s.title),
  ];
  const keywords = extractKeywords(allTitles);

  return json({
    trends: trends.map((t) => ({ title: t.title, url: t.url ?? null, snippet: t.snippet ?? null })),
    news: [...curatedNews, ...liveNews],
    community,
    keywords,
    generatedAt: new Date().toISOString(),
  });
};
