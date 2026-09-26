import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useBrand } from '@/context/BrandContext';
import { useLayout } from '@/context/LayoutContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

interface MenuItem {
  label: string;
  path: string;
  brandScoped?: boolean;
  end?: boolean;
  onlySlug?: string;
}

interface MainItem extends MenuItem {
  children?: MenuItem[];
}

interface OtherGroup {
  title: string;
  items: MenuItem[];
}

const mainItems: MainItem[] = [
  { label: '儀表板', path: '/workspace', brandScoped: true, end: true },
  {
    label: '工作台',
    path: '/contents',
    brandScoped: true,
    children: [{ label: 'Threads', path: '/threads', brandScoped: true }],
  },
  {
    label: '發布',
    path: '/publishing',
    brandScoped: true,
    children: [{ label: '行程表', path: '/schedule', brandScoped: true }],
  },
  { label: '成果', path: '/analytics', brandScoped: true },
  { label: '品牌智慧', path: '/intelligence', brandScoped: true },
];

const otherGroups: OtherGroup[] = [
  {
    title: '產題',
    items: [
      { label: '跟小編聊', path: '/editor', brandScoped: true },
      { label: '市場情報', path: '/market', brandScoped: true },
      { label: '即時熱門', path: '/trending' },
    ],
  },
  {
    title: '加值內容',
    items: [
      { label: 'Podcast 節目', path: '/podcast' },
      { label: '短影音', path: '/shorts', brandScoped: true },
      { label: '教學 Short', path: '/tutorials', brandScoped: true, onlySlug: 'homigo' },
      { label: '官網 SEO', path: '/seo', brandScoped: true },
      { label: '行銷活動', path: '/campaigns', brandScoped: true },
      { label: '活動報名', path: '/events', brandScoped: true },
    ],
  },
  {
    title: '協作',
    items: [
      { label: 'AI 會議室', path: '/meetings' },
      { label: '決策中心', path: '/decisions' },
      { label: '品牌合作', path: '/collaborations' },
    ],
  },
  {
    title: '品牌資產',
    items: [
      { label: '品牌客服資料庫', path: '/help', brandScoped: true },
      { label: '人脈資料庫', path: '/network', brandScoped: true },
      { label: '場域地圖', path: '/geo', brandScoped: true },
    ],
  },
  {
    title: '系統',
    items: [
      { label: '總覽 Dashboard', path: '/overview', end: true },
      { label: '持續學習', path: '/learning', brandScoped: true },
      { label: '時間軸', path: '/timeline' },
      { label: '發文時段', path: '/posting-times', brandScoped: true },
      { label: '社群帳號', path: '/social', brandScoped: true },
      { label: '小編人設', path: '/personas' },
      { label: 'Threads 申請手冊', path: '/settings/meta-threads' },
      { label: '遊戲排行榜', path: '/settings/game' },
      { label: '設定', path: '/settings', end: true },
    ],
  },
];

function resolveTo(item: MenuItem, scopedSlug?: string) {
  return item.brandScoped && scopedSlug ? `/${scopedSlug}${item.path}` : item.path;
}

function pathMatches(pathname: string, to: string, end?: boolean) {
  if (end || to === '/') return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SidebarLink({
  item,
  scopedSlug,
  onNavigate,
  child,
}: {
  item: MenuItem;
  scopedSlug?: string;
  onNavigate: () => void;
  child?: boolean;
}) {
  const to = resolveTo(item, scopedSlug);
  return (
    <NavLink
      to={to}
      end={Boolean(item.end)}
      onClick={onNavigate}
      className={`app-sidebar-nav-link${child ? ' is-child' : ''}`}
      style={({ isActive }) => ({
        fontWeight: isActive ? 700 : 500,
        color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
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
}

export function Sidebar() {
  const { currentBrand, brands } = useBrand();
  const { user, logout } = useAuth();
  const { isMobile, sidebarOpen, closeSidebar } = useLayout();
  const { pathname } = useLocation();
  const scopedBrand = currentBrand ?? brands[0];
  const scopedSlug = scopedBrand?.slug;

  const visibleGroups = otherGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.onlySlug || item.onlySlug === scopedSlug),
    }))
    .filter((group) => group.items.length > 0);
  const otherActive = visibleGroups.some((group) =>
    group.items.some((item) => pathMatches(pathname, resolveTo(item, scopedSlug), item.end)),
  );
  const [otherOpen, setOtherOpen] = useState(otherActive);

  useEffect(() => {
    if (otherActive) setOtherOpen(true);
  }, [otherActive]);

  return (
    <>
      {isMobile && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden />
      )}
      <aside
        className={`app-sidebar${sidebarOpen ? ' is-open' : ''}`}
        aria-hidden={isMobile && !sidebarOpen}
      >
        <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
          {isMobile && (
            <button className="app-icon-btn" aria-label="關閉選單" onClick={closeSidebar}>
              ✕
            </button>
          )}
        </div>

        <nav style={{ flex: 1, padding: '4px 12px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            {mainItems.map((item) => (
              <div key={item.path}>
                <SidebarLink item={item} scopedSlug={scopedSlug} onNavigate={closeSidebar} />
                {item.children?.map((child) => (
                  <SidebarLink
                    key={child.path}
                    item={child}
                    scopedSlug={scopedSlug}
                    onNavigate={closeSidebar}
                    child
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="app-sidebar-more">
            <button
              type="button"
              className={`app-sidebar-more-toggle${otherOpen ? ' is-open' : ''}${otherActive ? ' is-active' : ''}`}
              aria-expanded={otherOpen}
              onClick={() => setOtherOpen((open) => !open)}
            >
              其他
              <span aria-hidden>{otherOpen ? '▴' : '▾'}</span>
            </button>
            {otherOpen && visibleGroups.map((group) => (
              <div key={group.title} className="app-sidebar-more-group">
                <div className="app-sidebar-group-title">{group.title}</div>
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.path}
                    item={item}
                    scopedSlug={scopedSlug}
                    onNavigate={closeSidebar}
                  />
                ))}
              </div>
            ))}
          </div>
        </nav>

        {isMobile && user && (
          <div style={{ padding: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Avatar label={user.displayName} color="var(--color-secondary)" size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{user.role}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => void logout()}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              登出
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
