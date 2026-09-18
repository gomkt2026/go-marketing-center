import { useState } from 'react';

const FALLBACK_LOGOS: Record<string, string> = {
  homigo: '/api/media/brand-assets/homigo/logo.png',
  taskgo: '/api/media/brand-assets/taskgo/logo.png',
  washgo: '/api/media/brand-assets/washgo/logo.png',
  fixercowork: '/brands/fixercowork-logo.png',
};

export function brandLogoSrc(brand: { slug?: string; logoUrl?: string | null }): string | null {
  return brand.logoUrl || (brand.slug ? FALLBACK_LOGOS[brand.slug] ?? null : null);
}

/** 品牌小圖標:有官方 logo 用 logo(白底 contain),沒有或載入失敗就退回色塊字首 */
export function BrandMark({
  brand,
  size,
}: {
  brand: { slug?: string; primaryColor: string; logoInitial: string; logoUrl?: string | null; name: string };
  size: number;
}) {
  const src = brandLogoSrc(brand);
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.27, background: '#fff',
        border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
      >
        <img
          src={src}
          alt={brand.name}
          onError={() => setBroken(true)}
          style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }}
        />
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
