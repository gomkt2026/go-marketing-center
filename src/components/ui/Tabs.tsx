import { motion } from 'framer-motion';
import { HelpTip } from '@/components/ui/HelpTip';

interface TabsProps {
  tabs: { id: string; label: string; hint?: string }[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs-bar">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <span key={tab.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
            <button
              type="button"
              onClick={() => onChange(tab.id)}
              style={{
                position: 'relative',
                background: 'none',
                border: 'none',
                padding: '10px 8px 10px 16px',
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="tab-underline"
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: 'var(--color-primary)',
                    borderRadius: 2,
                  }}
                />
              )}
            </button>
            {tab.hint && <HelpTip text={tab.hint} label={`${tab.label}說明`} />}
          </span>
        );
      })}
    </div>
  );
}
