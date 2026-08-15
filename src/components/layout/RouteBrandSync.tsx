import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { RESERVED_APP_PATHS, BRAND_SCOPED_PREFIXES } from '@/lib/constants';

export function RouteBrandSync() {
  const { brand: slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentBrand, setBrandBySlug, brandBySlug, brands, brandsLoading } = useBrand();

  useEffect(() => {
    if (brandsLoading) return;
    if (!slug || RESERVED_APP_PATHS.has(slug)) return;

    if (brandBySlug(slug)) {
      if (currentBrand?.slug !== slug) setBrandBySlug(slug);
      return;
    }

    const rest = location.pathname.split('/').filter(Boolean).slice(1);
    const scoped = rest[0] && BRAND_SCOPED_PREFIXES.includes(rest[0]);
    if (!scoped || !brands.length) return;

    navigate(`/${brands[0].slug}/${rest[0]}`, { replace: true });
  }, [slug, currentBrand?.slug, setBrandBySlug, brandBySlug, brands, brandsLoading, navigate, location.pathname]);

  return null;
}
