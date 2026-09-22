import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { useAuth } from '@/context/AuthContext';
import { BrandMark } from '@/components/brand/BrandMark';
import { BRAND_SCOPED_PREFIXES, RESERVED_APP_PATHS } from '@/lib/constants';

export function BrandSwitcher() {
  const { currentBrand, brands, setBrandBySlug, isAllBrands } = useBrand();
  const { user } = useAuth();
  const canSeeAllBrands = user?.role === 'super_admin';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function handleSelect(slug: string | null) {
    setBrandBySlug(slug);
    setOpen(false);
    const parts = location.pathname.split('/').filter(Boolean);
    const page = parts[1];
    const onBrandSubpage = Boolean(
      parts[0]
      && brands.some((b) => b.slug === parts[0])
      && page
      && (BRAND_SCOPED_PREFIXES.includes(page) || !RESERVED_APP_PATHS.has(page)),
    );
    if (slug) {
      if (onBrandSubpage) {
        navigate(`/${slug}/${page}`);
      } else {
        navigate(`/${slug}/workspace`);
      }
    } else if (onBrandSubpage) {
      navigate('/overview');
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)',
          borderRadius: 10, padding: '6px 12px 6px 8px', cursor: 'pointer',
        }}
      >
        {currentBrand ? (
          <>
            <BrandMark brand={currentBrand} size={26} />
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div className="brand-switcher-name">{currentBrand.name}</div>
              <div className="brand-switcher-meta" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {currentBrand.versionNumber ? `v${currentBrand.versionNumber} 已發布` : ''}
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 700, padding: '2px 4px' }}>全部品牌</div>
        )}
        <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: '110%', left: 0, minWidth: 220,
              maxWidth: 'min(280px, calc(100vw - 24px))',
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 12, boxShadow: 'var(--shadow-card-hover)', padding: 6, zIndex: 50,
            }}
          >
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelect(b.slug)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '8px 10px', borderRadius: 8, border: 'none',
                  background: currentBrand?.id === b.id ? 'var(--color-primary-soft)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <BrandMark brand={b} size={22} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
              </button>
            ))}
            {canSeeAllBrands && (
              <>
                <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 4px' }} />
                <button
                  onClick={() => handleSelect(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: isAllBrands ? 'var(--color-primary-soft)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 600,
                  }}
                >
                  全部品牌
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
