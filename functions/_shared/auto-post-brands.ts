/** 會自動發到平台的品牌。Fixercowork 不排程、不補檔、不自動回覆。 */
export const AUTO_POST_BRAND_SLUGS = ['homigo', 'taskgo', 'washgo'] as const;

/** 跟三品牌同一套時段產稿，但只進待審，不建發布單、不打平台 API。 */
export const DRAFT_ONLY_BRAND_SLUGS = ['bbbox'] as const;

export function isAutoPostBrand(slug: string): boolean {
  return (AUTO_POST_BRAND_SLUGS as readonly string[]).includes(slug);
}

export function isDraftOnlyBrand(slug: string): boolean {
  return (DRAFT_ONLY_BRAND_SLUGS as readonly string[]).includes(slug);
}

/** 排程會產稿的品牌：三品牌發出去，和居家居留在工作台。 */
export function isScheduledBrand(slug: string): boolean {
  return isAutoPostBrand(slug) || isDraftOnlyBrand(slug);
}
