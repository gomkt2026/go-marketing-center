import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useBrand } from '@/context/BrandContext';

interface MenuItem {
  label: string;
  path: string;
  brandScoped?: boolean;
}
interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const groups: MenuGroup[] = [
  { title: '', items: [{ label: '總覽 Dashboard', path: '/' }] },
  {
    title: '品牌經營',
    items: [
      { label: '品牌工作區', path: '/workspace', brandScoped: true },
      { label: '品牌智慧', path: '/intelligence', brandScoped: true },
      { label: '市場情報', path: '/market', brandScoped: true },
      { label: '即時熱門', path: '/trending' },
    ],
  },
  {
    title: '協作決策',
    items: [
      { label: 'AI 會議室', path: '/meetings' },
      { label: '小編人設', path: '/personas' },
      { label: '決策中心', path: '/decisions' },
      { label: '品牌合作', path: '/collaborations' },
    ],
  },
  {
    title: '內容營運',
    items: [
      { label: '行銷活動', path: '/campaigns', brandScoped: true },
      { label: '活動報名', path: '/events', brandScoped: true },
      { label: '內容中心', path: '/contents', brandScoped: true },
      { label: 'Podcast 節目', path: '/podcast' },
      { label: '短影音', path: '/shorts', brandScoped: true },
      { label: '發布管理', path: '/publishing', brandScoped: true },
      { label: '行程表', path: '/schedule', brandScoped: true },
      { label: 'Threads 互動', path: '/thread-replies', brandScoped: true },
      { label: '社群帳號', path: '/social', brandScoped: true },
    ],
  },
  {
    title: '洞察',
    items: [
      { label: '成效分析', path: '/analytics', brandScoped: true },
      { label: '持續學習', path: '/learning', brandScoped: true },
      { label: '時間軸', path: '/timeline' },
    ],
  },
  {
    title: '',
    items: [{ label: '設定', path: '/settings' }],
  },
];

export function Sidebar() {
  const { currentBrand, brands } = useBrand();
  // 「全部品牌」模式下,品牌 scoped 連結退回第一個品牌,避免產生無效路徑
  const scopedBrand = currentBrand ?? brands[0];

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2E3B26', fontWeight: 800,
            }}
          >
            G
          </div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>GO 行銷中心</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '4px 12px 20px' }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 16 }}>
            {group.title && (
              <div
                style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 12px 6px',
                }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const to = item.brandScoped && scopedBrand ? `/${scopedBrand.slug}${item.path}` : item.path;
              return (
                <NavLink
                  key={item.path}
                  to={to}
                  style={({ isActive }) => ({
                    display: 'block',
                    position: 'relative',
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                    textDecoration: 'none',
                    marginBottom: 2,
                  })}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active"
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{
                            position: 'absolute', inset: 0, background: 'var(--color-primary-soft)',
                            borderRadius: 8, zIndex: -1,
                          }}
                        />
                      )}
                      {item.label}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
