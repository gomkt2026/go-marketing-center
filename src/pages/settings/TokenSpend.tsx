import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { UsageParts, UsageTotals } from '@/types';

function tokens(value: number) {
  return Math.round(value).toLocaleString('zh-TW');
}

function usd(value: number) {
  return `US$${value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function twd(value: number, rate: number) {
  return `NT$${(value * rate).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function MonthCell({ usage }: { usage: UsageTotals }) {
  return (
    <td style={cell}>
      <div>{tokens(usage.monthTokens)}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{usd(usage.monthCostUsd)}</div>
    </td>
  );
}

const cell: CSSProperties = { padding: '10px 8px', whiteSpace: 'nowrap', verticalAlign: 'top' };

const emptyParts: UsageParts = {
  post: { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 },
  copy: { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 },
  podcast: { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 },
  other: { tokens: 0, costUsd: 0, monthTokens: 0, monthCostUsd: 0 },
};

export function TokenSpend() {
  const query = useAsyncData(() => api.adminUsage(), []);
  if (query.loading && !query.data) return <LoadingState label="載入 Token 花費…" />;
  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />;
  if (!query.data) return null;

  const { rate, capUsd, brands, cross, total, pendingMigration } = query.data;
  const crossParts = cross.parts ?? emptyParts;
  return (
    <div>
      <PageHeader
        title="Token 成本"
        subtitle={`全部品牌合計。台幣依參考匯率 1 美元 = ${rate} 元換算。圖片依每張估計單價計入金額，不計入 Token。每個品牌本月上限 ${usd(capUsd)}，達到就在該品牌的行銷儀表板顯示警訊。`}
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

      <Card style={{ marginBottom: 16 }}>
        <strong style={{ display: 'block', marginBottom: 8 }}>這四欄分別是什麼</strong>
        <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.7 }}>
          <div><strong>發文</strong>：要發出去的社群貼文、配圖和 Threads 回覆。包含排程貼文、離題貼文、導流貼文、看圖寫文、活動宣傳，以及產圖、改寫圖片提示。</div>
          <div><strong>產文</strong>：寫成文章或品牌資料，不是這一則社群貼。包含官網 SEO 長文、新品牌的 SEO 題庫、品牌智慧整理、小編對話改稿。</div>
          <div><strong>Podcast</strong>：寫 Podcast 腳本。三小編熱聊和訪談特輯沒有單一品牌，記在跨品牌；和居對談記在和居家居。</div>
          <div><strong>其他</strong>：上面三類以外，例如行銷中心晨會、回覆草稿、市場情報、會議室。金額仍算進該列合計。</div>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.7 }}>
          開始把 Podcast 分開記帳之前產生的腳本，還留在跨品牌的「其他」。新的一集會進 Podcast。本月以台灣時間當月 1 日 0 點起算。
        </p>
      </Card>

      <Card style={{ marginBottom: 16, borderLeft: '4px solid var(--color-primary)' }}>
        <strong style={{ display: 'block', marginBottom: 8 }}>跨品牌是什麼</strong>
        <p style={{ fontSize: 13, lineHeight: 1.75, marginBottom: 10 }}>
          跨品牌是「這一筆 AI 花費沒有記在任何一個品牌名下」。表格最後一列就是這些帳的合計，不是把上面各品牌再加總一次。有品牌的花費只出現在該品牌那一列。
        </p>
        <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.7 }}>
          <div>
            <strong>三小編熱聊、訪談特輯。</strong>
            阿豪、小咪、阿樂同一集一起寫稿，腳本不屬於 Homigo、TaskGo 或 Washgo 單獨一家，整集 Podcast Token 記在跨品牌。和居對談是和居家居自己的節目，記在和居家居。
          </div>
          <div>
            <strong>Go 生態系導流貼文。</strong>
            一則貼文同時帶到多個品牌，例如 Homigo 的讀者看到 TaskGo 或 Washgo。這則沒有單一品牌，發文 Token 記在跨品牌。
          </div>
          <div>
            <strong>行銷中心晨會。</strong>
            每天幫幾個品牌一起排題目、口吻和畫面。這筆不在單一品牌的發文帳裡，記在跨品牌的「其他」。
          </div>
          <div>
            <strong>呼叫當下沒有指定品牌。</strong>
            會議室、人脈辨識、簡報抽取，以及開始分類之前的舊帳，如果當下沒有帶品牌，也會落在跨品牌。有指定品牌的市場情報、回覆和 SEO，記在那個品牌，不進這一列。
          </div>
        </div>
      </Card>

      <Card style={{ overflowX: 'auto' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          儲存格上方是本月 Token，下方是本月美元。最右兩欄是本月與累計合計。
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={cell}>品牌</th>
              <th style={cell}>本月發文</th>
              <th style={cell}>本月產文</th>
              <th style={cell}>本月 Podcast</th>
              <th style={cell}>本月其他</th>
              <th style={cell}>本月合計</th>
              <th style={cell}>累計合計</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={cell}>
                  <Link to={`/${brand.slug}/workspace`}>{brand.name}</Link>
                  {brand.overCap && (
                    <div style={{ marginTop: 6 }}>
                      <Badge tone="danger">{brand.monthCostUsd > capUsd ? `本月已超過 ${usd(capUsd)}` : `本月已達 ${usd(capUsd)}`}</Badge>
                    </div>
                  )}
                </td>
                <MonthCell usage={brand.parts?.post ?? emptyParts.post} />
                <MonthCell usage={brand.parts?.copy ?? emptyParts.copy} />
                <MonthCell usage={brand.parts?.podcast ?? emptyParts.podcast} />
                <MonthCell usage={brand.parts?.other ?? emptyParts.other} />
                <td style={cell}>
                  <div style={{ fontWeight: 700 }}>{usd(brand.monthCostUsd)}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{twd(brand.monthCostUsd, rate)}</div>
                </td>
                <td style={cell}>
                  <div>{usd(brand.costUsd)}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{tokens(brand.tokens)} Token</div>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
              <td style={cell}>
                <div style={{ fontWeight: 700 }}>跨品牌</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, whiteSpace: 'normal', maxWidth: 220 }}>
                  沒有掛在單一品牌的花費，說明見上方。
                </div>
              </td>
              <MonthCell usage={crossParts.post} />
              <MonthCell usage={crossParts.copy} />
              <MonthCell usage={crossParts.podcast} />
              <MonthCell usage={crossParts.other} />
              <td style={cell}>
                <div style={{ fontWeight: 700 }}>{usd(cross.monthCostUsd)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{twd(cross.monthCostUsd, rate)}</div>
              </td>
              <td style={cell}>
                <div>{usd(cross.costUsd)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{tokens(cross.tokens)} Token</div>
              </td>
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
