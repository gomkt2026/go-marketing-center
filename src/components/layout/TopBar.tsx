import { BrandSwitcher } from './BrandSwitcher';
import { currentUser } from '@/mocks';
import { Avatar } from '@/components/ui/Avatar';

export function TopBar() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar label={currentUser.displayName} color="var(--color-secondary)" size={32} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.displayName}</div>
        </div>
      </div>
    </header>
  );
}
