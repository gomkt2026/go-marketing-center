import { Navigate } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { LoadingState } from '@/hooks/useAsyncData';
import { Dashboard } from '@/pages/Dashboard';

/** 有品牌時進該品牌儀表板；沒有品牌才停在跨品牌總覽。 */
export function HomeRedirect() {
  const { currentBrand, brands, brandsLoading } = useBrand();
  const brand = currentBrand ?? brands[0];

  if (brandsLoading) return <LoadingState />;
  if (brand) return <Navigate to={`/${brand.slug}/workspace`} replace />;
  return <Dashboard />;
}
