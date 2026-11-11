import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBrand } from '@/context/BrandContext';
import { LoadingState } from '@/hooks/useAsyncData';

/** 管理者進行銷中心；品牌帳號進自己的儀表板。 */
export function HomeRedirect() {
  const { user } = useAuth();
  const { brands, brandsLoading } = useBrand();
  if (brandsLoading) return <LoadingState />;
  if (user?.role === 'super_admin') return <Navigate to="/office" replace />;
  const slug = brands[0]?.slug ?? user?.brandSlugs?.[0];
  if (slug) return <Navigate to={`/${slug}/workspace`} replace />;
  return <Navigate to="/settings" replace />;
}
