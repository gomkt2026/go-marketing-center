import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { SocialAccount } from '@/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
};

/** Go 生態系共用 X(Twitter) 帳號設定;只在該 collaboration 展開時掛載 */
function EcosystemXAccountPanel({ collaborationId }: { collaborationId: string }) {
  const { data, loading, reload } = useAsyncData(() => api.collaborationSocialAccounts(collaborationId), [collaborationId]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountName: '', externalId: '', accessToken: '', refreshToken: '', autoPublish: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading || !data) return null;
  const acc: SocialAccount | undefined = data.accounts.find((a) => a.platform === 'x');

  function startEdit() {
    setForm({
      accountName: acc?.accountName ?? '', externalId: acc?.externalId ?? '',
      accessToken: '', refreshToken: '', autoPublish: acc?.autoPublish ?? false,
    });
    setEditing(true);
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.saveCollaborationSocialAccount(collaborationId, {
        platform: 'x',
        accountName: form.accountName || undefined,
        externalId: form.externalId || undefined,
        accessToken: form.accessToken || undefined,
        refreshToken: form.refreshToken || undefined,
        autoPublish: form.autoPublish,
      });
      setEditing(false);
      setMessage('已儲存設定');
      reload();
    } catch (e) {
      setMessage(`儲存失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.testCollaborationSocialAccount(collaborationId, 'x');
      setMessage(res.detail);
      reload();
    } catch (e) {
      setMessage(`測試失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>Go 生態系共用 X(Twitter) 帳號</strong>
            <Badge tone={acc?.status === 'connected' ? 'primary' : acc?.status === 'error' ? 'danger' : 'default'}>
              {acc?.status === 'connected' ? 'API 已連線' : acc?.status === 'manual' ? '手動發布模式' : acc?.status === 'error' ? '連線異常' : '未設定'}
            </Badge>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            三品牌共用、以英文人格對國際 PropTech/SaaS 圈發文的帳號,不屬於任一單一品牌。
            需先完成 X Developer App 的 OAuth2 授權流程,取得 access token 與 refresh token(效期僅 2 小時,系統會自動續期)。
          </p>
          {acc && !editing && (
            <div style={{ fontSize: 13, marginTop: 10, display: 'grid', gap: 4 }}>
              {acc.accountName && <div>帳號名稱:{acc.accountName}</div>}
              {acc.externalId && <div>X handle:@{acc.externalId}</div>}
              {acc.hasToken && <div>Access Token:{acc.tokenMasked}{acc.hasRefreshToken ? '(已存 refresh token)' : '(缺 refresh token,無法自動續期)'}</div>}
              {acc.autoPublish && <div>🚀 排程自動發布:已開啟</div>}
              {acc.notes && <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{acc.notes}</div>}
            </div>
          )}
        </div>
        {!editing && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link to={`/collaborations/${collaborationId}/schedule`} onClick={(e) => e.stopPropagation()}>
              <Button variant="secondary">查看行程表</Button>
            </Link>
            {acc?.hasToken && <Button variant="secondary" disabled={busy} onClick={() => void test()}>測試連線</Button>}
            <Button variant="ghost" onClick={startEdit}>{acc ? '編輯' : '設定'}</Button>
          </div>
        )}
      </div>

      {message && <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-primary)' }}>{message}</p>}

      {editing && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10, maxWidth: 520 }}>
          <label style={{ fontSize: 12.5 }}>
            帳號名稱
            <input style={inputStyle} value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} placeholder="例如:Go Ecosystem" />
          </label>
          <label style={{ fontSize: 12.5 }}>
            X handle(不含 @,選填,用於組貼文永久連結)
            <input style={inputStyle} value={form.externalId} onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Access Token(OAuth2 User Context;選填,留空表示不變更)
            <input style={inputStyle} type="password" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Refresh Token(選填,留空表示不變更;缺此值系統無法自動續期,2 小時後會失效)
            <input style={inputStyle} type="password" value={form.refreshToken} onChange={(e) => setForm((f) => ({ ...f, refreshToken: e.target.value }))} />
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.autoPublish} onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))} />
            排程自動發布(每週 2-3 則英文貼文/Thread 直接透過 API 發布,不經人工審核;需已填入有效 token)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? '儲存中...' : '儲存'}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>取消</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CollaborationList() {
  const { brandById } = useBrand();
  const { data, loading, error, reload } = useAsyncData(() => api.collaborations(), []);
  const proposalsQuery = useAsyncData(() => api.proposals(), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const list = data?.collaborations;
    if (list?.length && expanded === null) {
      setExpanded(list[0].id);
    }
  }, [data?.collaborations, expanded]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const collaborations = data.collaborations;
  const proposals = proposalsQuery.data?.proposals ?? [];

  return (
    <div>
      <PageHeader
        title="品牌合作 Collaboration"
        subtitle="品牌之間可以合作,但不能直接共用彼此資料;AI 只能讀取 Collaboration Brief"
        actions={<Button variant="primary">+ 建立合作案</Button>}
      />

      <div style={{ display: 'grid', gap: 16 }}>
        {collaborations.map((c) => {
          const brief = c.latestBrief;
          const relatedProposals = proposals.filter((p) => p.collaborationId === c.id);
          const isOpen = expanded === c.id;
          return (
            <Card key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : c.id)}>
                <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {c.brandIds.map((bid) => {
                      const b = brandById(bid);
                      if (!b) return null;
                      return <Badge key={bid} tone="secondary">{b.name}</Badge>;
                    })}
                    <Badge tone={c.status === 'active' ? 'primary' : 'default'}>{c.status === 'active' ? '進行中' : '已結案'}</Badge>
                  </div>
                  <strong style={{ fontSize: 16 }}>{c.title}</strong>
                  <p style={{ fontSize: 13, marginTop: 4 }}>{c.description}</p>
                </div>
                <span style={{ color: 'var(--color-text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                  {brief && (
                    <>
                      <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                        {brief.title}(v{brief.versionNumber})— AI 唯一可讀的合作事實來源
                      </strong>
                      <pre style={{
                        background: 'var(--color-bg-soft)', borderRadius: 10, padding: 14, fontSize: 12.5,
                        whiteSpace: 'pre-wrap', lineHeight: 1.7,
                      }}
                      >
                        {brief.contentMarkdown}
                      </pre>
                    </>
                  )}
                  {relatedProposals.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ fontSize: 13 }}>相關提案</strong>
                      {relatedProposals.map((p) => (
                        <div key={p.id} style={{ fontSize: 13, padding: '6px 0' }}>▪ {p.title}</div>
                      ))}
                    </div>
                  )}
                  {c.title === 'Go 生態系(Homigo × TaskGo × Washgo)' && <EcosystemXAccountPanel collaborationId={c.id} />}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
