import { useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { LoadingState } from '@/hooks/useAsyncData';
import catalog from '@/data/homigo-tutorial-catalog.json';

type Role = 'landlord' | 'tenant' | 'manager';
type Status = 'done' | 'proposed';
type RoleFilter = 'all' | Role;

interface TutorialItem {
  slug: string;
  title: string;
  role: Role;
  paths: string[];
  helpDoc: string;
  status: Status;
}

const ROLE_LABEL: Record<Role, string> = {
  landlord: '房東',
  tenant: '房客',
  manager: '代管',
};

const STATUS_META: Record<Status, { label: string; tone: BadgeTone }> = {
  done: { label: '已成片', tone: 'success' },
  proposed: { label: '待確認', tone: 'default' },
};

const LOOK = [
  { label: '畫幅', value: '寬 1080，高度跟完整 App 走。不套 9:16。' },
  { label: '標題', value: '畫面外深藍 #023047，上方多 140px，白字。' },
  { label: '字幕', value: '操作 pill 在畫面高度 3/4，字級 60。' },
  { label: '浮水印', value: '原色 logo，透明度 0.30，放在 App 區正中。' },
  { label: '封面', value: '淺底 #F0F9FC，logo 置中。片頭 1 秒再接本體。' },
  { label: '聲音', value: '不上 BGM，成片無音訊。預設不上 YouTube。' },
];

const items = catalog.items as TutorialItem[];

export function HomigoTutorials() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [role, setRole] = useState<RoleFilter>('all');

  const visible = useMemo(
    () => items.filter((item) => role === 'all' || item.role === role),
    [role],
  );
  const doneCount = items.filter((item) => item.status === 'done').length;

  if (!slug) return <Navigate to="/" replace />;
  if (brandsLoading) return <LoadingState />;
  if (!brand) return <Navigate to="/" replace />;

  if (slug !== 'homigo') {
    return (
      <div>
        <PageHeader title="教學 Short" subtitle="Homigo App 側錄教學。這一條目前只做 Homigo。" />
        <Card style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          切到 Homigo 之後，側欄「教學 Short」會列出房東、房客、代管的拍攝清單。
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="教學 Short"
        subtitle="Homigo 房東、房客、代管 App 的側錄教學。保留頂欄與底導覽，不上 BGM，不做成 9:16。"
        actions={<Badge tone="primary">已成片 {doneCount} / {items.length}</Badge>}
      />

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>成片規格（已鎖）</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          新增物件那支已經依這套出片。後面每一支沿用同一張臉，不要改回左右補邊或重上色的 logo。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {LOOK.map((row) => (
            <div key={row.label} style={{ background: 'var(--color-bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{row.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>怎麼往下拍</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          清單對過操作文件，除了「新增物件」都還是待確認。要拍哪一支先講 slug，一次一支。
          側錄與剪輯腳本還沒放進這個 repo，補上之前不會出新片。成片留在本機，不進 Git。
        </p>
      </Card>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['all', 'landlord', 'tenant', 'manager'] as RoleFilter[]).map((id) => (
          <Button key={id} variant={role === id ? 'primary' : 'ghost'} onClick={() => setRole(id)}>
            {id === 'all' ? '全部' : ROLE_LABEL[id]}
          </Button>
        ))}
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                <th style={th}>狀態</th>
                <th style={th}>誰在用</th>
                <th style={th}>標題</th>
                <th style={th}>slug</th>
                <th style={th}>畫面</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const status = STATUS_META[item.status];
                return (
                  <tr key={item.slug}>
                    <td style={td}><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td style={td}>{ROLE_LABEL[item.role]}</td>
                    <td style={td}>{item.title}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{item.slug}</td>
                    <td style={{ ...td, color: 'var(--color-text-muted)' }}>{item.paths.join('、')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const th: CSSProperties = { padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--color-border)' };
const td: CSSProperties = { padding: '10px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' };
