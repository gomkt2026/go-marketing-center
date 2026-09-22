import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { getBrandVoice } from './prompts';
import { logActivity } from './activity';
import { fetchGoogleTrendsTW, fetchGoogleNews, fetchTaiwanNews, fetchPttBoard, fetchDcard, type TrendItem } from './sources';

export const BRAND_SOURCES: Record<string, {
  newsQuery: string;
  filterKeywords: string[];
  brandQueries: string[];
  brandNames: string[];
  pttBoard?: string;
  dcardForum?: string;
}> = {
  homigo: {
    newsQuery: '租屋 OR 租金補貼 OR 包租代管 OR 房東 房客',
    filterKeywords: ['租屋', '租金', '房東', '房客', '租客', '包租', '社宅', '房市', '押金', '租約', '囤房'],
    brandQueries: ['Homigo', '匠管 Homigo', 'Inforcraft 租屋'],
    brandNames: ['Homigo', '匠管', 'Inforcraft'],
    pttBoard: 'home-sale', dcardForum: 'rent',
  },
  taskgo: {
    newsQuery: '裝修 OR 室內裝潢 OR 工班 OR 老屋翻新',
    filterKeywords: ['裝修', '裝潢', '工班', '翻新', '缺工', '工地', '建材', '室內設計', '水電', '漏水'],
    brandQueries: ['TaskGo', 'Task Go', '匠管 Task'],
    brandNames: ['TaskGo', 'Task Go', '匠管'],
    pttBoard: 'Interior', dcardForum: 'interior_design',
  },
  washgo: {
    newsQuery: '洗衣店 OR 乾洗 OR 衣物保養 OR 換季收納',
    filterKeywords: ['洗衣', '乾洗', '衣物', '棉被', '羽絨', '換季', '收納', '梅雨', '潮濕', '黴'],
    brandQueries: ['Washgo', 'WashGo', '匠管 洗衣'],
    brandNames: ['Washgo', 'WashGo'],
    dcardForum: 'life',
  },
};

const MIN_RELEVANCE = 0.6;
const MAX_SIGNALS_PER_BRAND = 3;
const VALID_SIGNAL_TYPES = ['news', 'policy', 'current_event', 'trending_topic', 'industry_trend', 'social_content', 'evergreen'];

interface SignalSelection {
  index: number;
  relevance: number;
  signalType: string;
  summary: string;
}

export async function findMarketAnalystAgent(env: Env): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE r.code = 'market_analyst' AND a.is_active = true
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

export async function collectSignalsForBrand(
  env: Env,
  brand: { id: string; slug: string; name: string },
  options?: { trends?: TrendItem[]; generalNews?: TrendItem[] },
): Promise<number> {
  const sql = getSql(env);
  const [trends, generalNews] = await Promise.all([
    options?.trends ? Promise.resolve(options.trends) : fetchGoogleTrendsTW(),
    options?.generalNews ? Promise.resolve(options.generalNews) : fetchTaiwanNews(),
  ]);
  const analystId = await findMarketAnalystAgent(env);
  const config = BRAND_SOURCES[brand.slug] ?? {
    newsQuery: brand.name, filterKeywords: [], brandQueries: [brand.name], brandNames: [brand.name],
  };
  const [news, ptt, dcard] = await Promise.all([
    fetchGoogleNews(config.newsQuery),
    config.pttBoard ? fetchPttBoard(config.pttBoard) : Promise.resolve([]),
    config.dcardForum ? fetchDcard(config.dcardForum) : Promise.resolve([]),
  ]);
  const keywordNews = generalNews.filter((n) => config.filterKeywords.some((k) => n.title.includes(k) || n.snippet?.includes(k)));
  const otherNews = generalNews.filter((n) => !keywordNews.includes(n)).slice(0, 8);
  const seen = new Set<string>();
  const candidates: TrendItem[] = [...news, ...keywordNews, ...ptt, ...dcard, ...trends, ...otherNews]
    .filter((c) => { if (seen.has(c.title)) return false; seen.add(c.title); return true; })
    .slice(0, 40);
  const recentRows = await sql`
    SELECT title FROM market_signals
    WHERE brand_id = ${brand.id}::uuid AND discovered_at > now() - interval '14 days'
  `;
  const existingTitles = new Set((recentRows as { title: string }[]).map((r) => r.title));
  const fresh = candidates.filter((c) => !existingTitles.has(c.title));
  console.log(`[collect] ${brand.slug} trends=${trends.length} gnews=${news.length} keyword=${keywordNews.length} ptt=${ptt.length} dcard=${dcard.length} fresh=${fresh.length}`);
  if (!candidates.length || !fresh.length) return 0;

  const voice = getBrandVoice(brand.slug);
  const listText = fresh.map((c, i) => `${i}. [${c.source}] ${c.title}${c.snippet ? ` — ${c.snippet.slice(0, 120)}` : ''}`).join('\n');
  const selection = await chatCompleteJson<{ selections: SignalSelection[] }>(env, {
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `你是品牌「${brand.name}」的市場情報分析師。${voice.frontlinePersona}\n這個行業關心的議題:${voice.dailyConcerns}`,
      },
      {
        role: 'user',
        content: [
          '以下是剛抓到的熱門議題清單,請挑出對這個品牌社群操作「真正有價值」的項目(最多 5 個;跟行業無關又難跟風的不要選,relevance 至少 0.6 才列入):',
          listText,
          '',
          '回傳 JSON:{"selections":[{"index":清單編號,"relevance":0到1,"signalType":"news|policy|current_event|trending_topic|industry_trend|social_content","summary":"為什麼這議題對品牌有用、可以怎麼切入(80字內)"}]}',
        ].join('\n'),
      },
    ],
  });

  const picked = (selection.selections ?? [])
    .filter((sel) => fresh[sel.index] && sel.relevance >= MIN_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_SIGNALS_PER_BRAND);

  let insertedCount = 0;
  for (const sel of picked) {
    const item = fresh[sel.index];
    const signalType = VALID_SIGNAL_TYPES.includes(sel.signalType) ? sel.signalType : 'trending_topic';
    const inserted = await sql`
      INSERT INTO market_signals (
        brand_id, signal_type, title, summary, source_url, relevance_score,
        status, discovered_by_agent_id, source_platform, raw_data, auto_generated
      ) VALUES (
        ${brand.id}::uuid, ${signalType}, ${item.title}, ${sel.summary},
        ${item.url ?? null}, ${Math.min(1, Math.max(0, sel.relevance))},
        'new', ${analystId}, ${item.source}, ${JSON.stringify(item)}, true
      ) RETURNING id
    `;
    const signalId = (inserted[0] as { id: string }).id;
    await logActivity(env, {
      brandId: brand.id,
      actorType: 'ai_agent',
      actorAgentId: analystId,
      action: 'market_signal.discovered',
      entityType: 'market_signal',
      entityId: signalId,
      afterState: { title: item.title, source: item.source, relevance: sel.relevance },
    });
    insertedCount += 1;
  }
  return insertedCount;
}

export async function collectSignals(env: Env): Promise<void> {
  const sql = getSql(env);
  const brands = await sql`SELECT id, slug, name FROM brands WHERE is_active = true`;
  const [trends, generalNews] = await Promise.all([fetchGoogleTrendsTW(), fetchTaiwanNews()]);
  for (const brand of brands as { id: string; slug: string; name: string }[]) {
    try {
      await collectSignalsForBrand(env, brand, { trends, generalNews });
    } catch (e) {
      console.error(`[collect] 品牌 ${brand.slug} 蒐集失敗`, e);
    }
  }
}
