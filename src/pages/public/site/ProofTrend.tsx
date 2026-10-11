import { useCopy, useFormat } from '@/pages/public/locale';

export interface TrendWeek {
  week: string;
  published: number;
  views: number;
  interactions: number;
  followersGained: number;
}

export interface TrendKeyword {
  word: string;
  views: number;
  posts: number;
}

const W = 360;
const H = 132;
const PAD = { l: 36, r: 8, t: 12, b: 22 };

function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function linePath(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
}

export function ProofTrend({ weeks, keywords }: { weeks: TrendWeek[]; keywords: TrendKeyword[] }) {
  const copy = useCopy().trend;
  const format = useFormat();
  if (weeks.length < 2) return null;

  const shown = weeks.slice(-8);
  const cumulative: number[] = [];
  shown.forEach((week, i) => {
    cumulative.push((cumulative[i - 1] ?? 0) + week.views);
  });
  const max = Math.max(1, cumulative[cumulative.length - 1] ?? 0);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const xAt = (i: number) => PAD.l + (shown.length === 1 ? innerW / 2 : (i / (shown.length - 1)) * innerW);
  const yAt = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const pts = cumulative.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
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
        <path d={`${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)},${yAt(0)} L${pts[0][0].toFixed(1)},${yAt(0)} Z`} className="lp-trend-area" />
        <path d={linePath(pts)} className="lp-trend-line" pathLength={1} />
        {pts.map((p, i) => (
          <circle key={shown[i].week} cx={p[0]} cy={p[1]} r={3} className="lp-trend-dot" />
        ))}
        {shown.map((week, i) => (
          <text key={week.week} x={xAt(i)} y={H - 6} className="lp-trend-x">{weekLabel(week.week)}</text>
        ))}
      </svg>

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

      {keywords.length > 0 && (
        <div className="lp-keys-block">
          <p>{copy.keywordsTitle}</p>
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
    </section>
  );
}
