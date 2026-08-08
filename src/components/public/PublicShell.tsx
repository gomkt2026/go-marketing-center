import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PublicShell({
  children, maxWidth = 480, accentColor,
}: { children: ReactNode; maxWidth?: number; accentColor?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, var(--color-primary-soft) 0%, var(--color-bg-soft) 55%)',
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ width: '100%', maxWidth, alignSelf: 'flex-start' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: accentColor ?? 'var(--color-primary-dark)', letterSpacing: 1 }}>
            GO 行銷中心 · 活動報名
          </div>
        </div>
        <div
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            padding: '28px 24px',
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export function PublicMessage({ title, body, tone = 'default' }: { title: string; body?: string; tone?: 'default' | 'success' | 'danger' }) {
  const colors = {
    default: { bg: 'var(--color-bg-soft)', color: 'var(--color-text)' },
    success: { bg: 'var(--color-primary-soft)', color: 'var(--color-primary-dark)' },
    danger: { bg: 'var(--color-danger-soft)', color: '#B85454' },
  }[tone];
  return (
    <div style={{ textAlign: 'center', padding: '24px 8px' }}>
      <div style={{
        display: 'inline-flex', padding: '10px 18px', borderRadius: 12,
        background: colors.bg, color: colors.color, fontWeight: 700, fontSize: 15, marginBottom: 10,
      }}
      >
        {title}
      </div>
      {body && <p style={{ fontSize: 13, marginTop: 8 }}>{body}</p>}
    </div>
  );
}

export const publicInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-bg-soft)',
  outline: 'none',
};

export const publicLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text)',
};
