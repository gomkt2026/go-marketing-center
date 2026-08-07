import type { User, AIAgent } from '@/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  login: (username: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: User }>('/api/auth/me'),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  brands: () => request<{ brands: import('@/types').Brand[] }>('/api/brands'),

  brand: (slug: string) =>
    request<{ brand: import('@/types').Brand; version: import('@/types').BrandVersion | null }>(`/api/brands/${slug}`),

  brandIntelligence: (slug: string) =>
    request<{
      rules: import('@/types').BrandRule[];
      audiences: import('@/types').BrandAudience[];
      personas: import('@/types').BrandPersona[];
      channels: import('@/types').BrandChannel[];
      visuals: import('@/types').BrandVisual[];
      keywords: import('@/types').BrandKeyword[];
      examples: import('@/types').BrandExample[];
      documents: import('@/types').BrandDocument[];
      histories: import('@/types').BrandHistory[];
    }>(`/api/brands/${slug}/intelligence`),

  brandWorkspace: (slug: string) =>
    request<{
      stats: { activeCampaigns: number; pendingContents: number; marketSignals: number; learningRecords: number };
      histories: import('@/types').BrandHistory[];
    }>(`/api/brands/${slug}/workspace`),

  marketSignals: (slug: string) =>
    request<{ signals: import('@/types').MarketSignal[] }>(`/api/brands/${slug}/market-signals`),

  campaigns: (slug: string) =>
    request<{ campaigns: import('@/types').Campaign[] }>(`/api/brands/${slug}/campaigns`),

  createCampaign: (slug: string, body: { title: string; objective?: string }) =>
    request<{ campaign: import('@/types').Campaign }>(`/api/brands/${slug}/campaigns`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  contents: (slug: string) =>
    request<{ contents: import('@/types').Content[] }>(`/api/brands/${slug}/contents`),

  reviewContent: (contentId: string, body: { action: string; comment?: string; contentVersionId?: string }) =>
    request<{ ok: boolean; status: string }>(`/api/contents/${contentId}/review`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  publishing: (slug: string) =>
    request<{ jobs: (import('@/types').PublishingJob & { contentTitle?: string })[] }>(`/api/brands/${slug}/publishing`),

  analytics: (slug: string) =>
    request<{
      reports: { perf: import('@/types').PerformanceReport; content: { id: string; title: string } }[];
      totals: { impressions: number; clicks: number; comments: number; shares: number; saves: number };
    }>(`/api/brands/${slug}/analytics`),

  learning: (slug: string) =>
    request<{ records: import('@/types').LearningRecord[] }>(`/api/brands/${slug}/learning`),

  dashboard: () =>
    request<{
      brands: import('@/types').Brand[];
      pendingProposals: { id: string; title: string; brandId?: string; collaborationId?: string }[];
      pendingContents: { id: string; title: string; brandId: string }[];
      marketSignals: import('@/types').MarketSignal[];
      recentActivity: import('@/types').ActivityLog[];
      actionLabels: Record<string, string>;
      brandStats: { brandId: string; activeCampaigns: number; pendingContents: number }[];
    }>('/api/dashboard'),

  proposals: () =>
    request<{ proposals: import('@/types').Proposal[]; decisions: import('@/types').Decision[] }>('/api/proposals'),

  decideProposal: (id: string, body: { action: 'approve' | 'reject' | 'return'; chosenOptionId?: string; note?: string }) =>
    request<{ ok: boolean; status: string }>(`/api/proposals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  meetings: () => request<{ meetings: import('@/types').Meeting[] }>('/api/meetings'),

  meeting: (id: string) =>
    request<{
      meeting: import('@/types').Meeting;
      messages: import('@/types').MeetingMessage[];
      summary: import('@/types').MeetingSummary | null;
    }>(`/api/meetings/${id}`),

  postMeetingMessage: (id: string, content: string) =>
    request<{ message: import('@/types').MeetingMessage }>(`/api/meetings/${id}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  collaborations: () =>
    request<{ collaborations: (import('@/types').Collaboration & { latestBrief?: import('@/types').CollaborationBrief | null })[] }>('/api/collaborations'),

  activity: (brandId?: string) =>
    request<{ activity: import('@/types').ActivityLog[]; actionLabels: Record<string, string> }>(
      `/api/activity${brandId ? `?brandId=${brandId}` : ''}`,
    ),

  meta: () => request<{ users: User[]; agents: AIAgent[] }>('/api/meta'),

  updateMarketSignal: (id: string, status: string) =>
    request<{ signal: import('@/types').MarketSignal }>(`/api/market-signals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  createBrandRule: (body: {
    brandId: string;
    ruleType: string;
    statement: string;
    conditionNote?: string;
    verification?: string;
  }) =>
    request<{ rule: import('@/types').BrandRule }>('/api/brand-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateBrandRule: (id: string, body: Partial<{ statement: string; conditionNote: string; verification: string }>) =>
    request<{ rule: import('@/types').BrandRule }>(`/api/brand-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteBrandRule: (id: string) =>
    request<{ ok: boolean }>(`/api/brand-rules/${id}`, { method: 'DELETE' }),
};
