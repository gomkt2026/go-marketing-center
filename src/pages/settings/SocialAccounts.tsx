import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { SocialAccount, SocialAccountStatus } from '@/types';

const PLATFORMS: { id: 'facebook' | 'instagram' | 'threads'; label: string; hint: string }[] = [
  { id: 'facebook', label: 'Facebook 粉絲專頁', hint: '需要粉專 Page ID 與 Page Access Token(Meta 開發者 App 審核通過後可自動發文)' },
  { id: 'instagram', label: 'Instagram 商業帳號', hint: '需要 IG 商業帳號 ID(與 FB 粉專綁定)與相同的 Page Token' },
  { id: 'threads', label: 'Threads', hint: '需要 Threads App 的 access token(threads_basic / threads_content_publish 權限;要用「自動回覆熱門貼文」需加上 threads_keyword_search 與 threads_manage_replies)' },
];

const statusTone: Record<SocialAccountStatus, BadgeTone> = {
  disconnected: 'default', manual: 'accent', connected: 'primary', error: 'danger',
};
const statusLabel: Record<SocialAccountStatus, string> = {
  disconnected: '未設定', manual: '手動發布模式', connected: 'API 已連線', error: '連線異常',
};

interface FormState {
  accountName: string;
  externalId: string;
  accessToken: string;
  autoPublish: boolean;
  autoReply: boolean;
  replyDailyCap: number;
}

export function SocialAccounts() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ accountName: '', externalId: '', accessToken: '', autoPublish: false, autoReply: false, replyDailyCap: 12 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.socialAccounts(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const accountByPlatform = new Map<string, SocialAccount>(data.accounts.map((a) => [a.platform, a]));

  function startEdit(platform: string) {
    const acc = accountByPlatform.get(platform);
    setForm({
      accountName: acc?.accountName ?? '',
      externalId: acc?.externalId ?? '',
      accessToken: '',
      autoPublish: acc?.autoPublish ?? false,
      autoReply: acc?.autoReply ?? false,
      replyDailyCap: acc?.replyDailyCap ?? 12,
    });
    setEditing(platform);
    setMessage(null);
  }

  async function save(platform: string) {
    if (!slug) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.saveSocialAccount(slug, {
        platform,
        accountName: form.accountName || undefined,
        externalId: form.externalId || undefined,
        accessToken: form.accessToken || undefined,
        autoPublish: form.autoPublish,
        autoReply: form.autoReply,
        replyDailyCap: form.replyDailyCap,
      });
      setEditing(null);
      setMessage('已儲存設定');
      reload();
    } catch (e) {
      setMessage(`儲存失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  async function test(platform: string) {
    if (!slug) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.testSocialAccount(slug, platform);
      setMessage(res.detail);
      reload();
    } catch (e) {
      setMessage(`測試失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  };

  return (
    <div>
      <PageHeader
        title={`${brand.name} 社群帳號串接`}
        subtitle="每個品牌獨立設定 FB / IG / Threads。尚未申請 Meta 開發者 App 時可先填帳號資訊,使用「手動發布」流程;token 填入並測試成功後即可升級為 API 自動發文"
      />

      {message && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {PLATFORMS.map((p) => {
          const acc = accountByPlatform.get(p.id);
          const status = acc?.status ?? 'disconnected';
          const isEditing = editing === p.id;
          return (
            <Card key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 15 }}>{p.label}</strong>
                    <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{p.hint}</p>
                  {acc && !isEditing && (
                    <div style={{ fontSize: 13, marginTop: 10, display: 'grid', gap: 4 }}>
                      {acc.accountName && <div>帳號名稱:{acc.accountName}</div>}
                      {acc.externalId && <div>平台 ID:{acc.externalId}</div>}
                      {acc.hasToken && <div>Token:{acc.tokenMasked}</div>}
                      {acc.autoPublish && <div>🚀 排程自動發布:已開啟</div>}
                      {acc.autoReply && <div>💬 自動回覆熱門貼文:已開啟(每日上限 {acc.replyDailyCap ?? 12} 則)</div>}
                      {acc.notes && <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{acc.notes}</div>}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {acc?.hasToken && (
                      <Button variant="secondary" disabled={busy} onClick={() => void test(p.id)}>測試連線</Button>
                    )}
                    <Button variant="ghost" onClick={() => startEdit(p.id)}>{acc ? '編輯' : '設定'}</Button>
                  </div>
                )}
              </div>

              {isEditing && (
                <div style={{ marginTop: 14, display: 'grid', gap: 10, maxWidth: 520 }}>
                  <label style={{ fontSize: 12.5 }}>
                    帳號名稱(粉專 / 帳號顯示名稱)
                    <input
                      style={inputStyle}
                      value={form.accountName}
                      onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                      placeholder={`例如:${brand.name} 官方`}
                    />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    平台 ID({p.id === 'facebook' ? 'Page ID' : p.id === 'instagram' ? 'IG 商業帳號 ID' : 'Threads User ID'},選填)
                    <input
                      style={inputStyle}
                      value={form.externalId}
                      onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
                    />
                  </label>
                  <label style={{ fontSize: 12.5 }}>
                    Access Token(選填;留空表示不變更)
                    <input
                      style={inputStyle}
                      type="password"
                      value={form.accessToken}
                      onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                      placeholder="貼上 token 後會加密儲存"
                    />
                  </label>
                  {p.id === 'threads' && (
                    <>
                      <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.autoPublish}
                          onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))}
                        />
                        排程自動發布(約每 2 小時一篇 Threads 熱門議題貼文直接發布,凌晨 2-6 點停發,不經人工審核;需已填入有效 token)
                      </label>
                      <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.autoReply}
                          onChange={(e) => setForm((f) => ({ ...f, autoReply: e.target.checked }))}
                        />
                        自動回覆熱門貼文(AI 生成的高相關回覆直接發布;關閉則進入「Threads 互動」頁待審核。token 需具備 threads_keyword_search 與 threads_manage_replies 權限)
                      </label>
                      <label style={{ fontSize: 12.5 }}>
                        每日回覆上限(建議 10-15,避免被平台判定為 spam)
                        <input
                          style={{ ...inputStyle, maxWidth: 120 }}
                          type="number"
                          min={1}
                          max={50}
                          value={form.replyDailyCap}
                          onChange={(e) => setForm((f) => ({ ...f, replyDailyCap: Math.max(1, Math.min(50, Number(e.target.value) || 12)) }))}
                        />
                      </label>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" disabled={busy} onClick={() => void save(p.id)}>{busy ? '儲存中...' : '儲存'}</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: 16, background: 'var(--color-bg-soft)' }}>
        <strong style={{ fontSize: 13 }}>手動發布流程(Meta App 審核通過前)</strong>
        <ol style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.9, paddingLeft: 18, marginTop: 6 }}>
          <li>在「內容中心」批准 AI 生成的貼文</li>
          <li>點「複製文案」並下載配圖,貼到 FB / IG / Threads 發布</li>
          <li>回到內容中心點「標記已發布」,系統會記錄發布時間與發布人</li>
        </ol>
      </Card>
    </div>
  );
}
