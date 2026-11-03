import { Navigate, useParams } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { LoadingState } from '@/hooks/useAsyncData';
import { Office } from '@/pages/office/Office';

export function BbboxCenter() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;

  if (slug !== 'bbbox') return <Navigate to="/office" replace />;
  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/office" replace />;
  return <Office room="bbbox" />;
}
