import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

interface ButtonProps {
  variant?: Variant;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const variants: Record<Variant, { bg: string; color: string; border: string }> = {
  primary: { bg: 'var(--color-primary)', color: '#2E3B26', border: 'transparent' },
  accent: { bg: 'var(--color-accent)', color: '#fff', border: 'transparent' },
  secondary: { bg: 'var(--color-secondary-soft)', color: 'var(--color-secondary)', border: 'transparent' },
  danger: { bg: 'var(--color-danger-soft)', color: '#B85454', border: 'transparent' },
  ghost: { bg: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' },
};

export function Button({ variant = 'primary', style, children, ...rest }: ButtonProps) {
  const v = variants[variant];
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      {...rest}
      style={{
        background: v.bg,
        color: v.color,
        border: v.border,
        borderRadius: 'var(--radius-sm)',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}
