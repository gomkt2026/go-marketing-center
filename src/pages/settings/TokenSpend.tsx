import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { UsageTotals } from '@/types';

function tokens(value: number) {
  return Math.round(value).toLocaleString('zh-TW');
}

function usd(value: number) {
  return `US$${value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function twd(value: number, rate: number) {
  return `NT$${(value * rate).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Cells({ usage, rate }: { usage: UsageTotals; rate: number }) {
  return (
    <>
      <td style={cell}>{tokens(usage.tokens)}</td>
      <td style={cell}>{usd(usage.costUsd)}</td>
      <td style={cell}>{twd(usage.costUsd, rate)}</td>
      <td style={cell}>{tokens(usage.monthTokens)}</td>
      <td style={cell}>{usd(usage.monthCostUsd)}</td>
      <td style={cell}>{twd(usage.monthCostUsd, rate)}</td>
    </>
  );
}

const cell: CSSProperties = { padding: '10px 8px', whiteSpace: 'nowrap' };

export function TokenSpend() {
  const query = useAsyncData(() => api.adminUsage(), []);
  if (query.loading && !query.data) return <LoadingState label="載入 Token 花費…" />;
  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />;
  if (!query.data) return null;

  const { rate, brands, cross, total, pendingMigration } = query.data;
  return (
    <div>
      <PageHeader
        title="Token 成本"
        subtitle={`全部品牌合計。台幣依參考匯率 1 美元 = ${rate} 元換算，圖片依每張估計單價計入金額、不計入 Token。`}
      />
      {pendingMigration && (
        <Card style={{ marginBottom: 16 }}>
          花費表還沒建立。請先執行 db/migrations/077_llm_usage.sql。
        </Card>
      )}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>全部合計</div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <Metric label="累計 Token" value={tokens(total.tokens)} />
          <Metric label="累計美元" value={usd(total.costUsd)} />
          <Metric label="累計台幣" value={twd(total.costUsd, rate)} />
          <Metric label="本月 Token" value={tokens(total.monthTokens)} />
          <Metric label="本月美元" value={usd(total.monthCostUsd)} />
          <Metric label="本月台幣" value={twd(total.monthCostUsd, rate)} />
        </div>
      </Card>
      <Card style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={cell}>品牌</th>
              <th style={cell}>累計 Token</th>
              <th style={cell}>累計美元</th>
              <th style={cell}>累計台幣</th>
              <th style={cell}>本月 Token</th>
              <th style={cell}>本月美元</th>
              <th style={cell}>本月台幣</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={cell}>
                  <Link to={`/${brand.slug}/workspace`}>{brand.name}</Link>
                </td>
                <Cells usage={brand} rate={rate} />
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={cell}>跨品牌</td>
              <Cells usage={cross} rate={rate} />
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
