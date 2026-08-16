import { BrandSwitcher } from './BrandSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

export function TopBar() {
  const { user, logout } = useAuth();
  const { isMobile, sidebarOpen, toggleSidebar } = useLayout();

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        {isMobile && (
          <button
            className="app-icon-btn"
            aria-label={sidebarOpen ? '關閉選單' : '開啟選單'}
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
        )}
        <BrandSwitcher />
      </div>
      <div className="app-topbar-right">
        <button
          className="app-icon-btn"
          aria-label="通知"
        >
          🔔
        </button>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar label={user.displayName} color="var(--color-secondary)" size={32} />
            <div className="user-meta">
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>上帝視角 · {user.role}</div>
            </div>
            {!isMobile && (
              <Button variant="ghost" onClick={() => void logout()} style={{ fontSize: 12, padding: '6px 10px' }}>
                登出
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
