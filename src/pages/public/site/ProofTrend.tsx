import { useEffect, useState } from 'react';
import { useCopy, useFormat } from '@/pages/public/locale';

export interface TrendDayBrand {
  published: number;
  views: number;
  interactions: number;
  followersGained: number;
}

export interface TrendDay {
  day: string;
  brands: Record<string, TrendDayBrand>;
}

export interface TrendBrand {
  slug: string;
  name: string;
  color: string;
}

export interface TrendKeyword {
  word: string;
  views: number;
  posts: number;
}

const W = 720;
const H = 220;
const FAN_H = 92;
const PAD = { l: 48, r: 14, t: 16, b: 28 };

function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function emptyBrand(): TrendDayBrand {
  return { published: 0, views: 0, interactions: 0, followersGained: 0 };
}

function brandOf(day: TrendDay, slug: string): TrendDayBrand {
  return day.brands[slug] ?? emptyBrand();
}

function sumOf(day: TrendDay, brands: TrendBrand[], key: keyof TrendDayBrand): number {
  return brands.reduce((sum, brand) => sum + brandOf(day, brand.slug)[key], 0);
}

function linePath(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
}

export function ProofTrend({
  days,
  brands,
  keywords,
}: {
  days: TrendDay[];
  brands: TrendBrand[];
  keywords: TrendKeyword[];
}) {
  const copy = useCopy().trend;
  const format = useFormat();
  const [active, setActive] = useState(Math.max(0, days.length - 1));
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (days.length < 2) return null;

  const series = brands.map((brand) => days.map((day) => brandOf(day, brand.slug).views));
  const totals = days.map((_, i) => series.reduce((sum, row) => sum + row[i], 0));
  const followerTotals = days.map((day) => sumOf(day, brands, 'followersGained'));
  const max = Math.max(1, ...series.flat());
  const fanMax = Math.max(1, ...followerTotals);
  const hasFollowers = followerTotals.some((n) => n > 0);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const fanInner = FAN_H - 22 - 16;
  const xAt = (i: number) => PAD.l + (i / (days.length - 1)) * innerW;
  const yAt = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const ticks = [max, max / 2, 0];
  const index = Math.min(active, days.length - 1);
  const day = days[index];
  const windowViews = totals.reduce((sum, n) => sum + n, 0);
  const windowFollowers = followerTotals.reduce((sum, n) => sum + n, 0);
  const peakIndex = totals.reduce((best, n, i) => (n > totals[best] ? i : best), 0);
  const postingDays = totals.filter((n) => n > 0).sort((a, b) => a - b);
  const median = postingDays.length ? postingDays[Math.floor((postingDays.length - 1) / 2)] : 0;
  const multiple = median > 0 ? totals[peakIndex] / median : 0;
  const showAdvantage = multiple >= 2 && totals[peakIndex] > 0;
  const timesLabel = multiple >= 10 ? String(Math.round(multiple)) : multiple.toFixed(1);
  const showLabel = (i: number) => i % 4 === 0 || i === days.length - 1 || i === index;

  return (
    <section className={`lp-trend${drawn ? ' on' : ''}`} aria-label={copy.aria}>
      <div className="lp-trend-head">
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.sub}</p>
          {showAdvantage && <p className="lp-trend-advantage">{copy.advantage(dayLabel(days[peakIndex].day), timesLabel)}</p>}
        </div>
      </div>

      <div className="lp-trend-stats">
        <div><b>{format.n(windowViews)}</b><small>{copy.views}</small></div>
        <div><b>{format.n(Math.round(windowViews / days.length))}</b><small>{copy.avg}</small></div>
        <div>
          <b>{format.n(totals[peakIndex])}</b>
          <small>{copy.peak} · {dayLabel(days[peakIndex].day)}</small>
        </div>
        <div>
          <b>{hasFollowers ? format.n(windowFollowers) : '—'}</b>
          <small>{copy.windowFollowers}</small>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.chartAria}>
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="lp-trend-grid" />
              <text x={PAD.l - 8} y={y + 4} className="lp-trend-tick">{format.compact(tick)}</text>
            </g>
          );
        })}
        <line x1={xAt(index)} x2={xAt(index)} y1={PAD.t} y2={PAD.t + innerH} className="lp-trend-cursor on" />
        {brands.map((brand, bi) => {
          const pts = series[bi].map((v, i) => [xAt(i), yAt(v)] as [number, number]);
          return (
            <g key={brand.slug}>
              <path d={`${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)},${PAD.t + innerH} L${pts[0][0].toFixed(1)},${PAD.t + innerH} Z`} fill={brand.color} className="lp-trend-area" />
              <path d={linePath(pts)} stroke={brand.color} className={`lp-trend-line d${bi}`} pathLength={1} />
              {pts.map((p, i) => (
                <circle key={days[i].day} cx={p[0]} cy={p[1]} r={i === index || i === peakIndex ? 4.2 : 2.2} fill={brand.color} className="lp-trend-dot" />
              ))}
            </g>
          );
        })}
        {days.map((item, i) => showLabel(i) && (
          <text key={item.day} x={xAt(i)} y={H - 8} className={i === index ? 'lp-trend-x on' : 'lp-trend-x'}>{dayLabel(item.day)}</text>
        ))}
        {days.map((item, i) => {
          const prev = i === 0 ? PAD.l : (xAt(i - 1) + xAt(i)) / 2;
          const next = i === days.length - 1 ? W - PAD.r : (xAt(i) + xAt(i + 1)) / 2;
          return (
            <rect
              key={`hit-${item.day}`}
              x={prev}
              y={PAD.t}
              width={Math.max(8, next - prev)}
              height={innerH}
              className="lp-trend-hit"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <title>{copy.tooltip(dayLabel(item.day), format.n(totals[i]), format.n(followerTotals[i]))}</title>
            </rect>
          );
        })}
      </svg>

      <div className="lp-trend-legend">
        {brands.map((brand) => (
          <span key={brand.slug}><i style={{ background: brand.color }} />{brand.name}</span>
        ))}
      </div>

      {hasFollowers ? (
        <svg viewBox={`0 0 ${W} ${FAN_H}`} role="img" aria-label={copy.followerChartAria} className="lp-fan-chart">
          <text x={PAD.l} y={14} className="lp-fan-label">{copy.followers}</text>
          {days.map((item, i) => {
            let y = 22 + fanInner;
            const slot = innerW / days.length;
            const barW = Math.max(3, slot * 0.62);
            return (
              <g key={item.day} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
                {brands.map((brand) => {
                  const gained = brandOf(item, brand.slug).followersGained;
                  const h = (gained / fanMax) * fanInner;
                  y -= h;
                  return <rect key={brand.slug} x={xAt(i) - barW / 2} y={y} width={barW} height={Math.max(0, h)} fill={brand.color} rx={1.5} />;
                })}
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="lp-fan-note">{copy.followersPending}</p>
      )}

      <p className="lp-trend-detail">
        {copy.detail(
          dayLabel(day.day),
          format.n(sumOf(day, brands, 'published')),
          format.n(sumOf(day, brands, 'views')),
          format.n(sumOf(day, brands, 'followersGained')),
          format.n(sumOf(day, brands, 'interactions')),
        )}
      </p>
      <div className="lp-trend-split">
        {brands.map((brand) => {
          const row = brandOf(day, brand.slug);
          return (
            <div key={brand.slug}>
              <span style={{ color: brand.color }}>{brand.name}</span>
              <b>{format.n(row.views)}</b>
              <small>{copy.views} · {copy.splitFollowers(format.n(row.followersGained))}</small>
            </div>
          );
        })}
      </div>

      {keywords.length > 0 && (
        <div className="lp-keys-block">
          <p>{copy.keywordsTitle}</p>
          <small>{copy.keywordsSub}</small>
          <div className="lp-keys">
            {keywords.map((item) => (
              <div key={item.word} className="lp-key">
                <b>{item.word}</b>
                <small>{copy.keywordMeta(format.n(item.views), format.n(item.posts))}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lp-weeks" role="tablist" aria-label={copy.daysAria}>
        {days.map((item, i) => (
          <button key={item.day} type="button" role="tab" aria-selected={i === index} onClick={() => setActive(i)}>
            {dayLabel(item.day)}
          </button>
        ))}
      </div>
    </section>
  );
}
