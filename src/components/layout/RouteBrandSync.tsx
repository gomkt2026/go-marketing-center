import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useBrand } from '@/context/BrandContext';
import { brandBySlug } from '@/mocks';

/**
 * URL 是 brand_id 的注入來源:直接以網址進入品牌範圍頁時,
 * 讓頂部品牌切換器與網址同步,避免「網址是 A 品牌、畫面卻顯示 B 品牌」的誤操作風險。
 */
export function RouteBrandSync() {
  const { brand: slug } = useParams();
  const { currentBrand, setBrandBySlug } = useBrand();

  useEffect(() => {
    if (slug && brandBySlug(slug) && currentBrand?.slug !== slug) {
      setBrandBySlug(slug);
    }
  }, [slug, currentBrand?.slug, setBrandBySlug]);

  return null;
}
