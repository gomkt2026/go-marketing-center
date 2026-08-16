import { useEffect, useState, type FormEvent } from 'react';
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
    { id: 'permissions', label: '權限管理' },
    ...(isAdmin ? [{ id: 'accounts', label: '品牌帳號' }] : []),
  ];
  const [tab, setTab] = useState('agents');
  const { brandById } = useBrand();
  const { agents, users } = useMeta();

  return (
    <div>
      <PageHeader title="設定" subtitle="AI Agents 管理、權限架構與品牌登入帳號" />
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

      {tab === 'accounts' && isAdmin && <BrandAccountsPanel />}
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
