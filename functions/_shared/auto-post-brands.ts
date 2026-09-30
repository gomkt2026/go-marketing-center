/** 自動發文只跑這三個品牌。Fixercowork 不排程、不補檔、不自動回覆。 */
export const AUTO_POST_BRAND_SLUGS = ['homigo', 'taskgo', 'washgo'] as const;

export function isAutoPostBrand(slug: string): boolean {
  return (AUTO_POST_BRAND_SLUGS as readonly string[]).includes(slug);
}
