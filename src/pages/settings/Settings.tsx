import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { useMeta } from '@/context/MetaContext';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/constants';
import { api, ApiError } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { User, UserRole } from '@/types';

const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '集團管理者',
  brand_manager: '品牌負責人',
  brand_editor: '品牌編輯',
  viewer: '唯讀',
};

const permissionMatrix: { action: string; ai: boolean; editor: boolean; manager: boolean; admin: boolean }[] = [
  { action: '建立提案 Proposal', ai: true, editor: false, manager: false, admin: false },
  { action: '批准/否決 Decision', ai: false, editor: false, manager: true, admin: true },
  { action: '生成內容草稿', ai: true, editor: false, manager: false, admin: false },
  { action: '提交內容審閱', ai: false, editor: true, manager: true, admin: true },
  { action: '批准/退回內容 Final Review', ai: false, editor: false, manager: true, admin: true },
  { action: '執行發布', ai: false, editor: false, manager: true, admin: true },
  { action: '編輯品牌知識草稿', ai: false, editor: true, manager: true, admin: true },
  { action: '發布品牌新版本', ai: false, editor: false, manager: true, admin: true },
  { action: '管理 AI Agents / 權限', ai: false, editor: false, manager: false, admin: true },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-bg-soft)',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

export function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  const tabs = [
    { id: 'agents', label: 'AI Agents' },
    { id: 'line', label: 'Line 通知' },
    { id: 'permissions', label: '權限管理' },
    ...(isAdmin ? [{ id: 'brands', label: '品牌' }, { id: 'accounts', label: '品牌帳號' }] : []),
  ];
  const [tab, setTab] = useState('agents');
  const { brandById } = useBrand();
  const { agents, users } = useMeta();

  return (
    <div>
      <PageHeader title="設定" subtitle="AI Agents、權限、新增品牌與品牌登入帳號" />
      <Card style={{ marginBottom: 16, borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: 14 }}>Threads／Meta 申請手冊</strong>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.7 }}>
              App Review 送審畫面、可貼文案、資料處理與過審後接新品牌的步驟，都記在這一頁，避免之後重做。
            </p>
          </div>
          <Link to="/settings/meta-threads">
            <Button variant="secondary">打開手冊</Button>
          </Link>
        </div>
      </Card>
      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>
      </Card>

      {tab === 'agents' && (
        <div className="grid-2" style={{ gap: 12 }}>
          {agents.map((a) => {
            const brand = a.brandId ? brandById(a.brandId) : undefined;
            return (
              <Card key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar label={a.displayName} color={a.avatarColor} size={40} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{a.displayName}</strong>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ROLE_LABELS[a.roleCode]}</div>
                </div>
                <Badge tone={brand ? 'secondary' : 'default'}>{brand ? brand.name : '跨品牌通用'}</Badge>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'permissions' && (
        <>
          <Card style={{ marginBottom: 16, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '8px 6px' }}>動作</th>
                  <th style={{ padding: '8px 6px' }}>AI</th>
                  <th style={{ padding: '8px 6px' }}>品牌編輯</th>
                  <th style={{ padding: '8px 6px' }}>品牌負責人</th>
                  <th style={{ padding: '8px 6px' }}>集團管理者</th>
                </tr>
              </thead>
              <tbody>
                {permissionMatrix.map((row) => (
                  <tr key={row.action} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.action}</td>
                    <td style={{ padding: '8px 6px' }}>{row.ai ? '✅' : '❌'}</td>
                    <td style={{ padding: '8px 6px' }}>{row.editor ? '✅' : '❌'}</td>
                    <td style={{ padding: '8px 6px' }}>{row.manager ? '✅' : '❌'}</td>
                    <td style={{ padding: '8px 6px' }}>{row.admin ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>使用者與角色</strong>
            <div style={{ display: 'grid', gap: 8 }}>
              {users.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar label={u.displayName} color="var(--color-secondary)" size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.email}</div>
                  </div>
                  <Badge tone={u.role === 'super_admin' ? 'accent' : 'primary'}>{USER_ROLE_LABELS[u.role]}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'line' && (
        <>
          <LineNotifyPanel />
          {(user?.role === 'super_admin' || user?.role === 'brand_manager') && (
            <div style={{ marginTop: 16 }}>
              <LineSpacesPanel />
            </div>
          )}
        </>
      )}
      {tab === 'brands' && isAdmin && <BrandsOnboardPanel />}
      {tab === 'accounts' && isAdmin && <BrandAccountsPanel />}
    </div>
  );
}

function LineNotifyPanel() {
  const { data, loading, error, reload } = useAsyncData(() => api.lineBinding(), []);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createCode() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.createLineBindCode();
      setCode(res.code);
      setExpiresAt(res.expiresAt);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '產生失敗');
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(patch: { notifyReview?: boolean; notifyFailed?: boolean; unbind?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateLineBinding(patch);
      if (patch.unbind) {
        setCode(null);
        setMessage('已解除綁定');
      }
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <strong style={{ display: 'block', marginBottom: 8 }}>GO 行銷機器人</strong>
      <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        加好友後，內部人員用綁定碼才能在私訊查資料。外包小編請把機器人拉進<strong>單一品牌工作群</strong>，管理員 @GO行銷機器人 後回「這個群綁定 Homigo」，之後這個群只看 Homigo。
        群組裡<strong>只有被 @GO行銷機器人</strong>才會回話；一般對話、沒有 @ 的「今日發文」都不會插嘴。指定品牌前也不會回成效。
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12, color: 'var(--color-text-muted)' }}>
        LINE Official Account 後台請允許加入群組／多人聊天；Messaging API webhook 設成
        <code>/api/webhooks/line/ops</code>。建議開啟「僅在被提及或被回覆時接收 webhook」，避免群組閒聊打進來。
      </p>
      {loading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>讀取綁定狀態…</p>}
      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 12 }}>
          {error}{' '}
          <button type="button" onClick={reload} style={{ textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
            重試
          </button>
        </p>
      )}
      {data && !data.configured && (
        <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 12 }}>伺服器尚未設定 Line 行銷 Bot 密鑰。</p>
      )}
      {data?.addFriendUrl && (
        <a href={data.addFriendUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>加好友 ↗</a>
      )}
      <div style={{ margin: '12px 0', fontSize: 13 }}>
        {data?.bound
          ? `已綁定 ${data.displayName ?? data.lineUserIdMasked}`
          : loading ? '—' : '尚未綁定'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Button variant="primary" disabled={busy} onClick={createCode}>
          {busy ? '處理中…' : '產生綁定碼'}
        </Button>
        {data?.bound && (
          <Button variant="ghost" disabled={busy} onClick={() => savePrefs({ unbind: true })}>解除綁定</Button>
        )}
      </div>
      {code && (
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          加好友後傳 <strong>綁定 {code}</strong>
          {expiresAt ? `（${new Date(expiresAt).toLocaleTimeString('zh-TW')} 前有效）` : ''}
        </p>
      )}
      {data?.bound && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          問答模式：私訊給已綁定的內部帳號；群組只有被 @GO行銷機器人 才會回。工作群只看綁定的那一個品牌。
        </p>
      )}
      {message && <p style={{ fontSize: 13, marginTop: 10 }}>{message}</p>}
    </Card>
  );
}

function fmtSpaceTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function maskConversation(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function LineSpacesPanel() {
  const { user } = useAuth();
  const { brands } = useBrand();
  const { data, loading, error, reload } = useAsyncData(() => api.lineSpaces(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<import('@/types').LineOpsSpace[]>([]);

  useEffect(() => {
    if (data?.spaces) setSpaces(data.spaces);
  }, [data]);

  const canBindUnbound = user?.role === 'super_admin';

  async function bind(id: string, brandId: string | null) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await api.updateLineSpace(id, { brandId });
      setSpaces(res.spaces);
      setMessage(brandId ? '已綁定品牌' : '已解除品牌綁定');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '綁定失敗');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <strong style={{ display: 'block', marginBottom: 8 }}>機器人加入的群組</strong>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>讀取群組…</p>
      </Card>
    );
  }

  return (
    <Card>
      <strong style={{ display: 'block', marginBottom: 8 }}>機器人加入的群組</strong>
      <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12, color: 'var(--color-text-muted)' }}>
        拉進群後會出現在這裡。未指定品牌的群不能查資料。集團管理者可在此綁定；品牌負責人只能管理已綁在自己品牌下的群。
      </p>
      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 10 }}>
          {error}{' '}
          <button type="button" onClick={reload} style={{ textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
            重試
          </button>
        </p>
      )}
      {message && <p style={{ fontSize: 13, marginBottom: 10 }}>{message}</p>}
      {!spaces.length && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>機器人還沒加入任何群組。</p>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {spaces.map((space) => {
          const allowedBrands = canBindUnbound
            ? brands
            : brands.filter((b) => b.id === space.brandId || (user?.brandIds ?? []).includes(b.id));
          return (
            <div
              key={space.id}
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-soft)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{space.displayName || '尚未取得群名'}</strong>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {space.spaceType === 'room' ? '多人聊天' : '群組'} · {maskConversation(space.conversationId)}
                    {space.memberCount != null ? ` · ${space.memberCount} 人` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Badge tone={space.status === 'active' ? 'success' : 'default'}>
                    {space.status === 'active' ? '在群裡' : '已退出'}
                  </Badge>
                  <Badge tone={space.brandName ? 'primary' : 'accent'}>
                    {space.brandName ?? '未綁品牌'}
                  </Badge>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                加入 {fmtSpaceTime(space.joinedAt)}
                {space.lastEventAt ? ` · 最近活動 ${fmtSpaceTime(space.lastEventAt)}` : ''}
                {space.lastEventType ? `（${space.lastEventType}）` : ''}
                {space.boundByName ? ` · 綁定人 ${space.boundByName}` : ''}
              </div>
              {space.status === 'active' && (canBindUnbound || space.brandId) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={space.brandId ?? ''}
                    disabled={busyId === space.id || (!canBindUnbound && !space.brandId)}
                    onChange={(e) => bind(space.id, e.target.value || null)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      fontSize: 13,
                      background: 'var(--color-bg)',
                    }}
                  >
                    <option value="">{canBindUnbound ? '未綁品牌' : '選擇品牌'}</option>
                    {allowedBrands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {space.brandId && (
                    <Button
                      variant="ghost"
                      disabled={busyId === space.id}
                      onClick={() => bind(space.id, null)}
                    >
                      解綁
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BrandsOnboardPanel() {
  const { brands, reloadBrands } = useBrand();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3A5A7C');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [blogBaseUrl, setBlogBaseUrl] = useState('');
  const [cta, setCta] = useState('');
  const [editorNickname, setEditorNickname] = useState('小編');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [seoTopicCount, setSeoTopicCount] = useState(0);

  function guessSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.createBrand({
        name,
        slug: slug || guessSlug(name),
        tagline: tagline || undefined,
        primaryColor,
        industry,
        audience: audience || undefined,
        websiteUrl: websiteUrl || undefined,
        blogBaseUrl: blogBaseUrl || websiteUrl || undefined,
        cta: cta || undefined,
        editorNickname: editorNickname || undefined,
      });
      setCreatedSlug(res.slug);
      setSeoTopicCount(res.seoTopicCount);
      setName('');
      setSlug('');
      setTagline('');
      setIndustry('');
      setAudience('');
      setWebsiteUrl('');
      setBlogBaseUrl('');
      setCta('');
      await reloadBrands();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '新增品牌失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>新增品牌</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
          建完會自動帶 FB／IG／Threads 發文時段、小編 Agent 與 SEO 主題庫，之後排程會跟 Homigo／TaskGo／Washgo 一樣產社群稿。
          官網長文可到該品牌「官網 SEO」從主題庫產文。品牌智慧補完後，口吻會更準。
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
          <div className="grid-2" style={{ gap: 12 }}>
            <label style={labelStyle}>
              <span>品牌名稱 *</span>
              <input required value={name} onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(guessSlug(e.target.value));
              }} style={inputStyle} placeholder="例如 GoClean" />
            </label>
            <label style={labelStyle}>
              <span>網址代碼 *</span>
              <input required value={slug} onChange={(e) => setSlug(guessSlug(e.target.value))} style={inputStyle} placeholder="goclean" />
            </label>
          </div>
          <label style={labelStyle}>
            <span>一句定位</span>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} style={inputStyle} placeholder="把日常作業收回同一個地方" />
          </label>
          <label style={labelStyle}>
            <span>產業與產品 *</span>
            <textarea
              required
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
              placeholder="用幾句話說明做什麼、給誰用、現場最痛的事。這段會寫進品牌智慧與 SEO 題庫。"
            />
          </label>
          <label style={labelStyle}>
            <span>主要受眾</span>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} style={inputStyle} placeholder="例如店主、工程行、房東" />
          </label>
          <div className="grid-2" style={{ gap: 12 }}>
            <label style={labelStyle}>
              <span>官網</span>
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} style={inputStyle} placeholder="https://" />
            </label>
            <label style={labelStyle}>
              <span>部落格網域（SEO）</span>
              <input value={blogBaseUrl} onChange={(e) => setBlogBaseUrl(e.target.value)} style={inputStyle} placeholder="空白則用官網" />
            </label>
          </div>
          <div className="grid-2" style={{ gap: 12 }}>
            <label style={labelStyle}>
              <span>主色</span>
              <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span>小編暱稱</span>
              <input value={editorNickname} onChange={(e) => setEditorNickname(e.target.value)} style={inputStyle} />
            </label>
          </div>
          <label style={labelStyle}>
            <span>官網長文文末 CTA</span>
            <input value={cta} onChange={(e) => setCta(e.target.value)} style={inputStyle} placeholder="空白則用匠管信箱與電話" />
          </label>
          {error && (
            <div style={{ fontSize: 13, color: '#B85454', background: '#FDF0F0', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}
          {createdSlug && (
            <div style={{ fontSize: 13, lineHeight: 1.7, background: 'var(--color-bg-soft)', padding: '10px 12px', borderRadius: 8 }}>
              已建立，並產出 {seoTopicCount} 則 SEO 主題。接著補：
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <Link to={`/${createdSlug}/intelligence`}>品牌智慧</Link>
                <Link to={`/${createdSlug}/posting-times`}>發文時段</Link>
                <Link to={`/${createdSlug}/seo`}>官網 SEO</Link>
                <Link to={`/${createdSlug}/social`}>社群帳號</Link>
              </div>
            </div>
          )}
          <Button type="submit" variant="primary" disabled={saving}>{saving ? '建立中…' : '建立品牌'}</Button>
        </form>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>現有品牌</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {brands.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-soft)' }}>
              <Avatar label={b.name} color={b.primaryColor} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.slug} · {b.tagline || '尚無定位'}</div>
              </div>
              <Link to={`/${b.slug}/workspace`} style={{ fontSize: 12 }}>工作台</Link>
              <Link to={`/${b.slug}/seo`} style={{ fontSize: 12 }}>SEO</Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BrandAccountsPanel() {
  const { brands } = useBrand();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('brand_manager');
  const [brandIds, setBrandIds] = useState<string[]>([]);

  async function reload() {
    setLoading(true);
    try {
      const { users: list } = await api.adminUsers();
      setUsers(list);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '載入帳號失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function resetForm() {
    setEditingId(null);
    setDisplayName('');
    setUsername('');
    setPassword('');
    setEmail('');
    setRole('brand_manager');
    setBrandIds([]);
  }

  function startEdit(u: User) {
    setEditingId(u.id);
    setDisplayName(u.displayName);
    setUsername(u.username ?? '');
    setPassword('');
    setEmail(u.email.endsWith('@login.go-mkt.tw') ? '' : u.email);
    setRole(u.role);
    setBrandIds(u.brandIds ?? []);
    setError('');
  }

  function toggleBrand(id: string) {
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!brandIds.length) {
      setError('請至少指定一個品牌');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateAdminUser(editingId, {
          displayName,
          username,
          password: password || undefined,
          email: email || undefined,
          role,
          brandIds,
        });
      } else {
        await api.createAdminUser({ displayName, username, password, email: email || undefined, role, brandIds });
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      await api.updateAdminUser(u.id, { isActive: !u.isActive });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新狀態失敗');
    }
  }

  const managed = users.filter((u) => u.role !== 'super_admin');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>{editingId ? '編輯品牌登入帳號' : '新增品牌登入帳號'}</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14 }}>
          建立後，該帳號只能看到被指定的品牌。集團 Admin 仍用原本的環境變數登入。
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
          <label style={labelStyle}>
            <span>顯示名稱 *</span>
            <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} placeholder="例如 FIXERCOWORK 品牌負責人" />
          </label>
          <label style={labelStyle}>
            <span>登入帳號 *</span>
            <input required value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} placeholder="例如 61136412" autoComplete="off" />
          </label>
          <label style={labelStyle}>
            <span>{editingId ? '新密碼（空白則不更改）' : '密碼 *'}</span>
            <input
              type="password"
              required={!editingId}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder={editingId ? '若要重設再填' : '至少 6 個字元'}
              autoComplete="new-password"
            />
          </label>
          <label style={labelStyle}>
            <span>Email（選填）</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="未填則自動產生" />
          </label>
          <label style={labelStyle}>
            <span>角色</span>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={inputStyle}>
              <option value="brand_manager">品牌負責人</option>
              <option value="brand_editor">品牌編輯</option>
              <option value="viewer">唯讀</option>
            </select>
          </label>
          <div style={labelStyle}>
            <span>可管理的品牌 *</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {brands.map((b) => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13 }}>
                  <input type="checkbox" checked={brandIds.includes(b.id)} onChange={() => toggleBrand(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          {error && (
            <div style={{ fontSize: 13, color: '#B85454', background: '#FDF0F0', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? '儲存中…' : editingId ? '更新帳號' : '建立帳號'}</Button>
            {editingId && <Button type="button" variant="ghost" onClick={resetForm}>取消編輯</Button>}
          </div>
        </form>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>品牌登入帳號列表</h3>
        {loading ? <p style={{ fontSize: 13 }}>載入中…</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {managed.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>尚無品牌帳號，請先在上方建立。</p>}
            {managed.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--color-bg-soft)',
                  opacity: u.isActive === false ? 0.6 : 1,
                }}
              >
                <Avatar label={u.displayName} color="var(--color-secondary)" size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    帳號 {u.username || '尚未設定'} · {(u.brandSlugs ?? []).join('、') || '未指定品牌'}
                  </div>
                </div>
                <Badge tone={u.hasPassword ? 'primary' : 'default'}>{u.hasPassword ? '可登入' : '未設密碼'}</Badge>
                <Badge tone={u.role === 'brand_manager' ? 'accent' : 'secondary'}>{USER_ROLE_LABELS[u.role]}</Badge>
                <Button variant="ghost" onClick={() => startEdit(u)}>編輯</Button>
                <Button variant="ghost" onClick={() => void toggleActive(u)}>{u.isActive === false ? '啟用' : '停用'}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
