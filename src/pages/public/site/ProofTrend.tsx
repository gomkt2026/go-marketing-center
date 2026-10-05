import { useEffect, useState } from 'react';

export interface TrendWeekBrand {
  published: number;
  impressions: number;
  interactions: number;
}

export interface TrendWeek {
  week: string;
  brands: Record<string, TrendWeekBrand>;
}

export interface TrendBrand {
  slug: string;
  name: string;
  color: string;
  recentImpressions: number;
}

const W = 720;
const H = 248;
const PAD = { l: 48, r: 14, t: 16, b: 30 };

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

function compact(n: number): string {
  if (n >= 10000) {
    const v = n / 10000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}萬`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}千`;
  return String(Math.round(n));
}

function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function emptyBrand(): TrendWeekBrand {
  return { published: 0, impressions: 0, interactions: 0 };
}

function brandOf(week: TrendWeek, slug: string): TrendWeekBrand {
  return week.brands[slug] ?? emptyBrand();
}

function linePath(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
}

export function ProofTrend({ weeks, brands }: { weeks: TrendWeek[]; brands: TrendBrand[] }) {
  const [active, setActive] = useState(Math.max(0, weeks.length - 1));
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (weeks.length < 2) return null;

  const series = brands.map((brand) => weeks.map((week) => brandOf(week, brand.slug).impressions));
  const max = Math.max(1, ...series.flat());
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const baseY = PAD.t + innerH;
  const xAt = (i: number) => PAD.l + (i / (weeks.length - 1)) * innerW;
  const yAt = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const ticks = [max, max / 2, 0];
  const recentMax = Math.max(1, ...brands.map((b) => b.recentImpressions));
  const week = weeks[Math.min(active, weeks.length - 1)];
  const weekPublished = brands.reduce((sum, b) => sum + brandOf(week, b.slug).published, 0);
  const weekImpressions = brands.reduce((sum, b) => sum + brandOf(week, b.slug).impressions, 0);
  const weekInteractions = brands.reduce((sum, b) => sum + brandOf(week, b.slug).interactions, 0);
  const windowImpressions = weeks.reduce(
    (sum, item) => sum + brands.reduce((inner, b) => inner + brandOf(item, b.slug).impressions, 0),
    0,
  );

  return (
    <section className="lp-trend" aria-label="近八週曝光走勢">
      <div className="lp-trend-head">
        <div>
          <h3>三個品牌在台灣的曝光走勢</h3>
          <p>近八週發出的貼文，到目前被看到的次數。受眾在台灣，這張圖看的是發文成效。</p>
        </div>
        <b>{fmt(windowImpressions)}<small>近八週曝光</small></b>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近八週三品牌曝光折線">
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="lp-trend-grid" />
              <text x={PAD.l - 8} y={y + 4} className="lp-trend-tick">{compact(tick)}</text>
            </g>
          );
        })}
        {weeks.map((item, i) => (
          <line
            key={item.week}
            x1={xAt(i)}
            x2={xAt(i)}
            y1={PAD.t}
            y2={baseY}
            className={i === active ? 'lp-trend-cursor on' : 'lp-trend-cursor'}
          />
        ))}
        {brands.map((brand, bi) => {
          const pts = series[bi].map((v, i) => [xAt(i), yAt(v)] as [number, number]);
          return (
            <g key={brand.slug}>
              <path d={`${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`} fill={brand.color} className="lp-trend-area" />
              <path d={linePath(pts)} stroke={brand.color} className={`lp-trend-line d${bi}`} pathLength={1} />
              {pts.map((p, i) => (
                <circle key={weeks[i].week} cx={p[0]} cy={p[1]} r={i === active ? 4.5 : 3} fill={brand.color} className="lp-trend-dot" />
              ))}
            </g>
          );
        })}
        {weeks.map((item, i) => (
          <text key={item.week} x={xAt(i)} y={H - 8} className={i === active ? 'lp-trend-x on' : 'lp-trend-x'}>{weekLabel(item.week)}</text>
        ))}
        {weeks.map((item, i) => {
          const prev = i === 0 ? PAD.l : (xAt(i - 1) + xAt(i)) / 2;
          const next = i === weeks.length - 1 ? W - PAD.r : (xAt(i) + xAt(i + 1)) / 2;
          return (
            <rect
              key={`hit-${item.week}`}
              x={prev}
              y={PAD.t}
              width={Math.max(8, next - prev)}
              height={innerH}
              className="lp-trend-hit"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <title>{`${weekLabel(item.week)} 被看到 ${fmt(brands.reduce((sum, b) => sum + brandOf(item, b.slug).impressions, 0))} 次`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="lp-trend-legend">
        {brands.map((brand) => (
          <span key={brand.slug}><i style={{ background: brand.color }} />{brand.name}</span>
        ))}
      </div>

      <p className="lp-trend-detail">
        {weekLabel(week.week)} 那週發出 {fmt(weekPublished)} 則，到目前被看到 {fmt(weekImpressions)} 次，互動 {fmt(weekInteractions)} 次。
      </p>
      <div className="lp-trend-split">
        {brands.map((brand) => {
          const row = brandOf(week, brand.slug);
          return (
            <div key={brand.slug}>
              <span style={{ color: brand.color }}>{brand.name}</span>
              <b>{fmt(row.impressions)}</b>
              <small>曝光 · 互動 {fmt(row.interactions)}</small>
            </div>
          );
        })}
      </div>

      <div className={`lp-reach${drawn ? ' on' : ''}`}>
        <p>近 28 天，誰被看到比較多</p>
        {brands.map((brand) => (
          <div key={brand.slug} className="lp-reach-row">
            <span>{brand.name}</span>
            <div className="lp-reach-track" aria-hidden="true">
              <i style={{ background: brand.color, ['--w' as string]: `${Math.round((brand.recentImpressions / recentMax) * 100)}%` }} />
            </div>
            <b>{fmt(brand.recentImpressions)}</b>
          </div>
        ))}
      </div>

      <div className="lp-weeks" role="tablist" aria-label="選擇週次">
        {weeks.map((item, i) => (
          <button key={item.week} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
            {weekLabel(item.week)}
          </button>
        ))}
      </div>
    </section>
  );
}
