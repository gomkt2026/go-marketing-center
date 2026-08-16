import { motion } from 'framer-motion';

interface TabsProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs-bar">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              position: 'relative',
              background: 'none',
              border: 'none',
              padding: '10px 16px',
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
        );
      })}
    </div>
  );
}
