import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { brands, brandBySlug } from '@/mocks';
import type { Brand } from '@/types';

interface BrandContextValue {
  currentBrand: Brand | null;
  isAllBrands: boolean;
  setBrandBySlug: (slug: string | null) => void;
  brands: Brand[];
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [slug, setSlug] = useState<string | null>('homigo');

  const value = useMemo<BrandContextValue>(() => {
    const currentBrand = slug ? brandBySlug(slug) ?? null : null;
    return {
      currentBrand,
      isAllBrands: slug === null,
      setBrandBySlug: setSlug,
      brands,
    };
  }, [slug]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
