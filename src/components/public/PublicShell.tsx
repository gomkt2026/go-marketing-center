import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface PublicBrandInfo {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  tagline?: string | null;
}

export const FIXER_ORANGE = '#F26522';
export const FIXER_NAVY = '#1B2B47';
export const FIXER_ORANGE_SOFT = '#FFF1E8';
export const FIXER_NAVY_SOFT = '#E8EEF6';

export function brandAccent(brand?: PublicBrandInfo | null): string | undefined {
  if (!brand) return undefined;
  if (brand.slug === 'fixercowork') return FIXER_ORANGE;
  return brand.primaryColor ?? undefined;
}

export function PublicShell({
  children, maxWidth = 480, accentColor, brand,
}: { children: ReactNode; maxWidth?: number; accentColor?: string; brand?: PublicBrandInfo | null }) {
  const accent = accentColor ?? brandAccent(brand);
  const isFixer = brand?.slug === 'fixercowork';
  const headerColor = isFixer ? FIXER_NAVY : (accent ?? 'var(--color-primary-dark)');
  const pageBg = isFixer
    ? `linear-gradient(165deg, ${FIXER_ORANGE_SOFT} 0%, #FFFFFF 42%, ${FIXER_NAVY_SOFT} 100%)`
    : 'linear-gradient(160deg, var(--color-primary-soft) 0%, var(--color-bg-soft) 55%)';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: pageBg,
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ width: '100%', maxWidth: isFixer ? Math.max(maxWidth, 560) : maxWidth, alignSelf: 'flex-start' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {brand?.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt={brand.name}
              style={{ maxHeight: 88, maxWidth: 240, objectFit: 'contain', marginBottom: 8 }}
            />
          ) : null}
          <div style={{ fontSize: 13, fontWeight: 800, color: headerColor, letterSpacing: 1.4 }}>
            {brand ? brand.name : 'GO 行銷中心 · 活動報名'}
          </div>
          {brand?.tagline && (
            <div style={{
              fontSize: 11,
              color: isFixer ? FIXER_NAVY : (accent ?? 'var(--color-text-muted)'),
              letterSpacing: 1.6,
              marginTop: 4,
              fontWeight: 600,
            }}
            >
              {isFixer ? (
                <>
                  <span style={{ color: FIXER_ORANGE }}>REPAIR</span>
                  <span style={{ color: FIXER_NAVY }}> & MAINTAIN SOLUTIONS</span>
                </>
              ) : brand.tagline}
            </div>
          )}
        </div>
        <div
          style={{
            background: '#fff',
            border: isFixer ? `1.5px solid ${FIXER_NAVY}22` : '1px solid var(--color-border)',
            borderRadius: 20,
            boxShadow: isFixer ? `0 12px 36px ${FIXER_NAVY}14` : '0 8px 32px rgba(0,0,0,0.06)',
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
    success: { bg: FIXER_ORANGE_SOFT, color: FIXER_ORANGE },
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
