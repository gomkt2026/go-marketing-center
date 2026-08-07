import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';

export function RouteBrandSync() {
  const { brand: slug } = useParams();
  const { currentBrand, setBrandBySlug, brandBySlug } = useBrand();

  useEffect(() => {
    if (slug && brandBySlug(slug) && currentBrand?.slug !== slug) {
      setBrandBySlug(slug);
    }
  }, [slug, currentBrand?.slug, setBrandBySlug, brandBySlug]);

  return null;
}
