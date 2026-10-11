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

  return (
    <section className="lp-trend" aria-label={copy.aria}>
      <div className="lp-trend-head">
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.sub}</p>
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
        {series.map((item) => {
          const pts = item.values.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
          const end = pts[pts.length - 1];
          return (
            <g key={item.brand.slug}>
              <path d={linePath(pts)} className="lp-trend-line" pathLength={1} style={{ stroke: item.brand.color }} />
              <circle cx={end[0]} cy={end[1]} r={3.5} fill={item.brand.color} className="lp-trend-dot" />
            </g>
          );
        })}
        {shown.map((week, i) => (
          <text key={week.week} x={xAt(i)} y={H - 6} className="lp-trend-x">{weekLabel(week.week)}</text>
        ))}
      </svg>

      <ul className="lp-chart-values">
        {series.map((item) => (
          <li key={item.brand.slug}>
            <span><i style={{ background: item.brand.color }} />{item.brand.name}</span>
            <b>{format.n(item.total)}</b>
          </li>
        ))}
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
              <tr key={week.week}>
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
