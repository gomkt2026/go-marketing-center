import type { ReactNode } from 'react';

export type BadgeTone = 'default' | 'primary' | 'accent' | 'secondary' | 'danger' | 'success';

const toneStyles: Record<BadgeTone, { bg: string; color: string }> = {
  default: { bg: '#F0F1EE', color: '#6C6C6C' },
  primary: { bg: 'var(--color-primary-soft)', color: 'var(--color-primary-dark)' },
  accent: { bg: 'var(--color-accent-soft)', color: '#B8650F' },
  secondary: { bg: 'var(--color-secondary-soft)', color: '#8C5F47' },
  danger: { bg: 'var(--color-danger-soft)', color: '#B85454' },
  success: { bg: 'var(--color-primary-soft)', color: 'var(--color-primary-dark)' },
};

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: BadgeTone }) {
  const s = toneStyles[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
