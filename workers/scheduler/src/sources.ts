// 熱門議題來源抓取(免費組合):Google Trends TW / Google News RSS / PTT / Dcard
// 所有來源都容錯:單一來源失敗不影響整體流程

export interface TrendItem {
  source: 'google_trends' | 'rss' | 'ptt' | 'dcard';
  title: string;
  url?: string;
  snippet?: string;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

/** 解析 RSS <item>,回傳 title/link/description */
function parseRssItems(xml: string, limit: number): { title: string; link?: string; description?: string }[] {
  const items: { title: string; link?: string; description?: string }[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, limit)) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const description = block.match(/<description>([\s\S]*?)<\/description>/)?.[1];
    if (title) {
      items.push({
        title: decodeEntities(title),
        link: link ? decodeEntities(link) : undefined,
        description: description ? decodeEntities(description).replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
      });
    }
  }
  return items;
}

export async function fetchGoogleTrendsTW(limit = 10): Promise<TrendItem[]> {
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=TW', { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.log(`[sources] google_trends HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRssItems(xml, limit).map((i) => ({
      source: 'google_trends' as const,
      title: i.title,
      url: i.link,
      snippet: i.description,
    }));
  } catch {
    return [];
  }
}

export async function fetchGoogleNews(query: string, limit = 8): Promise<TrendItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.log(`[sources] google_news HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRssItems(xml, limit).map((i) => ({
      source: 'rss' as const,
      title: i.title,
      url: i.link,
      snippet: i.description,
    }));
  } catch {
    return [];
  }
}

// 台灣一般新聞 RSS(Google News 在 Workers IP 常被 503,改用媒體自家 feed 作為主要來源)
const TAIWAN_NEWS_FEEDS = [
  'https://news.ltn.com.tw/rss/all.xml',
  'https://feeds.feedburner.com/ettoday/realtime',
  'https://feeds.feedburner.com/rsscna/lifehealth',
];

export async function fetchTaiwanNews(limitPerFeed = 15): Promise<TrendItem[]> {
  const results = await Promise.all(TAIWAN_NEWS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        console.log(`[sources] taiwan_news ${feed} HTTP ${res.status}`);
        return [] as TrendItem[];
      }
      const xml = await res.text();
      return parseRssItems(xml, limitPerFeed).map((i) => ({
        source: 'rss' as const,
        title: i.title,
        url: i.link,
        snippet: i.description,
      }));
    } catch {
      return [] as TrendItem[];
    }
  }));
  return results.flat();
}

export async function fetchPttBoard(board: string, limit = 10): Promise<TrendItem[]> {
  try {
    const res = await fetch(`https://www.ptt.cc/bbs/${board}/index.html`, {
      headers: { 'User-Agent': UA, Cookie: 'over18=1' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items: TrendItem[] = [];
    const matches = html.matchAll(/<div class="title">\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
    for (const m of matches) {
      items.push({
        source: 'ptt',
        title: decodeEntities(m[2]),
        url: `https://www.ptt.cc${m[1]}`,
      });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchDcard(forum: string, limit = 10): Promise<TrendItem[]> {
  try {
    const res = await fetch(`https://www.dcard.tw/service/api/v2/forums/${forum}/posts?popular=true&limit=${limit}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const posts = await res.json() as { id: number; title: string; excerpt?: string }[];
    if (!Array.isArray(posts)) return [];
    return posts.slice(0, limit).map((p) => ({
      source: 'dcard' as const,
      title: p.title,
      url: `https://www.dcard.tw/f/${forum}/p/${p.id}`,
      snippet: p.excerpt,
    }));
  } catch {
    return [];
  }
}
