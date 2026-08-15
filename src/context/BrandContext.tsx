import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Brand } from '@/types';

interface BrandContextValue {
  currentBrand: Brand | null;
  isAllBrands: boolean;
  setBrandBySlug: (slug: string | null) => void;
  brands: Brand[];
  brandsLoading: boolean;
  brandBySlug: (slug: string) => Brand | undefined;
  brandById: (id: string) => Brand | undefined;
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  useEffect(() => {
    setBrandsLoading(true);
    api.brands()
      .then(({ brands: list }) => {
        setBrands(list);
        setSlug((current) => {
          if (current && list.some((b) => b.slug === current)) return current;
          return list[0]?.slug ?? null;
        });
      })
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  }, []);

  const value = useMemo<BrandContextValue>(() => {
    const brandBySlugFn = (s: string) => brands.find((b) => b.slug === s);
    const brandByIdFn = (id: string) => brands.find((b) => b.id === id);
    const currentBrand = slug ? brandBySlugFn(slug) ?? null : null;
    return {
      currentBrand,
      isAllBrands: slug === null,
      setBrandBySlug: setSlug,
      brands,
      brandsLoading,
      brandBySlug: brandBySlugFn,
      brandById: brandByIdFn,
    };
  }, [slug, brands, brandsLoading]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
