import { useState, type CSSProperties } from 'react';
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
  { id: 'facebook', label: 'Facebook 粉絲專頁', hint: '必須存粉絲專頁權杖(Page Access Token),不要存個人 User Token。新版粉專體驗用 User Token 回收成效會出現 OAuth 190 / 2069032。自動發文需粉專發文權限;成效回收另需 pages_read_engagement' },
  { id: 'instagram', label: 'Instagram 商業帳號', hint: '需要 IG 商業帳號 ID(與 FB 粉專綁定)與相同的 Page Token。成效回收另需 instagram_manage_insights' },
  { id: 'threads', label: 'Threads', hint: '需要 Threads App 的 access token(threads_basic / threads_content_publish;自動回覆需 threads_keyword_search 與 threads_manage_replies;成效回收需 threads_manage_insights)' },
];

const statusTone: Record<SocialAccountStatus, BadgeTone> = {
  disconnected: 'default', manual: 'accent', connected: 'primary', error: 'danger',
};
const statusLabel: Record<SocialAccountStatus, string> = {
  disconnected: '未設定', manual: '手動發布模式', connected: 'API 已連線', error: '連線異常',
};

function tokenExpiryLabel(expiresAt?: string | null): string {
  if (!expiresAt) return '⏳ Token 效期確認中(24 小時內系統會自動確認並續期)';
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return `⚠️ Token 已過期(${expiresAt.slice(0, 10)}),請重新產生長效 token`;
  if (days <= 10) return `⚠️ Token 將於 ${days} 天內到期(${expiresAt.slice(0, 10)}),系統會自動續期`;
  return `✅ Token 效期至 ${expiresAt.slice(0, 10)}(自動續期中,剩 ${days} 天)`;
}
function tokenExpiryTone(expiresAt?: string | null): string {
  if (!expiresAt) return 'var(--color-text-muted)';
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  return days <= 10 ? 'var(--color-danger, #d33)' : 'var(--color-text-muted)';
}

interface FormState {
  accountName: string;
  externalId: string;
  accessToken: string;
  autoPublish: boolean;
  autoReply: boolean;
  replyDailyCap: number;
  replyHourlyCap: number;
}

function TokenHowTo({ brandName }: { brandName: string }) {
  const [open, setOpen] = useState<'fb' | 'threads' | null>('fb');
  const linkStyle: CSSProperties = { color: 'var(--color-primary)', wordBreak: 'break-all' };
  const listStyle: CSSProperties = { fontSize: 13, lineHeight: 1.85, paddingLeft: 18, margin: '8px 0 0' };

  return (
    <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-primary)' }}>
      <strong style={{ fontSize: 14 }}>今天要恢復主動發文：Token 從這裡拿</strong>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6 }}>
        Meta「主控板」沒有產生按鈕。請看該頁<strong>最上方</strong>選單的「工具」，不要找左側欄。
        {brandName} 的 Facebook / Instagram 用同一把粉專權杖；Threads 是另一把。
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button variant={open === 'fb' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'fb' ? null : 'fb')}>
          FB / IG 粉專權杖
        </Button>
        <Button variant={open === 'threads' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'threads' ? null : 'threads')}>
          Threads 權杖
        </Button>
        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
          <Button variant="ghost">開啟 Graph API 探索工具</Button>
        </a>
      </div>

      {open === 'fb' && (
        <ol style={listStyle}>
          <li>
            直接開{' '}
            <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={linkStyle}>
              developers.facebook.com/tools/explorer
            </a>
            ，右上角應用程式選 <code>Taskgo_marketing_post</code>。
          </li>
          <li>
            「用戶或粉絲專頁」選<strong>取得粉絲專頁存取權杖</strong>，勾 TaskGo 粉專。權限至少：
            <code> pages_show_list</code>、<code>pages_manage_posts</code>、<code>instagram_basic</code>、
            <code>instagram_content_publish</code>。要回收成效再加 <code>pages_read_engagement</code>、
            <code>instagram_manage_insights</code>。
          </li>
          <li>按「產生存取權杖」，授權後複製那一長串。這才是 Page Token。</li>
          <li>
            要變長效：開{' '}
            <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer" style={linkStyle}>
              存取權杖偵錯工具
            </a>
            ，貼上剛複製的權杖 → 偵錯 → 底部「延伸存取權杖」。再複製延伸後的那一把。
          </li>
          <li>
            回到本頁，Facebook 與 Instagram 都按「編輯」，貼<strong>同一把 Page Token</strong>，儲存後按「測試連線」。兩邊都要變成「API 已連線」，並勾「排程自動發布」。
          </li>
          <li>
            TaskGo 必須勾 <strong>TaskGo 粉專</strong>，不要沿用 Washgo／Homigo 的權杖。行程表若出現 <code>Error validating access token</code>，就是這把粉專權杖過期或被撤銷，Threads 能發不代表 FB／IG 還能發。
          </li>
        </ol>
      )}

      {open === 'threads' && (
        <ol style={listStyle}>
          <li>Threads 不能用上面的 Graph API 探索工具。回到 Meta App，左側「使用案例」→ 新增或打開 <strong>Threads API</strong>。</li>
          <li>
            基本資料裡會有 <strong>Threads 應用程式密鑰</strong>（跟 Facebook App Secret 不同）。
            短效 token 換成 60 天長效才貼到本頁，系統之後會自動續期。
          </li>
          <li>
            最快測試路徑：使用案例裡的授權／測試流程，或開{' '}
            <a href="https://developers.facebook.com/docs/threads/get-started/" target="_blank" rel="noreferrer" style={linkStyle}>
              Threads 開始使用
            </a>
            的授權視窗，權限至少 <code>threads_basic</code>、<code>threads_content_publish</code>。
          </li>
          <li>
            若行程表出現 <code>API access blocked</code>：先開{' '}
            <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={linkStyle}>
              developers.facebook.com
            </a>
            ，完成「開發者帳號驗證」（畫面會寫 Access to Meta for Developers has been restored）。
            開發模式下，Washgo 的 Threads 帳號必須加進 App 的測試人員並在手機 Threads 同意邀請。
          </li>
          <li>
            重新走授權視窗，權限一定要勾 <code>threads_basic</code>、<code>threads_content_publish</code>，換成 60 天長效 token。
          </li>
          <li>回到本頁貼上新 token，按「測試連線」。測試現在會真的試建一篇（不發布）；通過後再勾「排程自動發布」。</li>
        </ol>
      )}
    </Card>
  );
}

export function SocialAccounts() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ accountName: '', externalId: '', accessToken: '', autoPublish: false, autoReply: false, replyDailyCap: 12, replyHourlyCap: 5 });
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
      replyHourlyCap: acc?.replyHourlyCap ?? 5,
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
        replyHourlyCap: form.replyHourlyCap,
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
        subtitle="Token 在 Meta 產生、在這一頁貼上。主控板與行程表都不會產生權杖。"
      />

      <TokenHowTo brandName={brand.name} />

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
                      {acc.hasToken && p.id === 'threads' && (
                        <div style={{ color: tokenExpiryTone(acc.tokenExpiresAt) }}>
                          {tokenExpiryLabel(acc.tokenExpiresAt)}
                        </div>
                      )}
                      {acc.autoPublish && <div>🚀 排程自動發布:已開啟</div>}
                      {acc.autoReply && (
                        <div>💬 自動回覆熱門貼文:已開啟(每小時 {acc.replyHourlyCap ?? 5} 則 / 每日 {acc.replyDailyCap ?? 12} 則)</div>
                      )}
                      {acc.notes && (
                        <div style={{ color: status === 'error' ? 'var(--color-danger, #b42318)' : 'var(--color-text-muted)', fontSize: 12 }}>
                          {acc.notes}
                        </div>
                      )}
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
                  {(p.id === 'facebook' || p.id === 'instagram') && (
                    <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.autoPublish}
                        onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))}
                      />
                      排程自動發布(每日早晚主題圖文生成後直接透過 API 發布,不經人工審核;需已填入平台 ID 與有效 token{p.id === 'instagram' ? ';IG 必須有配圖,無圖時會留待人工審核' : ''})
                    </label>
                  )}
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
                        自動回覆熱門貼文(每 30 分鐘掃熱門相關貼文,在小時/日上限內自動發布;關閉則全部進「Threads 互動」待審核。token 需具備 threads_keyword_search 與 threads_manage_replies)
                      </label>
                      <label style={{ fontSize: 12.5 }}>
                        每小時回覆上限(建議 3-5,硬頂 20)
                        <input
                          style={{ ...inputStyle, maxWidth: 120 }}
                          type="number"
                          min={1}
                          max={20}
                          value={form.replyHourlyCap}
                          onChange={(e) => setForm((f) => ({ ...f, replyHourlyCap: Math.max(1, Math.min(20, Number(e.target.value) || 5)) }))}
                        />
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
