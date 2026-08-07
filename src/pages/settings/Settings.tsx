import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { useMeta } from '@/context/MetaContext';
import { ROLE_LABELS } from '@/lib/constants';

const TABS = [
  { id: 'agents', label: 'AI Agents' },
  { id: 'permissions', label: '權限管理' },
];

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

export function Settings() {
  const [tab, setTab] = useState('agents');
  const { brandById } = useBrand();
  const { agents, users } = useMeta();

  return (
    <div>
      <PageHeader title="設定" subtitle="AI Agents 管理與權限架構" />
      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </Card>

      {tab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
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
                  <Badge tone={u.role === 'super_admin' ? 'accent' : 'primary'}>{u.role}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
