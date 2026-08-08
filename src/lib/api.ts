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
    request<{
      jobs: (import('@/types').PublishingJob & { contentTitle?: string; targetPlatform?: string })[];
      queue: import('@/types').PublishingQueueItem[];
    }>(`/api/brands/${slug}/publishing`),

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
    request<{ message: import('@/types').MeetingMessage; aiReplies?: number; aiError?: string | null }>(`/api/meetings/${id}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  createMeeting: (body: { title: string; topic?: string; brandSlug?: string; crossBrand?: boolean; kickoff?: boolean; mode?: 'standard' | 'live_editors' }) =>
    request<{ meeting: import('@/types').Meeting; aiError?: string | null }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  concludeMeeting: (id: string) =>
    request<{
      summary: string;
      suggestedRules: { brandSlug: string; ruleType: string; statement: string; conditionNote?: string }[];
      postPlan: import('@/types').MeetingPostPlanItem[];
      learnings: { brandSlug: string; insight: string }[];
    }>(`/api/meetings/${id}/conclude`, { method: 'POST' }),

  advanceMeeting: (id: string) =>
    request<{
      message: import('@/types').MeetingMessage | null;
      agent: { id: string; displayName: string; nickname?: string; avatarUrl?: string | null } | null;
      done?: boolean;
    }>(`/api/meetings/${id}/advance`, { method: 'POST' }),

  executeMeetingPlan: (id: string) =>
    request<{
      created: { brandSlug: string; platform: string; contentId: string; title: string }[];
      failures: { brandSlug: string; platform: string; error: string }[];
    }>(`/api/meetings/${id}/execute-plan`, { method: 'POST' }),

  agents: () => request<{ agents: import('@/types').AgentWithPersona[] }>('/api/agents'),

  updateAgentPersona: (id: string, body: {
    nickname?: string; characterTitle?: string; temperament?: string; catchphrase?: string; focus?: string;
  }) =>
    request<{ agent: { id: string; displayName: string; persona: import('@/types').AgentPersona } }>(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  generateAgentAvatar: (id: string) =>
    request<{ avatarUrl: string }>(`/api/agents/${id}/avatar`, { method: 'POST' }),

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

  // -- AI 內容生成 ----------------------------------------------------------
  generateFromSignal: (signalId: string, body?: { platforms?: string[]; instruction?: string }) =>
    request<{
      created: { contentId: string; platform: string; score: number; imageUrl: string | null; imageError: string | null }[];
      failures: { platform: string; error: string }[];
    }>(`/api/market-signals/${signalId}/generate`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  regenerateContent: (contentId: string, body?: { instruction?: string }) =>
    request<{ ok: boolean; versionNumber: number; predictedEngagementScore: number; imageUrl: string | null; imageError: string | null }>(
      `/api/contents/${contentId}/regenerate`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),

  // -- 社群帳號串接 ----------------------------------------------------------
  socialAccounts: (slug: string) =>
    request<{ accounts: import('@/types').SocialAccount[] }>(`/api/brands/${slug}/social-accounts`),

  saveSocialAccount: (slug: string, body: {
    platform: string; accountName?: string; externalId?: string;
    accessToken?: string; clearToken?: boolean; notes?: string; autoPublish?: boolean;
  }) =>
    request<{ account: import('@/types').SocialAccount }>(`/api/brands/${slug}/social-accounts`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  testSocialAccount: (slug: string, platform: string) =>
    request<{ ok: boolean; status: string; detail: string }>(`/api/brands/${slug}/social-accounts/test`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  manualPublishContent: (contentId: string, body?: { externalPostUrl?: string }) =>
    request<{ ok: boolean; jobId: string }>(`/api/contents/${contentId}/manual-publish`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
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

  // -- 活動報名與報到(管理端,需登入) --------------------------------------
  events: (slug: string) =>
    request<{ events: import('@/types').EventRecord[] }>(`/api/brands/${slug}/events`),

  createEvent: (slug: string, body: {
    title: string; description?: string; location?: string; eventDate?: string;
    price?: number; priceLabel?: string; lineAddFriendUrl?: string;
  }) =>
    request<{ event: import('@/types').EventRecord }>(`/api/brands/${slug}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  eventDetail: (id: string) =>
    request<{
      event: import('@/types').EventRecord;
      sessions: import('@/types').EventSession[];
      referrers: import('@/types').EventReferrer[];
    }>(`/api/events/${id}`),

  updateEvent: (id: string, body: Partial<{
    title: string; description: string; location: string; eventDate: string;
    status: import('@/types').EventStatus; formFields: import('@/types').EventFormField[];
    price: number; priceLabel: string; lineAddFriendUrl: string;
    sessions: { id?: string; label: string; startsAt?: string; capacity?: number | null; sortOrder?: number }[];
  }>) =>
    request<{ event: import('@/types').EventRecord }>(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  eventReferrers: (eventId: string) =>
    request<{ referrers: import('@/types').EventReferrer[] }>(`/api/events/${eventId}/referrers`),

  createEventReferrer: (eventId: string, body: {
    name: string; commissionType: import('@/types').EventReferrerCommissionType; commissionValue: number;
  }) =>
    request<{ referrer: import('@/types').EventReferrer }>(`/api/events/${eventId}/referrers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateEventReferrer: (eventId: string, referrerId: string, body: Partial<{
    name: string; commissionType: import('@/types').EventReferrerCommissionType;
    commissionValue: number; isActive: boolean;
  }>) =>
    request<{ referrer: import('@/types').EventReferrer }>(`/api/events/${eventId}/referrers/${referrerId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteEventReferrer: (eventId: string, referrerId: string) =>
    request<{ ok: boolean }>(`/api/events/${eventId}/referrers/${referrerId}`, { method: 'DELETE' }),

  eventRegistrations: (eventId: string, search?: string) =>
    request<{ registrations: import('@/types').EventRegistration[] }>(
      `/api/events/${eventId}/registrations${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),

  checkinRegistration: (eventId: string, registrationId: string, action: 'check_in' | 'undo') =>
    request<{ registration: import('@/types').EventRegistration }>(
      `/api/events/${eventId}/registrations/${registrationId}/checkin`,
      { method: 'POST', body: JSON.stringify({ action }) },
    ),

  eventStats: (eventId: string) =>
    request<import('@/types').EventStats>(`/api/events/${eventId}/stats`),

  eventExportUrl: (eventId: string) => `/api/events/${eventId}/export`,
};

// -- 活動報名(公開端,無需登入) ----------------------------------------------
export const publicApi = {
  event: (slug: string) =>
    request<{
      event: Pick<import('@/types').EventRecord, 'id' | 'slug' | 'title' | 'description' | 'location' | 'eventDate' | 'status' | 'formFields' | 'priceLabel' | 'lineAddFriendUrl'>;
      sessions: import('@/types').EventSession[];
      referrers: import('@/types').EventReferrer[];
    }>(`/api/public/events/${slug}`),

  register: (slug: string, body: {
    name: string; phone: string; email?: string; lineId?: string;
    sessionId?: string; referrerId?: string; referrerName?: string;
    customAnswers?: Record<string, unknown>;
  }) =>
    request<{ registration: import('@/types').EventRegistration }>(`/api/public/events/${slug}/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  lookupByPhone: (slug: string, phone: string) =>
    request<{ registrations: import('@/types').EventRegistration[] }>(`/api/public/events/${slug}/lookup`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  ticket: (qrToken: string) =>
    request<{ ticket: import('@/types').EventRegistration & {
      eventSlug: string; eventTitle: string; eventLocation?: string; eventDate?: string;
      lineAddFriendUrl?: string; sessionLabel?: string;
    } }>(`/api/public/tickets/${qrToken}`),
};

// -- 工作人員報到(無需登入,以 staffToken 授權) --------------------------------
export const checkinApi = {
  verify: (staffToken: string) =>
    request<{ eventId: string; eventSlug: string; title: string; location?: string; eventDate?: string; status: string }>(
      '/api/checkin/verify',
      { method: 'POST', body: JSON.stringify({ staffToken }) },
    ),

  scan: (staffToken: string, qrToken: string) =>
    request<{ ok: boolean; alreadyCheckedIn: boolean; registration: import('@/types').EventRegistration }>(
      '/api/checkin/scan',
      { method: 'POST', body: JSON.stringify({ staffToken, qrToken }) },
    ),
};
