import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type {
  SocialAccount, SocialAccountStatus, SocialApiRequest, SocialSafetyPolicy, ThreadsConnectionMeta, ThreadsScopeInfo,
} from '@/types';

const SCOPE_BLUE = '#2F6FDE';

const statusTone: Record<SocialAccountStatus, BadgeTone> = {
  disconnected: 'default', manual: 'accent', connected: 'primary', error: 'danger',
};
const statusLabel: Record<SocialAccountStatus, string> = {
  disconnected: '未連線', manual: '待測試', connected: '有效', error: '連線異常',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
};
const thStyle: CSSProperties = {
  textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
  padding: '10px 12px', background: 'var(--color-bg-soft)', whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = { padding: '12px', fontSize: 13, verticalAlign: 'top', borderTop: '1px solid var(--color-border)' };

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function expiryText(expiresAt?: string | null): { text: string; danger: boolean } {
  if (!expiresAt) return { text: '效期確認中', danger: false };
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `已過期(${expiresAt.slice(0, 10)})`, danger: true };
  return { text: `剩 ${days} 天(${expiresAt.slice(0, 10)})`, danger: days <= 10 };
}

function Toggle({ checked, disabled, onChange, label }: {
  checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0,
        background: checked ? '#D64545' : '#D5D8D0', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background 0.15s',
      }}
    >
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: checked ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s',
      }} />
    </button>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ?? 'var(--color-text)' }}>{value}</div>
    </Card>
  );
}

function ScopeChips({ account, catalog }: { account: SocialAccount; catalog: ThreadsScopeInfo[] }) {
  if (!account.hasToken) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>;
  if (!account.grantedScopes) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>尚未偵測,按「測試」取得授權範圍</span>;
  }
  const granted = new Set(account.grantedScopes);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 520 }}>
      {catalog.map((s) => {
        const has = granted.has(s.scope);
        const tip = has
          ? `${s.label}:${s.feature}${s.caveat ? `(${s.caveat})` : ''}`
          : `未授權。缺少時不能用:${s.feature}${s.required ? '(必要權限)' : ''}`;
        return (
          <span
            key={s.scope}
            title={tip}
            style={{
              fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
              border: has ? `1px solid ${SCOPE_BLUE}` : '1px dashed #B5B8B0',
              color: has ? SCOPE_BLUE : '#9A9D95',
              background: has ? '#F2F6FE' : 'transparent',
              textDecoration: has ? 'none' : 'line-through',
            }}
          >
            {s.scope}
          </span>
        );
      })}
      {account.scopesSource === 'probe' && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>(以能力探測推定)</span>
      )}
    </div>
  );
}

function RequestLog({ slug, accountId }: { slug: string; accountId: string }) {
  const { data, loading, error } = useAsyncData(() => api.socialAccountRequests(slug, accountId), [slug, accountId]);
  if (loading) return <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>載入中...</p>;
  if (error || !data) return <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error ?? '載入失敗'}</p>;
  if (!data.requests.length) return <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>最近沒有 API 請求紀錄</p>;
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['時間', '動作', '端點', '結果', '耗時'].map((h) => <th key={h} style={{ ...thStyle, padding: '6px 10px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.requests.map((r: SocialApiRequest) => {
            const ok = !r.blockedReason && r.httpStatus != null && r.httpStatus < 400;
            const result = r.blockedReason
              ? `擋下:${r.blockedReason.replace(/^安全閘門:/, '')}`
              : r.httpStatus == null
                ? `連線失敗 ${r.errorMessage ?? ''}`
                : ok ? `${r.httpStatus}${r.counted ? '(計入預算)' : ''}` : `${r.httpStatus}${r.errorCode ? `/${r.errorCode}` : ''} ${r.errorMessage ?? ''}`;
            return (
              <tr key={r.id}>
                <td style={{ ...tdStyle, padding: '6px 10px', whiteSpace: 'nowrap' }}>{fmtTime(r.createdAt)}</td>
                <td style={{ ...tdStyle, padding: '6px 10px' }}>{r.action}</td>
                <td style={{ ...tdStyle, padding: '6px 10px', fontFamily: 'ui-monospace, monospace' }}>{r.method} {r.endpoint ?? '—'}</td>
                <td style={{ ...tdStyle, padding: '6px 10px', color: ok ? 'var(--color-text)' : r.blockedReason ? '#B8650F' : 'var(--color-danger)' }}>{result}</td>
                <td style={{ ...tdStyle, padding: '6px 10px', whiteSpace: 'nowrap' }}>{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SettingsForm {
  accessToken: string;
  autoPublish: boolean;
  autoReply: boolean;
  replyDailyCap: number;
  replyHourlyCap: number;
}

function AccountSettings({ slug, account, busy, onSave, onCancel }: {
  slug: string;
  account: SocialAccount;
  busy: boolean;
  onSave: (body: SettingsForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SettingsForm>({
    accessToken: '',
    autoPublish: account.autoPublish ?? false,
    autoReply: account.autoReply ?? false,
    replyDailyCap: account.replyDailyCap ?? 12,
    replyHourlyCap: account.replyHourlyCap ?? 5,
  });
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
      <label style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.autoPublish} onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))} />
        <span>到期安全網(每天六檔先到 Threads 工作台待批准;勾選後到期還沒人審仍會自動發出)</span>
      </label>
      <label style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.autoReply} onChange={(e) => setForm((f) => ({ ...f, autoReply: e.target.checked }))} />
        <span>自動回覆熱門貼文(需 threads_keyword_search 與 threads_manage_replies;關閉則全部進工作台待審)</span>
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5 }}>
          每小時回覆上限(1-20)
          <input
            style={{ ...inputStyle, width: 110, display: 'block' }} type="number" min={1} max={20} value={form.replyHourlyCap}
            onChange={(e) => setForm((f) => ({ ...f, replyHourlyCap: Math.max(1, Math.min(20, Number(e.target.value) || 5)) }))}
          />
        </label>
        <label style={{ fontSize: 12.5 }}>
          每日回覆上限(1-50)
          <input
            style={{ ...inputStyle, width: 110, display: 'block' }} type="number" min={1} max={50} value={form.replyDailyCap}
            onChange={(e) => setForm((f) => ({ ...f, replyDailyCap: Math.max(1, Math.min(50, Number(e.target.value) || 12)) }))}
          />
        </label>
      </div>
      <details>
        <summary style={{ fontSize: 12.5, cursor: 'pointer', color: 'var(--color-text-muted)' }}>備援:手動貼上新的長效 Token</summary>
        <input
          style={{ ...inputStyle, marginTop: 8 }} type="password" value={form.accessToken}
          onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
          placeholder="留空表示不變更;貼上後會加密儲存並自動測試"
        />
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
          一般請用上方「連線 Threads 帳號」重新授權。只有授權視窗不能用時才手動貼({slug} 的 Token 取得方式見頁面下方「手動 Token 教學」)。
        </p>
      </details>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={busy} onClick={() => onSave(form)}>{busy ? '儲存中...' : '儲存'}</Button>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

function SafetyPolicySection({ slug, accounts, initialPolicy, busy, setBusy, notify, reload }: {
  slug: string;
  accounts: SocialAccount[];
  initialPolicy: SocialSafetyPolicy;
  busy: boolean;
  setBusy: (v: boolean) => void;
  notify: (msg: string) => void;
  reload: () => void;
}) {
  const policyReq = useAsyncData(() => api.socialSafetyPolicy(), []);
  const canEdit = policyReq.data?.canEdit ?? false;
  const [policy, setPolicy] = useState<SocialSafetyPolicy>(initialPolicy);
  const [budgets, setBudgets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (policyReq.data) setPolicy(policyReq.data.policy);
  }, [policyReq.data]);

  async function saveOrg(next: Partial<SocialSafetyPolicy>) {
    setBusy(true);
    try {
      const res = await api.saveSocialSafetyPolicy({
        orgPaused: next.orgPaused ?? policy.orgPaused,
        dailyActionBudget: next.dailyActionBudget ?? policy.dailyActionBudget,
        duplicateWindowHours: next.duplicateWindowHours ?? policy.duplicateWindowHours,
        authorCooldownSeconds: next.authorCooldownSeconds ?? policy.authorCooldownSeconds,
      });
      setPolicy(res.policy);
      notify(res.policy.orgPaused ? '組織停止開關已開啟:所有品牌的 Threads 對外發文與回覆暫停' : '已儲存組織安全政策');
      reload();
    } catch (e) {
      notify(`儲存失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(acc: SocialAccount, patch: { paused?: boolean; dailyActionBudget?: number | null }) {
    setBusy(true);
    try {
      await api.saveSocialAccount(slug, { platform: 'threads', accountId: acc.id, ...patch });
      notify(patch.paused === true
        ? `@${acc.accountName ?? '帳號'} 已停止對外操作`
        : patch.paused === false ? `@${acc.accountName ?? '帳號'} 已恢復對外操作` : '已儲存帳號預算');
      reload();
    } catch (e) {
      notify(`儲存失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  const numberField = (label: string, value: number, step: number, key: 'dailyActionBudget' | 'duplicateWindowHours' | 'authorCooldownSeconds', hint: string) => (
    <label style={{ fontSize: 12.5, flex: 1, minWidth: 180 }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <Button variant="ghost" disabled={!canEdit} style={{ padding: '4px 10px' }}
          onClick={() => setPolicy((p) => ({ ...p, [key]: Math.max(0, p[key] - step) }))}>−</Button>
        <input
          style={{ ...inputStyle, width: 100, textAlign: 'center' }} type="number" min={0} value={value} disabled={!canEdit}
          onChange={(e) => setPolicy((p) => ({ ...p, [key]: Math.max(0, Number(e.target.value) || 0) }))}
        />
        <Button variant="ghost" disabled={!canEdit} style={{ padding: '4px 10px' }}
          onClick={() => setPolicy((p) => ({ ...p, [key]: p[key] + step }))}>＋</Button>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{hint}</span>
    </label>
  );

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 15 }}>社群對外操作安全政策</strong>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            整個行銷中心共用。停止開關、每日預算、重複內容與作者冷卻會在每次發文／回覆前檢查;被擋下的排程會標成「已取消」並寫明原因,不會重試。
            {!canEdit && ' 只有集團管理者可以修改組織層級設定。'}
          </p>
        </div>
        <Button variant="secondary" disabled={!canEdit || busy} onClick={() => void saveOrg({})}>儲存</Button>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12.5, minWidth: 150 }}>
          組織停止開關
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Toggle
              label="組織停止開關" checked={policy.orgPaused} disabled={!canEdit || busy}
              onChange={(v) => {
                if (v && !window.confirm('確定要暫停所有品牌的 Threads 對外發文與回覆?')) return;
                void saveOrg({ orgPaused: v });
              }}
            />
            <span style={{ fontWeight: 700, color: policy.orgPaused ? '#D64545' : 'var(--color-text-muted)' }}>
              {policy.orgPaused ? '已暫停' : '運作中'}
            </span>
          </div>
        </div>
        {numberField('每日操作預算(每帳號)', policy.dailyActionBudget, 1, 'dailyActionBudget', '發文 + 回覆,台北時間 00:00 重置')}
        {numberField('重複內容視窗(小時)', policy.duplicateWindowHours, 24, 'duplicateWindowHours', '視窗內同帳號不發相同文字,0 = 不檢查')}
        {numberField('作者冷卻(秒)', policy.authorCooldownSeconds, 3600, 'authorCooldownSeconds', `同一作者回覆間隔,目前約 ${Math.round(policy.authorCooldownSeconds / 3600)} 小時`)}
      </div>

      {accounts.length > 0 && (
        <div style={{ marginTop: 16, border: '1px solid var(--color-border)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>帳號</th>
                <th style={thStyle}>帳號停止開關</th>
                <th style={thStyle}>帳號每日預算(空白 = 沿用組織 {policy.dailyActionBudget})</th>
                <th style={thStyle}>今日已用</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const budgetValue = budgets[acc.id] ?? (acc.dailyActionBudget != null ? String(acc.dailyActionBudget) : '');
                return (
                  <tr key={acc.id}>
                    <td style={tdStyle}>@{acc.accountName ?? acc.externalId ?? '未命名'}</td>
                    <td style={tdStyle}>
                      <Toggle
                        label={`@${acc.accountName ?? ''} 停止開關`} checked={!!acc.paused} disabled={busy}
                        onChange={(v) => void saveAccount(acc, { paused: v })}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        style={{ ...inputStyle, width: 110 }} type="number" min={0} max={500} value={budgetValue}
                        placeholder={String(policy.dailyActionBudget)}
                        onChange={(e) => setBudgets((b) => ({ ...b, [acc.id]: e.target.value }))}
                      />
                    </td>
                    <td style={tdStyle}>{acc.usage ? `${acc.usage.actionsToday} / ${acc.usage.dailyBudget}` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Button
                        variant="ghost" disabled={busy}
                        onClick={() => void saveAccount(acc, { dailyActionBudget: budgetValue.trim() === '' ? null : Number(budgetValue) })}
                      >
                        儲存
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {policy.updatedAt && (
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8 }}>組織政策最後更新:{fmtTime(policy.updatedAt)}</p>
      )}
    </Card>
  );
}

export function ThreadsAccountsPanel({ slug, accounts, meta, notify, reload }: {
  slug: string;
  accounts: SocialAccount[];
  meta: ThreadsConnectionMeta | undefined;
  notify: (msg: string) => void;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [newToken, setNewToken] = useState('');
  const catalog = meta?.scopeCatalog ?? [];
  const policy = meta?.policy;

  const connected = accounts.filter((a) => a.hasToken && a.status === 'connected');
  const activeAccounts = connected.filter((a) => !a.paused);
  const outboundOn = !policy?.orgPaused && activeAccounts.length > 0;

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(true);
    try {
      const msg = await fn();
      notify(msg || `${label}完成`);
      reload();
    } catch (e) {
      notify(`${label}失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  function connect() {
    window.location.href = api.threadsOAuthStartUrl(slug);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SummaryCard
          label="Threads OAuth"
          value={meta?.oauthAvailable ? '可用' : '未設定'}
          tone={meta?.oauthAvailable ? undefined : 'var(--color-danger)'}
        />
        <SummaryCard label="已連線帳號" value={connected.length} />
        <SummaryCard
          label="對外操作"
          value={policy?.orgPaused ? '組織已暫停' : outboundOn ? '已啟動' : '未啟動'}
          tone={policy?.orgPaused ? '#D64545' : undefined}
        />
        <SummaryCard
          label="安全閘門"
          value={policy ? `預算 ${policy.dailyActionBudget}/日` : '—'}
        />
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: 15 }}>Threads 帳號連線</strong>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
              用 Threads 授權視窗連線,系統會自動換 60 天長效 Token、每天續期,並列出實際授權範圍。
              一個品牌可以連多個帳號;排程發文、熱門回覆與成效回收使用「主帳號」。
            </p>
            {!meta?.oauthAvailable && (
              <p style={{ fontSize: 12.5, color: 'var(--color-danger)', marginTop: 4 }}>
                尚未設定 THREADS_APP_ID / THREADS_APP_SECRET,授權視窗暫時不能用;可先用下方「手動新增帳號」。
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" disabled={busy} onClick={reload}>重新整理</Button>
            <Button variant="primary" disabled={busy || !meta?.oauthAvailable} onClick={connect}>連線 Threads 帳號</Button>
          </div>
        </div>

        <div style={{ marginTop: 14, border: '1px solid var(--color-border)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>帳號</th>
                <th style={thStyle}>狀態</th>
                <th style={thStyle}>授權範圍</th>
                <th style={thStyle}>Token 效期／最後刷新</th>
                <th style={thStyle}>近 24 小時</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {!accounts.length && (
                <tr><td style={{ ...tdStyle, color: 'var(--color-text-muted)' }} colSpan={6}>還沒有 Threads 帳號,按右上「連線 Threads 帳號」開始。</td></tr>
              )}
              {accounts.map((acc) => {
                const status = acc.status ?? 'disconnected';
                const exp = expiryText(acc.tokenExpiresAt);
                return [
                  <tr key={acc.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>@{acc.accountName ?? '未命名'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Threads · {acc.externalId ?? '—'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {acc.isPrimary && <Badge tone="primary">主帳號</Badge>}
                        <Badge tone="default">{acc.connectedVia === 'oauth' ? 'OAuth' : '手動 Token'}</Badge>
                        {acc.paused && <Badge tone="danger">已停止</Badge>}
                      </div>
                    </td>
                    <td style={tdStyle}><Badge tone={statusTone[status]}>{statusLabel[status]}</Badge></td>
                    <td style={tdStyle}><ScopeChips account={acc} catalog={catalog} /></td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {acc.hasToken ? (
                        <>
                          <div style={{ color: exp.danger ? 'var(--color-danger)' : undefined }}>{exp.text}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>刷新:{fmtTime(acc.lastRefreshedAt ?? acc.connectedAt)}</div>
                          {acc.scopesCheckedAt && (
                            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>授權檢查:{fmtTime(acc.scopesCheckedAt)}</div>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {acc.usage ? (
                        <>
                          <div>呼叫 {acc.usage.calls24h} 次</div>
                          <div style={{ color: acc.usage.failed24h ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>失敗 {acc.usage.failed24h}</div>
                          {acc.usage.blocked24h > 0 && <div style={{ color: '#B8650F' }}>擋下 {acc.usage.blocked24h}</div>}
                          <div style={{ color: 'var(--color-text-muted)' }}>今日動作 {acc.usage.actionsToday}/{acc.usage.dailyBudget}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', maxWidth: 260, marginLeft: 'auto' }}>
                        {acc.hasToken && (
                          <Button variant="secondary" disabled={busy} style={{ padding: '5px 10px' }}
                            onClick={() => void run('測試連線', async () => (await api.testSocialAccount(slug, 'threads', acc.id)).detail)}>
                            測試
                          </Button>
                        )}
                        <Button variant="ghost" style={{ padding: '5px 10px' }} onClick={() => setOpenSettings(openSettings === acc.id ? null : acc.id)}>設定</Button>
                        <Button variant="ghost" style={{ padding: '5px 10px' }} onClick={() => setOpenLog(openLog === acc.id ? null : acc.id)}>紀錄</Button>
                        {!acc.isPrimary && acc.hasToken && status !== 'error' && (
                          <Button variant="ghost" disabled={busy} style={{ padding: '5px 10px' }}
                            onClick={() => void run('設為主帳號', async () => { await api.setPrimarySocialAccount(slug, acc.id); return `@${acc.accountName ?? ''} 已設為主帳號`; })}>
                            設為主帳號
                          </Button>
                        )}
                        {acc.hasToken ? (
                          <Button variant="danger" disabled={busy} style={{ padding: '5px 10px' }}
                            onClick={() => {
                              if (!window.confirm(`確定撤銷 @${acc.accountName ?? ''} 的連線?Token 會被清除,自動發文與回覆會停用。`)) return;
                              void run('撤銷連線', async () => { await api.revokeSocialAccount(slug, acc.id); return `已撤銷 @${acc.accountName ?? ''} 的連線`; });
                            }}>
                            撤銷連線
                          </Button>
                        ) : !acc.isPrimary && (
                          <Button variant="danger" disabled={busy} style={{ padding: '5px 10px' }}
                            onClick={() => {
                              if (!window.confirm(`移除 @${acc.accountName ?? ''} 這一列?`)) return;
                              void run('移除帳號', async () => { await api.revokeSocialAccount(slug, acc.id, true); return '已移除'; });
                            }}>
                            移除
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  (openSettings === acc.id || openLog === acc.id || (acc.notes && status === 'error')) ? (
                    <tr key={`${acc.id}-detail`}>
                      <td style={{ ...tdStyle, borderTop: 'none', paddingTop: 0 }} colSpan={6}>
                        {acc.notes && (
                          <p style={{ fontSize: 12, marginBottom: 10, color: status === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{acc.notes}</p>
                        )}
                        {openSettings === acc.id && (
                          <AccountSettings
                            slug={slug} account={acc} busy={busy}
                            onCancel={() => setOpenSettings(null)}
                            onSave={(form) => void run('儲存設定', async () => {
                              const saved = await api.saveSocialAccount(slug, {
                                platform: 'threads', accountId: acc.id,
                                accessToken: form.accessToken || undefined,
                                autoPublish: form.autoPublish, autoReply: form.autoReply,
                                replyDailyCap: form.replyDailyCap, replyHourlyCap: form.replyHourlyCap,
                              });
                              setOpenSettings(null);
                              return form.accessToken && saved.account.notes ? saved.account.notes : '已儲存設定';
                            })}
                          />
                        )}
                        {openLog === acc.id && (
                          <div style={{ marginTop: openSettings === acc.id ? 14 : 0 }}>
                            <strong style={{ fontSize: 12.5 }}>最近 50 筆 API 請求</strong>
                            <div style={{ marginTop: 6 }}><RequestLog slug={slug} accountId={acc.id} /></div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12.5, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            備援:手動新增帳號(授權視窗不能用時,貼上 60 天長效 Token)
          </summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, maxWidth: 560 }}>
            <input
              style={inputStyle} type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)}
              placeholder="貼上 Threads 長效 Token,系統會自動讀取帳號並偵測授權範圍"
            />
            <Button
              variant="secondary" disabled={busy || !newToken.trim()}
              onClick={() => void run('新增帳號', async () => {
                const saved = await api.saveSocialAccount(slug, { platform: 'threads', createNew: true, accessToken: newToken.trim() });
                setNewToken('');
                return saved.account.notes ?? '已新增帳號';
              })}
            >
              新增
            </Button>
          </div>
        </details>
      </Card>

      {policy && (
        <SafetyPolicySection
          slug={slug} accounts={accounts} initialPolicy={policy}
          busy={busy} setBusy={setBusy} notify={notify} reload={reload}
        />
      )}
    </>
  );
}
