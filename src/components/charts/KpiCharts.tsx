import type { ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const CHART = {
  primary: '#8CAA71',
  accent: '#ED9121',
  danger: '#D97B7B',
  secondary: '#A87C64',
  muted: '#C5CBBE',
};

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 12,
};

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <strong style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>{title}</strong>
      <div style={{ width: '100%', height: 220 }}>{children}</div>
    </div>
  );
}

export function StackedPostsChart({ data }: { data: Array<{ label: string; published: number; failed: number }> }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="published" name="成功" stackId="a" fill={CHART.primary} radius={[0, 0, 0, 0]} />
        <Bar dataKey="failed" name="失敗" stackId="a" fill={CHART.danger} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlatformBarChart({ data }: { data: Array<{ platform: string; impressions: number; likes: number; comments: number }> }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="platform" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="impressions" name="曝光" fill={CHART.primary} />
        <Bar dataKey="likes" name="按讚" fill={CHART.accent} />
        <Bar dataKey="comments" name="留言" fill={CHART.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  value, total, label, color = CHART.primary,
}: { value: number; total: number; label: string; color?: string }) {
  const rest = Math.max(0, total - value);
  const data = [
    { name: label, value },
    { name: '其餘', value: rest || (total === 0 ? 1 : 0) },
  ];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={58} outerRadius={80} paddingAngle={2} stroke="none">
            <Cell fill={color} />
            <Cell fill={CHART.muted} />
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{pct}%</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function PipelineBarChart({ data }: { data: Array<{ name: string; published: number; scheduled: number; pending: number; failed: number }> }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="published" name="已發" stackId="a" fill={CHART.primary} />
        <Bar dataKey="scheduled" name="已排" stackId="a" fill={CHART.accent} />
        <Bar dataKey="pending" name="待審" stackId="a" fill={CHART.secondary} />
        <Bar dataKey="failed" name="失敗" stackId="a" fill={CHART.danger} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data }: { data: Array<{ label: string; impressions: number; likes: number; comments: number }> }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="impressions" name="曝光" stroke={CHART.primary} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="likes" name="按讚" stroke={CHART.accent} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="comments" name="留言" stroke={CHART.secondary} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
