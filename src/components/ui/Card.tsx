import { motion } from 'framer-motion';
import type { ReactNode, CSSProperties, MouseEventHandler } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  hoverable?: boolean;
  delay?: number;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card({ children, style, className, hoverable, delay = 0, onClick }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      whileHover={hoverable ? { y: -2, boxShadow: 'var(--shadow-card-hover)' } : undefined}
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: '20px',
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
