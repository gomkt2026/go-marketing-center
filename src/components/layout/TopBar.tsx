import { BrandSwitcher } from './BrandSwitcher';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

export function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header
      style={{
        height: 64, borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 10,
      }}
    >
      <BrandSwitcher />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          aria-label="通知"
          style={{
            background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)',
            borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 16,
          }}
        >
          🔔
        </button>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar label={user.displayName} color="var(--color-secondary)" size={32} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>上帝視角 · {user.role}</div>
              </div>
            </div>
            <Button variant="ghost" onClick={() => void logout()} style={{ fontSize: 12, padding: '6px 10px' }}>
              登出
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
