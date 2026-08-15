import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

const BRAND_SCOPED_PREFIXES = ['workspace', 'intelligence', 'market', 'campaigns', 'events', 'contents', 'publishing', 'thread-replies', 'social', 'analytics', 'learning'];

/** 品牌小圖標:有官方 logo 用 logo(白底 contain),沒有就退回色塊字首 */
function BrandMark({ brand, size }: { brand: { primaryColor: string; logoInitial: string; logoUrl?: string | null; name: string }; size: number }) {
  if (brand.logoUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.27, background: '#fff',
        border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
      >
        <img src={brand.logoUrl} alt={brand.name} style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.27, background: brand.primaryColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.5,
    }}
    >
      {brand.logoInitial}
    </div>
  );
}

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

  const versionQuery = useAsyncData(
    () => currentBrand ? api.brand(currentBrand.slug).then((r) => r.version) : Promise.resolve(null),
    [currentBrand?.slug],
  );
  const version = versionQuery.data;

  function handleSelect(slug: string | null) {
    setBrandBySlug(slug);
    setOpen(false);
    const parts = location.pathname.split('/').filter(Boolean);
    const rest = parts.length > 1 ? parts.slice(1).join('/') : '';
    const isScoped = rest && BRAND_SCOPED_PREFIXES.includes(rest.split('/')[0]);
    if (slug) {
      if (isScoped) {
        // 品牌 scoped 頁面:切到同頁的新品牌路徑(去掉詳情 id,只保留第一層)
        navigate(`/${slug}/${rest.split('/')[0]}`);
      }
    } else if (isScoped) {
      // 切到「全部品牌」時,品牌 scoped 頁面無對應檢視,導回總覽
      navigate('/');
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
