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
const H = 132;
const PAD = { l: 34, r: 22, t: 12, b: 22 };

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
    .map((item) => ({
      slug: item.brand.slug,
      color: item.brand.color,
      x: xAt(active),
      y: yAt(item.values[active] ?? 0),
      text: format.compact(shown[active].brands?.[item.brand.slug] ?? 0),
    }))
    .sort((a, b) => a.y - b.y)
    .map((item, i, all) => {
      const prev = all[i - 1];
      const y = prev && item.y - prev.y < 11 ? prev.y + 11 : item.y;
      const next = { ...item, y: Math.min(H - PAD.b - 2, Math.max(PAD.t + 8, y)) };
      all[i] = next;
      return next;
    });
  const labelAnchor = active != null && active >= shown.length - 2 ? 'end' : 'start';
  const labelDx = labelAnchor === 'end' ? -8 : 8;

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
        {labels.map((item) => {
          const width = Math.max(28, item.text.length * 9);
          const left = labelAnchor === 'end' ? item.x + labelDx - width : item.x + labelDx;
          return (
            <g key={item.slug} style={{ pointerEvents: 'none' }}>
              <rect x={left - 3} y={item.y - 8} width={width + 6} height={13} rx={3} fill="#fff" />
              <text
                x={item.x + labelDx}
                y={item.y + 2}
                textAnchor={labelAnchor}
                className="lp-trend-label"
                fill={item.color}
              >
                {item.text}
              </text>
            </g>
          );
        })}
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
              <b>{format.n(weekly == null ? item.total : weekly)}</b>
              {weekly != null && <small>{copy.cumulative} {format.n(item.values[active ?? 0] ?? 0)}</small>}
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
