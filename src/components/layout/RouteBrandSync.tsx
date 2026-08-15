import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';

export function RouteBrandSync() {
  const { brand: slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentBrand, setBrandBySlug, brandBySlug, brands, brandsLoading } = useBrand();

  useEffect(() => {
    if (brandsLoading) return;
    if (slug && brandBySlug(slug)) {
      if (currentBrand?.slug !== slug) setBrandBySlug(slug);
      return;
    }
    if (slug && brands.length && !brandBySlug(slug)) {
      const fallback = brands[0].slug;
      const rest = location.pathname.split('/').filter(Boolean).slice(1).join('/');
      navigate(rest ? `/${fallback}/${rest}` : `/${fallback}/events`, { replace: true });
    }
  }, [slug, currentBrand?.slug, setBrandBySlug, brandBySlug, brands, brandsLoading, navigate, location.pathname]);

  return null;
}
