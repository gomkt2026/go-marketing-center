/** 非品牌 slug 的頂層路徑,不可被 RouteBrandSync 當成品牌導走 */
export const RESERVED_APP_PATHS = new Set([
  'settings', 'trending', 'meetings', 'personas', 'decisions',
  'collaborations', 'podcast', 'timeline', 'login', 'e', 'checkin', 'privacy',
]);

export const BRAND_SCOPED_PREFIXES = [
  'workspace', 'intelligence', 'market', 'campaigns', 'events', 'contents',
  'shorts', 'publishing', 'schedule', 'thread-replies', 'social', 'analytics', 'learning',
];

export function brandSlugFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first || RESERVED_APP_PATHS.has(first)) return null;
  return first;
}

export const ROLE_LABELS: Record<string, string> = {
  brand_ai: '品牌 AI',
  market_analyst: '市場分析',
  content_strategist: '內容策略',
  risk_advisor: '風險評估',
  devils_advocate: '反方觀點',
  moderator: '會議主持',
};
