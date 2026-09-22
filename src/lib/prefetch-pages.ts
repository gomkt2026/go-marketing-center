/** 登入後預先抓小編每天會點的頁面，避免側欄一點就白屏等 chunk。 */
export function prefetchEditorPages() {
  void import('@/pages/brand/BrandWorkspace');
  void import('@/pages/content/ContentCenter');
  void import('@/pages/publishing/ThreadsDesk');
  void import('@/pages/publishing/Publishing');
  void import('@/pages/publishing/Schedule');
  void import('@/pages/analytics/Analytics');
  void import('@/pages/brand/BrandIntelligence');
}
