import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ProofTrend, type TrendWeek } from '@/pages/public/site/ProofTrend';
import { LanguageSwitch, LocalLink, useCopy, useFormat, useLocale } from '@/pages/public/locale';

export const CONTACT_EMAIL = 'service@inforcraft.com.tw';

const NAV = [
  { to: '/welcome', key: 'home' },
  { to: '/go-posting', key: 'posting' },
  { to: '/proof', key: 'proof' },
  { to: '/show', key: 'show' },
  { to: '/jiangcheng', key: 'game' },
  { to: '/center', key: 'center' },
] as const;

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  phoneMasked: string;
  score: number;
}

interface GameSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  prize: string;
  topN: number;
  prizeMap: GameMap;
}

type GameMap = 's' | 'm' | 'l' | 't';

interface GameStats {
  live: { count: number; players: { name: string; score: number; seconds: number }[] };
  totals: { plays: number; minutes: number; players: number };
  topPlayers: { nickname: string; phoneMasked: string; plays: number; minutes: number }[];
}

interface LeaderboardResponse {
  map: GameMap;
  season: GameSeason | null;
  entries: LeaderboardEntry[];
}

const BRAND_META = [
  { slug: 'taskgo', color: '#ff6b1a', logo: '/brands/taskgo-logo.png', editor: '/brands/taskgo-ahao.png', ctaUrl: 'https://app.taskgo.com.tw/register' },
  { slug: 'homigo', color: '#1fae78', logo: '/brands/homigo-logo.png', editor: '/brands/homigo-xiaomi.png', ctaUrl: 'https://www.homigo.com.tw' },
  { slug: 'washgo', color: '#3a8dde', logo: '/brands/washgo-logo.png', editor: '/brands/washgo-ale.png', ctaUrl: 'https://washgo.com.tw' },
] as const;

export function useBrands() {
  const copy = useCopy();
  return BRAND_META.map((meta, i) => ({
    slug: meta.slug,
    color: meta.color,
    logo: meta.logo,
    editor: meta.editor,
    name: copy.brands[i].name,
    editorName: copy.brands[i].editorName,
    tagline: copy.brands[i].tagline,
    body: copy.brands[i].body,
    cta: { label: copy.brands[i].cta, url: meta.ctaUrl },
  }));
}

export function brandOf<T extends { slug: string }>(brands: readonly T[], slug: string): T {
  return brands.find((b) => b.slug === slug)!;
}

export function useModules() {
  return useCopy().modules;
}

export function useFlow() {
  return useCopy().flow;
}

const PRESS_META = [
  { brand: 'taskgo', date: '2025/10/20', url: 'https://money.udn.com/money/story/5635/9082541' },
  { brand: 'homigo', date: '2026/07/01', url: 'https://money.udn.com/money/story/5635/9726282' },
  { brand: 'washgo', date: '2026/09/16', url: 'https://money.udn.com/money/story/5635/9756429' },
];

export function usePress() {
  const copy = useCopy();
  return PRESS_META.map((meta, i) => ({
    ...meta,
    title: copy.press.items[i].title,
    note: copy.press.items[i].note,
  }));
}

const PODCAST_PAGE = 'https://player.soundon.fm/p/e70c6ec4-699d-4972-a735-88447eaa2d09';
const PODCAST_FEEDS = [
  'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09.xml',
  'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09/yt.xml',
  'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09/spotify.xml',
];

export function usePodcast() {
  const copy = useCopy();
  return {
    page: PODCAST_PAGE,
    feeds: PODCAST_FEEDS.map((url, i) => ({ url, label: copy.podcast.feeds[i] })),
    copy: copy.podcast,
  };
}

const INTEGRATION_META = [
  { brand: 'taskgo', url: 'https://dev.taskgo.com.tw/project-case-report/6cMnEQRUbnwau4fRTYFL8oJ1tapbNrinlC_wXn0ykfGnohTfYgooXqBb9RZN17Gd/play' },
  { brand: 'washgo', url: 'https://washgo-liff.pages.dev/track/4e3271fc4a/play' },
];

export function useIntegrations() {
  const copy = useCopy();
  return INTEGRATION_META.map((meta, i) => ({ ...meta, ...copy.integrations[i] }));
}

/** 遊戲截圖放在 public/game/shots/。截圖不可出現真實姓名、電話或地址。 */
export const GAME_SHOTS: { src: string; caption: string }[] = [];

const PLATFORM_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' };

interface ShowcasePost {
  brandSlug: string;
  platform: string;
  publishedAt: string | null;
  title: string;
  excerpt: string;
  permalink: string | null;
}

interface ShowcaseEpisode {
  title: string;
  publishedAt: string | null;
  summary: string;
  url: string | null;
}

function useJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: T | null) => { if (alive && d) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return data;
}

export function BrandPosts() {
  const copy = useCopy();
  const brands = useBrands();
  const data = useJson<{ posts: ShowcasePost[] }>('/api/public/showcase/posts');
  return (
    <div className="lp-brands">
      {brands.map((b) => {
        const post = data?.posts.find((p) => p.brandSlug === b.slug);
        return (
          <article key={b.slug} className="lp-post" style={{ ['--c' as string]: b.color }}>
            <header>
              <img src={b.editor} alt={b.editorName} />
              <div>
                <b>{b.name}</b>
                <small>{copy.common.aiEditor(b.editorName)}</small>
              </div>
            </header>
            {post ? (
              <>
                <div className="lp-post-meta">
                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                  {post.publishedAt ? `・${formatDate(post.publishedAt)}` : ''}
                </div>
                {post.title && <h3>{post.title}</h3>}
                <p>{post.excerpt}</p>
                {post.permalink && (
                  <a className="lp-link" href={post.permalink} target="_blank" rel="noopener">{copy.common.viewPost}</a>
                )}
              </>
            ) : (
              <p className="lp-muted">{data ? copy.common.postSoon : copy.common.loading}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

interface ShowcaseMetric {
  published: number;
  pieces: number;
  measured: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  interactions: number;
}

interface ShowcaseResults {
  since: string | null;
  insightsAt?: string | null;
  totals: ShowcaseMetric;
  last28: ShowcaseMetric;
  brands: Array<{ slug: string; totals: ShowcaseMetric; last28: ShowcaseMetric }>;
  platforms: Array<{ platform: string; totals: ShowcaseMetric; last28: ShowcaseMetric }>;
  weeks?: TrendWeek[];
}

export function BrandResults() {
  const copy = useCopy();
  const text = copy.results;
  const brands = useBrands();
  const format = useFormat();
  const [data, setData] = useState<ShowcaseResults | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/showcase/results')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ShowcaseResults) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className="lp-muted">{text.fail}</p>;
  if (!data) return <p className="lp-muted">{text.loading}</p>;

  const { totals, last28 } = data;
  const maxImp = Math.max(1, ...data.platforms.map((p) => p.totals.impressions));
  const threadsShare = totals.impressions > 0
    ? (data.platforms.find((p) => p.platform === 'threads')?.totals.impressions ?? 0) / totals.impressions
    : 0;

  return (
    <div className="lp-proof">
      <div className="lp-results">
        <div className="lp-result">
          <b>{format.n(totals.published)}</b>
          <span>{text.published}</span>
          <small>{text.publishedHint}</small>
        </div>
        <div className="lp-result">
          <b>{format.n(totals.impressions)}</b>
          <span>{text.impressions}</span>
          <small>{text.since(data.since ? format.ym(data.since) : null)}</small>
        </div>
        <div className="lp-result">
          <b>{format.n(last28.impressions)}</b>
          <span>{text.last28Impressions}</span>
          <small>{text.last28Posts(format.n(last28.published))}</small>
        </div>
        <div className="lp-result">
          <b>{format.n(last28.interactions)}</b>
          <span>{text.last28Interactions}</span>
          <small>{text.interactionDetail(format.n(last28.likes), format.n(last28.comments), format.n(last28.shares), format.n(last28.saves))}</small>
        </div>
      </div>

      <ProofTrend
        weeks={data.weeks ?? []}
        brands={brands.map((b) => ({
          slug: b.slug,
          name: b.name,
          color: b.color,
          recentImpressions: data.brands.find((x) => x.slug === b.slug)?.last28.impressions ?? 0,
        }))}
      />

      <h3 className="lp-proof-title">{text.byBrand}</h3>
      <div className="lp-brands">
        {brands.map((b) => {
          const row = data.brands.find((x) => x.slug === b.slug);
          const all = row?.totals;
          const recent = row?.last28;
          return (
            <article key={b.slug} className="lp-post" style={{ ['--c' as string]: b.color }}>
              <header>
                <img src={b.editor} alt={b.editorName} />
                <div>
                  <b>{b.name}</b>
                  <small>{copy.common.aiEditor(b.editorName)}</small>
                </div>
              </header>
              <div className="lp-metric-grid">
                <div className="lp-metric"><b>{format.n(all?.published ?? 0)}</b><small>{text.allPublished}</small></div>
                <div className="lp-metric"><b>{format.n(recent?.published ?? 0)}</b><small>{text.recentPublished}</small></div>
                <div className="lp-metric"><b>{format.n(all?.impressions ?? 0)}</b><small>{text.allImpressions}</small></div>
                <div className="lp-metric"><b>{format.n(recent?.impressions ?? 0)}</b><small>{text.recentImpressions}</small></div>
                <div className="lp-metric wide">
                  <b>{format.n(recent?.interactions ?? 0)}</b>
                  <small>{text.recentInteractions}</small>
                </div>
              </div>
              <p className="lp-mix">
                {text.mix(
                  format.n(recent?.likes ?? 0),
                  format.n(recent?.comments ?? 0),
                  format.n(recent?.shares ?? 0),
                  format.n(recent?.saves ?? 0),
                  (recent?.clicks ?? 0) > 0 ? format.n(recent?.clicks ?? 0) : null,
                )}
              </p>
            </article>
          );
        })}
      </div>

      <h3 className="lp-proof-title">{text.byPlatform}</h3>
      <div className="lp-plat-grid">
        {data.platforms.map((p) => (
          <article key={p.platform} className="lp-plat-card">
            <div className="lp-post-meta">{PLATFORM_LABELS[p.platform] ?? p.platform}</div>
            <b>{format.n(p.totals.published)}</b>
            <small>{text.allPublished}</small>
            <div className="lp-barline" aria-hidden="true">
              <i style={{ width: `${Math.round((p.totals.impressions / maxImp) * 100)}%` }} />
            </div>
            <p>
              {p.totals.impressions > 0
                ? text.platformCounts(format.n(p.totals.impressions), format.n(p.last28.impressions))
                : text.platformPending}
            </p>
            <p className="lp-muted">{text.platformRecent(format.n(p.last28.published), format.n(p.last28.interactions))}</p>
          </article>
        ))}
      </div>

      <p className="lp-note">
        {text.footnote(
          data.insightsAt ? format.stamp(data.insightsAt) : null,
          threadsShare >= 0.6,
          totals.clicks > 0 ? format.n(totals.clicks) : null,
        )}
      </p>
    </div>
  );
}

export function PodcastBlock() {
  const podcast = usePodcast();
  const data = useJson<{ episode: ShowcaseEpisode | null }>('/api/public/showcase/podcast');
  const ep = data?.episode;
  const { locale } = useLocale();
  return (
    <div className="lp-podcast">
      <a href={podcast.page} target="_blank" rel="noopener" className="lp-podcast-cover">
        <img src="/podcast/cover.jpg" alt={podcast.copy.coverAlt} loading="lazy" />
      </a>
      <div className="lp-podcast-body">
        <h3>{podcast.copy.title}</h3>
        <p className="lp-muted">{podcast.copy.body}</p>
        {ep && (
          <div className="lp-episode">
            <div className="lp-post-meta">{podcast.copy.latest(ep.publishedAt ? formatDate(ep.publishedAt) : '')}</div>
            <b>{ep.title}</b>
            <p>{ep.summary}</p>
            {locale !== 'zh' && podcast.copy.originalNote && <p className="lp-muted">{podcast.copy.originalNote}</p>}
            {ep.url && <a className="lp-link" href={ep.url} target="_blank" rel="noopener">{podcast.copy.listen}</a>}
          </div>
        )}
        <div className="lp-hero-cta">
          <a className="lp-btn" href={podcast.page} target="_blank" rel="noopener">{podcast.copy.soundon}</a>
        </div>
        <div className="lp-feeds">
          {podcast.feeds.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener">{f.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function Leaderboard() {
  const copy = useCopy();
  const text = copy.board;
  const format = useFormat();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [tab, setTab] = useState<'rank' | 'live' | 'loyal'>('rank');

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/public/game/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GameStats | null) => { if (alive && d) setStats(d); })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, 20000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    const get = (map?: GameMap) => fetch(`/api/public/game/leaderboard?limit=10${map ? `&map=${map}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))) as Promise<LeaderboardResponse>;
    get()
      .then((d) => (d.season && d.season.prizeMap !== d.map ? get(d.season.prizeMap) : d))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const season = data?.season;
  const mapName = copy.map[data?.map ?? 's'];
  return (
    <div className="lp-board">
      <div className="lp-board-head">
        <div className="lp-eyebrow">{text.eyebrow(mapName)}</div>
        <h3>{season ? season.name : text.fallbackTitle}</h3>
        {season && (
          <p className="lp-muted">
            {text.season(formatDate(season.startsAt), formatDate(season.endsAt), copy.map[season.prizeMap], season.topN)}
          </p>
        )}
      </div>
      {stats && (
        <div className="lp-stats">
          <div><b className="lp-live">{stats.live.count}</b><small>{text.onShiftNow}</small></div>
          <div><b>{format.n(stats.totals.plays)}</b><small>{text.totalPlays}</small></div>
          <div><b>{format.n(stats.totals.minutes)}</b><small>{text.totalMinutes}</small></div>
          <div><b>{format.n(stats.totals.players)}</b><small>{text.playerCount}</small></div>
        </div>
      )}
      <div className="lp-tabs" role="tablist">
        {(['rank', 'live', 'loyal'] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{text.tabs[id]}</button>
        ))}
      </div>
      {season?.prize && tab === 'rank' && (
        <div className="lp-prize">
          {season.prize}
          {text.prizeOriginal && <div>{text.prizeOriginal}</div>}
        </div>
      )}
      {tab === 'rank' && failed && <p className="lp-muted">{text.rankFail}</p>}
      {tab === 'rank' && !failed && !data && <p className="lp-muted">{copy.common.loading}</p>}
      {tab === 'rank' && data && data.entries.length === 0 && <p className="lp-muted">{text.emptyRank}</p>}
      {tab === 'rank' && data && data.entries.length > 0 && (
        <ol className="lp-rank">
          {data.entries.map((e) => (
            <li key={`${e.rank}-${e.nickname}`}>
              <span className={`lp-rank-no${e.rank <= 3 ? ' top' : ''}`}>{e.rank}</span>
              <span className="lp-rank-name">
                {e.nickname}
                <small>{e.phoneMasked}</small>
              </span>
              <span className="lp-rank-score">NT$ {format.n(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === 'live' && (
        (stats?.live.players.length ?? 0) === 0
          ? <p className="lp-muted">{text.emptyLive}</p>
          : (
            <ol className="lp-rank">
              {stats!.live.players.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span className={`lp-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                  <span className="lp-rank-name">{p.name}<small>{text.onShift(text.stay(p.seconds))}</small></span>
                  <span className="lp-rank-score">NT$ {format.n(p.score)}</span>
                </li>
              ))}
            </ol>
          )
      )}
      {tab === 'loyal' && (
        (stats?.topPlayers.length ?? 0) === 0
          ? <p className="lp-muted">{text.emptyLoyal}</p>
          : (
            <ol className="lp-rank">
              {stats!.topPlayers.map((p, i) => (
                <li key={p.phoneMasked}>
                  <span className={`lp-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                  <span className="lp-rank-name">{p.nickname}<small>{text.loyalMeta(p.phoneMasked, p.minutes)}</small></span>
                  <span className="lp-rank-score">{text.rounds(p.plays)}</span>
                </li>
              ))}
            </ol>
          )
      )}
      <a className="lp-link" href="/legal/game-rules/">{text.rules}</a>
    </div>
  );
}

export function GameFrame() {
  const frame = useCopy().gameFrame;
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-game">
      {playing ? (
        <iframe
          src="/game/index.html?embed=1"
          title={frame.title}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="lp-game-cover" onClick={() => setPlaying(true)}>
          <img src="/game/og-image.jpg?v=0930" alt={frame.alt} loading="lazy" />
          <span className="lp-play">{frame.play}</span>
        </button>
      )}
      <div className="lp-game-actions">
        <a className="lp-btn ghost" href="/game/index.html" target="_blank" rel="noopener">{frame.fullscreen}</a>
        <span className="lp-muted">{frame.hint}</span>
      </div>
    </div>
  );
}

const HOME_PATHS = ['/go-posting', '/proof', '/show', '/jiangcheng', '/center'] as const;

export function Landing() {
  const copy = useCopy();
  const home = copy.home;
  const brands = useBrands();
  const pages = copy.homePages.map((page, i) => ({ ...page, to: HOME_PATHS[i] }));
  return (
    <PublicFrame title={home.title}>
      <section id="top" className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div>
            <div className="lp-eyebrow">{home.eyebrow}</div>
            <h1>{home.h1a}<br />{home.h1b}</h1>
            <p className="lp-lead">{home.lead1}</p>
            <p className="lp-lead">{home.lead2}</p>
            <div className="lp-hero-cta">
              <a className="lp-btn" href="#game">{home.ctaGame}</a>
              <LocalLink className="lp-btn ghost" to="/go-posting">{home.ctaPrice}</LocalLink>
            </div>
          </div>
          <div className="lp-hero-art">
            {brands.map((b) => (
              <div key={b.slug} className="lp-hero-chip" style={{ borderColor: b.color }}>
                <img src={b.editor} alt={b.editorName} />
                <div>
                  <b style={{ color: b.color }}>{b.name}</b>
                  <small>{copy.common.aiEditor(b.editorName)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="game" className="lp-section game">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{home.gameEyebrow}</div>
          <h2>{home.gameTitle}</h2>
          <p className="lp-muted lp-sub">{home.gameSub}</p>
          <div className="lp-game-grid">
            <GameFrame />
            <Leaderboard />
          </div>
          <div className="lp-hero-cta">
            <a className="lp-btn" href="/game/index.html" target="_blank" rel="noopener">{home.openGame}</a>
            <LocalLink className="lp-btn ghost" to="/jiangcheng">{home.gameMore}</LocalLink>
          </div>
        </div>
      </section>

      <section id="posts" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{home.postsEyebrow}</div>
          <h2>{home.postsTitle}</h2>
          <p className="lp-muted lp-sub">{home.postsSub}</p>
          <BrandPosts />
        </div>
      </section>

      <section className="lp-section soft">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{home.priceEyebrow}</div>
          <h2>{home.priceTitle}</h2>
          <p className="lp-muted lp-sub">{home.priceSub}</p>
          <div className="lp-price">
            <div className="lp-price-hero">
              <div className="lp-post-meta">{home.priceMeta}</div>
              <div className="lp-amount">999<small>{home.priceUnit}</small></div>
              <p className="lp-muted">{home.priceNote}</p>
              <LocalLink className="lp-btn" to="/go-posting">{home.priceCta}</LocalLink>
            </div>
            <div>
              <p className="lp-muted">{home.priceAside}</p>
              <div className="lp-hero-cta">
                <LocalLink className="lp-btn ghost" to="/proof">{home.priceProof}</LocalLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-eyebrow">{home.pagesEyebrow}</div>
          <h2>{home.pagesTitle}</h2>
          <div className="lp-pages" style={{ marginTop: 28 }}>
            {pages.map((p) => (
              <LocalLink key={p.to} className="lp-page-card" to={p.to}>
                <b>{p.title}</b>
                <p>{p.body}</p>
                <span>{p.cta}</span>
              </LocalLink>
            ))}
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}

export const LANDING_CSS = `
.lp{--ink:#23301c;--green:#8CAA71;--green-soft:#EAF1E3;--muted:#6C6C6C;background:#fff;color:#3A3A3A;min-height:100vh;scroll-behavior:smooth}
.lp *{box-sizing:border-box}
.lp a{color:inherit}
.lp-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.lp-nav{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #E6E8E2}
.lp-nav-inner{display:flex;align-items:center;gap:20px;height:60px}
.lp-logo{text-decoration:none;font-weight:700;font-size:17px}
.lp-logo b{color:var(--green);font-weight:900;margin-right:4px}
.lp-nav nav{display:flex;gap:18px;margin-left:auto;font-size:14px}
.lp-nav nav a{text-decoration:none;color:var(--muted)}
.lp-nav nav a:hover{color:var(--ink)}
.lp-lang{display:flex;align-items:center;gap:2px;background:#F7F9F5;border:1px solid #E6E8E2;border-radius:999px;padding:3px;flex:none}
.lp-lang button{border:0;background:transparent;border-radius:999px;padding:5px 9px;font:700 12px inherit;color:var(--muted);cursor:pointer;line-height:1.2;white-space:nowrap}
.lp-lang button[aria-pressed=true]{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lp[lang=en]{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",sans-serif}
.lp[lang=ja]{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic","Noto Sans JP","PingFang TC",sans-serif}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--green);color:#fff !important;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;border:0;cursor:pointer;font-size:15px}
.lp-btn:hover{filter:brightness(.95)}
.lp-btn.small{padding:8px 16px;font-size:14px}
.lp-btn.ghost{background:transparent;color:var(--ink) !important;border:1px solid #cfd6c7}
.lp-eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--green);text-transform:uppercase;margin-bottom:8px}
.lp-muted{color:var(--muted);font-size:14px;line-height:1.7}
.lp-sub{max-width:720px;margin:8px 0 28px}
.lp h1{font-size:44px;line-height:1.2;color:var(--ink);margin:0 0 18px}
.lp h2{font-size:30px;line-height:1.3;color:var(--ink);margin:0}
.lp h3{font-size:19px;color:var(--ink);margin:0}
.lp-hero{background:linear-gradient(160deg,var(--green-soft) 0%,#fff 60%);padding:72px 0 64px}
.lp-hero-inner{display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:center}
.lp-lead{font-size:17px;line-height:1.8;color:#4a4a4a;max-width:560px}
.lp-hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.lp-hero-art{display:grid;gap:14px}
.lp-hero-chip{display:flex;align-items:center;gap:14px;background:#fff;border:2px solid;border-radius:18px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,.05)}
.lp-hero-chip img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#f4f4f4}
.lp-hero-chip b{display:block;font-size:16px}
.lp-hero-chip small{color:var(--muted)}
.lp-section{padding:72px 0}
.lp-section.soft{background:#F7F9F5}
.lp-brands{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lp-brand{border:1px solid #E6E8E2;border-top:4px solid var(--c);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:10px}
.lp-brand p{margin:0;font-size:14px;line-height:1.75}
.lp-brand-logo{height:40px;width:auto;align-self:flex-start;object-fit:contain}
.lp-brand-tag{color:var(--c);font-weight:700}
.lp-brand .lp-link{margin-top:auto;color:var(--c)}
.lp-link{font-weight:700;font-size:14px;text-decoration:underline;text-underline-offset:3px}
.lp-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:28px}
.lp-flow-item{background:#fff;border:1px solid #E6E8E2;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:6px}
.lp-flow-item span{width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px}
.lp-flow-item small{color:var(--muted);line-height:1.6}
.lp-modules{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.lp-module{border:1px solid #E6E8E2;border-radius:14px;padding:18px 20px}
.lp-module b{color:var(--ink)}
.lp-module p{margin:6px 0 0;font-size:14px;line-height:1.7;color:#555}
.lp-section.game{background:linear-gradient(180deg,#fff 0%,var(--green-soft) 100%)}
.lp-game-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:start}
.lp-game iframe,.lp-game-cover{width:100%;aspect-ratio:16/10;border:0;border-radius:18px;background:#cfe6ee;display:block;box-shadow:0 12px 32px rgba(0,0,0,.08)}
.lp-game iframe{min-height:560px}
.lp-game-cover{position:relative;padding:0;cursor:pointer;overflow:hidden;aspect-ratio:1200/630}
.lp-game-cover img{width:100%;height:100%;object-fit:cover}
.lp-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#ff6b1a;color:#fff;font-weight:900;font-size:20px;padding:14px 32px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.lp-game-actions{display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}
.lp-board{background:#fff;border:1px solid #E6E8E2;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:12px}
.lp-board-head p{margin:4px 0 0}
.lp-prize{background:#FDEBD3;color:#8a4b00;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.6;white-space:pre-line}
.lp-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.lp-tabs{display:flex;gap:4px;background:#F7F9F5;border-radius:12px;padding:3px}
.lp-tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px 4px;font:700 13px inherit;color:var(--muted);cursor:pointer}
.lp-tabs button[aria-selected=true]{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lp-stats div{background:#F7F9F5;border-radius:12px;padding:8px;text-align:center}
.lp-stats b{display:block;font-size:20px;color:var(--ink);font-variant-numeric:tabular-nums}
.lp-stats small{font-size:12px;color:var(--muted)}
.lp-live{color:#1fae78 !important}
.lp-rank{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lp-rank li{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px dashed #eee}
.lp-rank-no{width:26px;height:26px;border-radius:50%;background:#f0f0f0;display:grid;place-items:center;font-weight:800;font-size:13px;flex:none}
.lp-rank-no.top{background:#ffcc33;color:#23301c}
.lp-rank-name{flex:1;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-rank-name small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.lp-rank-score{font-weight:800;color:#ff6b1a;font-variant-numeric:tabular-nums}
.lp-post,.lp-press,.lp-integ-card{border:1px solid #E6E8E2;border-top:4px solid var(--c);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:10px;background:#fff}
.lp-post header{display:flex;align-items:center;gap:12px}
.lp-post header img{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#f4f4f4}
.lp-post header b{display:block;color:var(--c)}
.lp-post header small{color:var(--muted);font-size:12px}
.lp-post h3,.lp-press h3{font-size:16px;line-height:1.5}
.lp-post p,.lp-press p,.lp-integ-card p{margin:0;font-size:14px;line-height:1.75}
.lp-post .lp-link,.lp-press .lp-link{margin-top:auto;color:var(--c)}
.lp-post-meta{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.03em}
.lp-proof{display:grid;gap:8px}
.lp-results{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.lp-result{background:#fff;border:1px solid #E6E8E2;border-radius:16px;padding:18px 16px}
.lp-result b{display:block;font-size:32px;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.lp-result span{display:block;margin-top:8px;font-size:14px;font-weight:800;color:var(--ink)}
.lp-result small{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5;font-weight:400}
.lp-proof-title{margin:28px 0 14px !important;font-size:20px !important}
.lp-metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lp-metric{background:#F7F9F5;border-radius:12px;padding:10px 12px}
.lp-metric.wide{grid-column:1 / -1}
.lp-metric b{display:block;font-size:22px;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums}
.lp-metric small{color:var(--muted);font-size:12px}
.lp-mix{font-size:13px !important;color:var(--muted) !important}
.lp-plat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.lp-plat-card{background:#fff;border:1px solid #E6E8E2;border-radius:16px;padding:16px 18px}
.lp-plat-card b{display:block;margin-top:6px;font-size:28px;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.lp-plat-card small{color:var(--muted);font-size:12px}
.lp-plat-card p{margin:8px 0 0;font-size:13px;line-height:1.6}
.lp-barline{height:8px;border-radius:999px;background:#F7F9F5;margin-top:12px;overflow:hidden}
.lp-barline i{display:block;height:100%;background:#8CAA71;border-radius:999px;min-width:0}
.lp-proof .lp-note{margin:8px 0 0}
.lp-trend{margin-top:18px;background:#fff;border:1px solid #E6E8E2;border-radius:18px;padding:18px 18px 14px}
.lp-trend-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}
.lp-trend-head h3{margin:0;font-size:20px;color:var(--ink)}
.lp-trend-head p{margin:6px 0 0;color:var(--muted);font-size:13px;line-height:1.6;max-width:46em}
.lp-trend-head > b{text-align:right;font-size:28px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.lp-trend-head small{display:block;margin-top:6px;font-size:12px;font-weight:700;color:var(--muted)}
.lp-trend svg{width:100%;height:auto;display:block;margin-top:8px}
.lp-trend svg text{font-family:inherit}
.lp-trend-grid{stroke:#E6E8E2;stroke-width:1}
.lp-trend-tick{font-size:11px;fill:#6C6C6C;text-anchor:end}
.lp-trend-x{font-size:11px;fill:#6C6C6C;text-anchor:middle}
.lp-trend-x.on{fill:#23301c;font-weight:700}
.lp-trend-cursor{stroke:transparent;stroke-width:1}
.lp-trend-cursor.on{stroke:#23301c;stroke-dasharray:3 4;opacity:.35}
.lp-trend-area{opacity:.12}
.lp-trend-line{fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:lp-draw 1.15s ease forwards}
.lp-trend-line.d1{animation-delay:.08s}
.lp-trend-line.d2{animation-delay:.18s}
.lp-trend-dot{stroke:#fff;stroke-width:1.5}
.lp-trend-hit{fill:transparent;cursor:pointer}
.lp-trend-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;font-size:13px;font-weight:700;color:var(--ink)}
.lp-trend-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
.lp-trend-detail{margin:12px 0 0;font-size:14px;line-height:1.6}
.lp-trend-split{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.lp-trend-split div{background:#F7F9F5;border-radius:12px;padding:10px 12px}
.lp-trend-split span{display:block;font-size:12px;font-weight:800}
.lp-trend-split b{display:block;margin-top:2px;font-size:20px;color:var(--ink);font-variant-numeric:tabular-nums}
.lp-trend-split small{color:var(--muted);font-size:12px}
.lp-reach{margin-top:16px;display:grid;gap:8px}
.lp-reach p{margin:0 0 2px;font-size:13px;font-weight:800;color:var(--ink)}
.lp-reach-row{display:grid;grid-template-columns:92px 1fr auto;gap:10px;align-items:center;font-size:13px}
.lp-reach-row span{font-weight:700;color:var(--ink)}
.lp-reach-row b{font-variant-numeric:tabular-nums;color:var(--ink)}
.lp-reach-track{height:10px;border-radius:999px;background:#F7F9F5;overflow:hidden}
.lp-reach-track i{display:block;height:100%;width:0;border-radius:999px;transition:width .9s cubic-bezier(.2,.7,.2,1)}
.lp-reach.on .lp-reach-track i{width:var(--w)}
.lp-weeks{display:flex;gap:6px;overflow-x:auto;margin-top:12px;padding-bottom:2px}
.lp-weeks button{flex:none;border:1px solid #E6E8E2;background:#fff;border-radius:999px;padding:6px 10px;font:700 12px inherit;color:var(--muted);cursor:pointer}
.lp-weeks button[aria-selected=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
@keyframes lp-draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .lp-trend-line{animation:none;stroke-dashoffset:0}
  .lp-reach-track i{transition:none;width:var(--w)}
}
.lp-press{text-decoration:none;transition:transform .15s,box-shadow .15s}
.lp-press:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.06)}
.lp-podcast{display:grid;grid-template-columns:320px 1fr;gap:32px;align-items:center;margin-top:28px}
.lp-podcast-cover img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:20px;display:block;box-shadow:0 12px 32px rgba(0,0,0,.1)}
.lp-podcast-body{display:flex;flex-direction:column;gap:12px}
.lp-podcast-body h3{font-size:24px}
.lp-podcast-body .lp-hero-cta{margin-top:4px}
.lp-episode{background:#F7F9F5;border-radius:14px;padding:14px 16px;display:grid;gap:6px}
.lp-episode p{margin:0;font-size:14px;line-height:1.7;color:#555}
.lp-feeds{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}
.lp-feeds a{color:var(--muted)}
.lp-shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:24px}
.lp-shots figure{margin:0}
.lp-shots img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;display:block}
.lp-shots figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.lp-poster{margin:28px 0 0}
.lp-poster img{width:100%;height:auto;border-radius:18px;display:block;box-shadow:0 12px 32px rgba(0,0,0,.08)}
.lp-poster.tall{max-width:760px}
.lp-poster figcaption{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6}
.lp-integ-title{margin:44px 0 16px !important;font-size:20px !important}
.lp-integ{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.lp-integ.stack{grid-template-columns:1fr}
.lp-integ-card .lp-btn{align-self:flex-start;margin-top:auto}
.lp-play-frame{width:100%;height:min(78vh,820px);min-height:640px;border:0;border-radius:14px;background:#cfe6ee;display:block}
.lp-integ-card .lp-link{align-self:flex-start;font-weight:700;font-size:14px;color:var(--c)}
.lp-demo-note{font-size:12px !important;color:#8a4b00;background:#FDEBD3;border-radius:8px;padding:6px 10px;align-self:flex-start}
.lp-footer{border-top:1px solid #E6E8E2;padding:28px 0;font-size:13px;color:var(--muted)}
.lp-footer-inner{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lp-footer nav{display:flex;gap:18px}
@media (max-width:900px){
  .lp h1{font-size:32px}
  .lp h2{font-size:24px}
  .lp-hero{padding:48px 0}
  .lp-hero-inner,.lp-game-grid,.lp-podcast,.lp-integ{grid-template-columns:1fr}
  .lp-podcast-cover{max-width:320px}
  .lp-brands,.lp-modules,.lp-results,.lp-plat-grid,.lp-trend-split{grid-template-columns:1fr}
  .lp-trend-head{flex-direction:column;align-items:flex-start}
  .lp-reach-row{grid-template-columns:72px 1fr auto}
  .lp-results{grid-template-columns:1fr 1fr}
  .lp-flow{grid-template-columns:1fr 1fr}
  .lp-nav-inner{height:auto;flex-wrap:wrap;padding:10px 0;gap:10px}
  .lp-nav nav{display:flex;order:3;width:100%;margin-left:0;overflow-x:auto;gap:14px;padding-bottom:6px}
  .lp-nav-inner .lp-btn{margin-left:auto}
  .lp-section{padding:52px 0}
  .lp-pages,.lp-price{grid-template-columns:1fr}
  .lp-price-hero .lp-amount{font-size:44px}
}
.lp-nav nav a[aria-current=page]{color:var(--ink);font-weight:800}
.lp-pages{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.lp-page-card{display:flex;flex-direction:column;gap:8px;border:1px solid #E6E8E2;border-radius:16px;padding:20px;text-decoration:none;background:#fff}
.lp-page-card:hover{border-color:var(--green)}
.lp-page-card b{color:var(--ink);font-size:17px}
.lp-page-card p{margin:0;font-size:14px;line-height:1.7;color:#555}
.lp-page-card span{margin-top:auto;font-weight:700;font-size:14px;color:var(--green)}
.lp-price{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:start}
.lp-price-hero{background:#fff;border:2px solid var(--green);border-radius:20px;padding:28px}
.lp-price-hero .lp-amount{font-size:56px;font-weight:900;color:var(--ink);line-height:1;margin:8px 0}
.lp-price-hero .lp-amount small{font-size:18px;font-weight:700;color:var(--muted)}
.lp-table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6E8E2}
.lp-table th,.lp-table td{text-align:left;padding:14px 16px;border-bottom:1px solid #E6E8E2;font-size:15px;vertical-align:top}
.lp-table th{background:#F7F9F5;color:var(--ink);font-size:13px}
.lp-table tr:last-child td{border-bottom:0}
.lp-table td:first-child{font-weight:700;color:var(--ink);white-space:nowrap}
.lp-note{font-size:13px;color:var(--muted);line-height:1.7}
.lp-form{display:grid;gap:14px;background:#fff;border:1px solid #E6E8E2;border-radius:20px;padding:24px;max-width:640px}
.lp-form label{display:grid;gap:6px;font-size:14px;font-weight:700;color:var(--ink)}
.lp-form input,.lp-form textarea{font:inherit;font-weight:400;padding:12px 14px;border-radius:10px;border:1px solid #D5D8D0;background:#fff}
.lp-form textarea{min-height:96px;resize:vertical}
.lp-form .lp-hp{position:absolute;left:-9999px;height:0;overflow:hidden}
.lp-form-msg{margin:0;font-size:14px;line-height:1.6}
.lp-form-msg.ok{color:#1f7a3a}
.lp-form-msg.bad{color:#9a3412}
.lp-week-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
.lp-week-cards div{background:#fff;border:1px solid #E6E8E2;border-radius:14px;padding:14px 12px;text-align:center}
.lp-week-cards b{display:block;font-size:26px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.2}
.lp-week-cards small{color:var(--muted);font-size:12px}
.lp-heat{display:flex;gap:12px;align-items:flex-start;border-radius:14px;padding:14px 16px;margin-top:16px}
.lp-heat b{display:block;margin-bottom:4px}
.lp-heat p{margin:0;font-size:14px;line-height:1.6}
.lp-heat.hot{background:#fff4e8;color:#9a3412}
.lp-heat.steady{background:#EAF1E3;color:#23301c}
.lp-heat.cool{background:#eef6fb;color:#1e3a5f}
.lp-heat.building{background:#F7F9F5;color:#3A3A3A}
.lp-bars{display:flex;gap:8px;align-items:flex-end;margin-top:22px;overflow-x:auto;padding-bottom:6px}
.lp-bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;min-width:44px;flex:1}
.lp-scene-photos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.lp-scene-photos figure{margin:0}
.lp-scene-photos img{width:100%;height:auto;border-radius:16px;display:block;box-shadow:0 10px 28px rgba(0,0,0,.06)}
.lp-scene-photos figcaption{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6}
.lp-task-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
.lp-task{background:#fff;border:1px solid #E6E8E2;border-top:4px solid var(--c);border-radius:16px;padding:16px}
.lp-task b{display:block;color:var(--ink);margin-bottom:6px}
.lp-task p{margin:0;font-size:14px;line-height:1.7}
.lp-task strong{display:block;margin-top:10px;font-size:20px;font-variant-numeric:tabular-nums}
.lp-scene-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
.lp-scene{display:grid;gap:4px;background:#fff;border:1px solid #E6E8E2;border-radius:14px;padding:12px 14px;text-decoration:none}
.lp-scene:hover{border-color:var(--green)}
.lp-scene b{color:var(--ink)}
.lp-scene span{font-size:13px;line-height:1.55;color:#555}
.lp-bar i{display:block;width:100%;max-width:42px;border-radius:8px 8px 4px 4px;background:#8CAA71}
.lp-bar.today i{background:#ff6b1a}
.lp-bar b{font-size:12px;font-variant-numeric:tabular-nums}
.lp-bar small{font-size:11px;color:var(--muted)}
.lp-jobs{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.lp-jobs span{background:#fff;border:1px solid #E6E8E2;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700}
.lp-wish-list{display:grid;gap:10px;margin-top:18px}
.lp-wish{background:#fff;border:1px solid #E6E8E2;border-radius:14px;padding:14px 16px;display:grid;gap:8px}
.lp-wish-top{display:flex;justify-content:space-between;gap:8px;align-items:center}
.lp-kind{font-size:12px;font-weight:800;color:var(--green)}
.lp-support{border:1px solid #cfd6c7;background:#fff;border-radius:999px;padding:6px 12px;font:700 13px inherit;cursor:pointer;color:var(--ink)}
.lp-support[aria-pressed=true]{background:#EAF1E3;border-color:var(--green)}
.lp-kind-picks{display:flex;gap:8px;flex-wrap:wrap}
.lp-kind-picks button{border:1px solid #cfd6c7;background:#fff;border-radius:999px;padding:6px 12px;font:700 13px inherit;cursor:pointer}
.lp-kind-picks button[aria-pressed=true]{background:var(--green);color:#fff;border-color:var(--green)}
@media (max-width:900px){
  .lp-week-cards{grid-template-columns:1fr 1fr}
  .lp-scene-photos,.lp-task-grid{grid-template-columns:1fr}
  .lp-scene-grid{grid-template-columns:1fr 1fr}
}
`;

export function PublicFrame({ title, children }: { title: string; children: ReactNode }) {
  const { user } = useAuth();
  const { locale, path } = useLocale();
  const copy = useCopy();
  const here = path === '/' ? '/welcome' : path;

  useEffect(() => {
    const previousTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? '';
    document.title = `${title}${copy.titleJoin}${copy.brandName}`;
    if (meta) meta.setAttribute('content', copy.metaDescription);
    return () => {
      document.title = previousTitle;
      if (meta) meta.setAttribute('content', previousDescription);
    };
  }, [title, copy]);

  return (
    <div className="lp" lang={locale === 'zh' ? 'zh-Hant' : locale}>
      <style>{LANDING_CSS}</style>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <LocalLink to="/welcome" className="lp-logo"><b>GO</b> {copy.brandName.replace(/^GO\s?/, '')}</LocalLink>
          <nav>
            {NAV.map((item) => (
              <LocalLink key={item.to} to={item.to} aria-current={here === item.to ? 'page' : undefined}>{copy.nav[item.key]}</LocalLink>
            ))}
          </nav>
          <LanguageSwitch />
          {user
            ? <Link className="lp-btn small" to="/home">{copy.nav.enter}</Link>
            : <Link className="lp-btn small" to="/login">{copy.nav.login}</Link>}
        </div>
      </header>
      {children}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span>© {new Date().getFullYear()} {copy.brandName}</span>
          <nav>
            <LocalLink to="/go-posting">{copy.footer.posting}</LocalLink>
            <a href="/privacy">{copy.footer.privacy}</a>
            <a href="/legal/game-rules/">{copy.footer.rules}</a>
            {user ? <Link to="/home">{copy.footer.enter}</Link> : <Link to="/login">{copy.footer.teamLogin}</Link>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
