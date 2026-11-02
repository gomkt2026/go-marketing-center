import { Navigate } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { LoadingState } from '@/hooks/useAsyncData';

/** 登入後進會自己開會的行銷辦公室。 */
export function HomeRedirect() {
  const { brandsLoading } = useBrand();
  if (brandsLoading) return <LoadingState />;
  return <Navigate to="/office" replace />;
}
