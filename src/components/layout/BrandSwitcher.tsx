import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { versionByBrand } from '@/mocks';

const BRAND_SCOPED_PREFIXES = ['workspace', 'intelligence', 'market', 'campaigns', 'contents', 'publishing', 'analytics', 'learning'];

export function BrandSwitcher() {
  const { currentBrand, brands, setBrandBySlug, isAllBrands } = useBrand();
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

  const version = currentBrand ? versionByBrand(currentBrand.id) : undefined;

  function handleSelect(slug: string | null) {
    setBrandBySlug(slug);
    setOpen(false);
    if (slug) {
      const parts = location.pathname.split('/').filter(Boolean);
      const rest = parts.length > 1 ? parts.slice(1).join('/') : '';
      const isScoped = rest && BRAND_SCOPED_PREFIXES.includes(rest.split('/')[0]);
      if (isScoped) {
        navigate(`/${slug}/${rest}`);
      }
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
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: currentBrand.primaryColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13,
            }}
            >
              {currentBrand.logoInitial}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{currentBrand.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {version ? `v${version.versionNumber} 已發布` : ''}
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
                <div style={{
                  width: 22, height: 22, borderRadius: 6, background: b.primaryColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11,
                }}
                >
                  {b.logoInitial}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
              </button>
            ))}
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
              🌐 全部品牌
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
