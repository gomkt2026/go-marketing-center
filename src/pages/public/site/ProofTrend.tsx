import { useState } from 'react';
import { useCopy, useFormat } from '@/pages/public/locale';

export interface TrendWeek {
  week: string;
  published: number;
  views: number;
  interactions: number;
  followersGained: number;
  brands?: Record<string, number>;
}

export interface TrendBrand {
  slug: string;
  name: string;
  color: string;
}

const W = 360;
const H = 148;
const PAD = { l: 36, r: 18, t: 22, b: 24 };
const CHIP_H = 16;

function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function linePath(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
}

export function ProofTrend({ weeks, brands }: { weeks: TrendWeek[]; brands: TrendBrand[] }) {
  const copy = useCopy().trend;
  const format = useFormat();
  const [picked, setPicked] = useState<number | null>(null);
  if (weeks.length < 2) return null;

  const shown = weeks.slice(-8);
  const cumulative: number[] = [];
  shown.forEach((week, i) => {
    cumulative.push((cumulative[i - 1] ?? 0) + week.views);
  });
  const series = brands.map((brand) => {
    const values: number[] = [];
    shown.forEach((week, i) => {
      values.push((values[i - 1] ?? 0) + (week.brands?.[brand.slug] ?? 0));
    });
    return { brand, values, total: values[values.length - 1] ?? 0 };
  });
  const max = Math.max(1, ...series.map((item) => item.total));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const xAt = (i: number) => PAD.l + (shown.length === 1 ? innerW / 2 : (i / (shown.length - 1)) * innerW);
  const yAt = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const hasFollowers = shown.some((week) => week.followersGained > 0);
  const totalFollowers = shown.reduce((sum, week) => sum + week.followersGained, 0);
  const active = picked != null && picked < shown.length ? picked : null;
  const hitW = shown.length <= 1 ? innerW : innerW / (shown.length - 1);

  const labels = active == null ? [] : series
    .map((item) => {
      const total = item.values[active] ?? 0;
      const text = format.compact(total);
      return {
        slug: item.brand.slug,
        color: item.brand.color,
        px: xAt(active),
        py: yAt(total),
        text,
        width: Math.max(34, text.length * 9.2),
        ly: 0,
      };
    })
    .sort((a, b) => a.py - b.py);
  const placeLeft = active != null && active >= Math.floor(shown.length / 2);
  const stackWidth = labels.reduce((wide, item) => Math.max(wide, item.width), 36);
  const anchorX = active == null ? 0 : xAt(active);
  const rawLeft = placeLeft ? anchorX - stackWidth - 12 : anchorX + 12;
  const stackLeft = Math.min(W - stackWidth - 4, Math.max(PAD.l + 4, rawLeft));
  let nextTop = 2;
  for (const item of labels) {
    item.ly = Math.max(nextTop, item.py - CHIP_H / 2);
    nextTop = item.ly + CHIP_H + 4;
  }
  const bottom = H - PAD.b - 1;
  const last = labels[labels.length - 1];
  if (last && last.ly + CHIP_H > bottom) {
    const shift = last.ly + CHIP_H - bottom;
    for (const item of labels) item.ly = Math.max(2, item.ly - shift);
  }

  function toggle(index: number) {
    setPicked((current) => (current === index ? null : index));
  }

  return (
    <section className="lp-trend" aria-label={copy.aria}>
      <div className="lp-trend-head">
        <div>
          <h3>{copy.title}</h3>
          <p>{active == null ? copy.sub : copy.pickedWeek(weekLabel(shown[active].week))}</p>
        </div>
        <b>{format.n(cumulative[cumulative.length - 1] ?? 0)}<small>{copy.cumulative}</small></b>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.chartAria}>
        {[max, max / 2, 0].map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="lp-trend-grid" />
              <text x={PAD.l - 6} y={y + 3} className="lp-trend-tick">{format.compact(tick)}</text>
            </g>
          );
        })}
        {active != null && (
          <line x1={xAt(active)} x2={xAt(active)} y1={PAD.t} y2={H - PAD.b} className="lp-trend-cursor on" />
        )}
        {series.map((item) => {
          const pts = item.values.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
          const end = pts[pts.length - 1];
          const mark = active == null ? null : pts[active];
          return (
            <g key={item.brand.slug}>
              <path d={linePath(pts)} className="lp-trend-line" pathLength={1} style={{ stroke: item.brand.color }} />
              <circle cx={end[0]} cy={end[1]} r={3.5} fill={item.brand.color} className="lp-trend-dot" />
              {mark && <circle cx={mark[0]} cy={mark[1]} r={4.5} fill={item.brand.color} className="lp-trend-dot" />}
            </g>
          );
        })}
        {labels.map((item) => (
          <g key={item.slug} style={{ pointerEvents: 'none' }}>
            <rect x={stackLeft} y={item.ly} width={stackWidth} height={CHIP_H} rx={4} fill="#fff" stroke={item.color} strokeWidth={1.4} />
            <text
              x={stackLeft + stackWidth / 2}
              y={item.ly + 11.5}
              textAnchor="middle"
              className="lp-trend-label"
              fill={item.color}
            >
              {item.text}
            </text>
          </g>
        ))}
        {shown.map((week, i) => (
          <text
            key={week.week}
            x={xAt(i)}
            y={H - 6}
            className={i === active ? 'lp-trend-x on' : 'lp-trend-x'}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(i)}
          >
            {weekLabel(week.week)}
          </text>
        ))}
        {shown.map((week, i) => (
          <rect
            key={`${week.week}-hit`}
            className="lp-trend-hit"
            x={xAt(i) - hitW / 2}
            y={0}
            width={hitW}
            height={H - 16}
            onClick={() => toggle(i)}
          />
        ))}
      </svg>

      <ul className="lp-chart-values">
        {series.map((item) => {
          const weekly = active == null ? null : (shown[active].brands?.[item.brand.slug] ?? 0);
          return (
            <li key={item.brand.slug}>
              <span><i style={{ background: item.brand.color }} />{item.brand.name}</span>
              <b>{format.n(weekly == null ? item.total : (item.values[active ?? 0] ?? 0))}</b>
              {weekly != null && <small>{copy.views} {format.n(weekly)}</small>}
            </li>
          );
        })}
      </ul>

      <div className="lp-week-scroll">
        <table className="lp-week-table">
          <thead>
            <tr>
              <th>{copy.week}</th>
              <th>{copy.posts}</th>
              <th>{copy.views}</th>
              <th>{copy.followers}</th>
              <th>{copy.cumulative}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((week, i) => (
              <tr key={week.week} className={i === active ? 'on' : undefined} onClick={() => toggle(i)}>
                <td>{weekLabel(week.week)}</td>
                <td>{format.n(week.published)}</td>
                <td>{format.n(week.views)}</td>
                <td>{hasFollowers ? format.n(week.followersGained) : '—'}</td>
                <td>{format.n(cumulative[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lp-fan-note">
        {hasFollowers ? copy.followersTotal(format.n(totalFollowers)) : copy.followersPending}
      </p>
    </section>
  );
}
