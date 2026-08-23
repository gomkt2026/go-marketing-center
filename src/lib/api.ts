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
      assets: import('@/types').BrandAsset[];
      pressCoverages: import('@/types').PressCoverage[];
      pressReleases: import('@/types').PressRelease[];
    }>(`/api/brands/${slug}/intelligence`),

  // -- 品牌智慧圖片素材庫(系統畫面截圖/實拍照片,可當 Threads 圖片靈感貼文的話題來源) --------
  brandAssets: (slug: string) =>
    request<{ assets: import('@/types').BrandAsset[] }>(`/api/brands/${slug}/assets`),

  uploadBrandAsset: async (slug: string, params: { file: File; caption?: string; imageCategory?: string }) => {
    const form = new FormData();
    form.append('file', params.file);
    if (params.caption) form.append('caption', params.caption);
    if (params.imageCategory) form.append('imageCategory', params.imageCategory);
    const res = await fetch(`/api/brands/${slug}/assets`, { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as { asset: import('@/types').BrandAsset };
  },

  deleteBrandAsset: (slug: string, assetId: string) =>
    request<{ ok: boolean }>(`/api/brands/${slug}/assets/${assetId}`, { method: 'DELETE' }),

  generatePostFromAsset: (slug: string, assetId: string) =>
    request<{ contentId: string }>(`/api/brands/${slug}/assets/${assetId}/generate-post`, { method: 'POST' }),

  brandWorkspace: (slug: string) =>
    request<{
      stats: { activeCampaigns: number; pendingContents: number; marketSignals: number; learningRecords: number };
      histories: import('@/types').BrandHistory[];
      pressCoverages: import('@/types').PressCoverage[];
    }>(`/api/brands/${slug}/workspace`),

  createPressCoverage: (slug: string, body: {
    outlet: string; headline: string; articleUrl?: string; publishedOn?: string;
    storyKey?: string; summary?: string; keyQuotes?: string[]; claimableFacts?: string[];
    isPrimary?: boolean; relatedBrandSlugs?: string[]; status?: string;
  }) =>
    request<{ coverage: import('@/types').PressCoverage }>(`/api/brands/${slug}/press-coverages`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  parsePressCoverage: (slug: string, url: string) =>
    request<{ parsed: import('@/types').ParsedPressCoverage }>(`/api/brands/${slug}/press-coverages/parse`, {
      method: 'POST', body: JSON.stringify({ url }),
    }),

  discoverPressCoverages: (slug: string) =>
    request<{ items: import('@/types').DiscoveredPressItem[] }>(`/api/brands/${slug}/press-coverages/discover`, {
      method: 'POST', body: JSON.stringify({}),
    }),

  convertPressCoverage: (slug: string, body: {
    url?: string; outlet?: string; headline?: string; articleUrl?: string; publishedOn?: string;
    summary?: string; keyQuotes?: string[]; claimableFacts?: string[]; storyKey?: string; status?: string;
  }) =>
    request<{ coverage: import('@/types').PressCoverage; parseNotes?: string[]; alreadyExists?: boolean }>(
      `/api/brands/${slug}/press-coverages/convert`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  migratePress: () =>
    request<{ ok: boolean; steps: string[] }>('/api/admin/migrate-press', {
      method: 'POST', body: JSON.stringify({}),
    }),

  updatePressCoverage: (slug: string, id: string, body: Record<string, unknown>) =>
    request<{ coverage: import('@/types').PressCoverage }>(`/api/brands/${slug}/press-coverages/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  approvePressCoverage: (slug: string, id: string, body?: {
    isPrimary?: boolean; storyKey?: string; summary?: string;
    keyQuotes?: string[]; claimableFacts?: string[]; dismiss?: boolean;
  }) =>
    request<{ coverage: import('@/types').PressCoverage }>(`/api/brands/${slug}/press-coverages/${id}/approve`, {
      method: 'POST', body: JSON.stringify(body ?? {}),
    }),

  generateFromPressCoverage: (slug: string, id: string) =>
    request<{ created: { contentId: string; platform: string }[]; failures: { platform: string; error: string }[] }>(
      `/api/brands/${slug}/press-coverages/${id}/generate`, { method: 'POST', body: JSON.stringify({}) },
    ),

  generateArticleFromPressCoverage: (slug: string, id: string) =>
    request<{ contentId: string; title: string }>(
      `/api/brands/${slug}/press-coverages/${id}/generate-article`, { method: 'POST', body: JSON.stringify({}) },
    ),

  createPressRelease: (slug: string, body: { title: string; body: string; embargoOn?: string }) =>
    request<{ release: import('@/types').PressRelease }>(`/api/brands/${slug}/press-releases`, {
      method: 'POST', body: JSON.stringify(body),
    }),

  updatePressRelease: (slug: string, id: string, body: { title?: string; body?: string; embargoOn?: string | null }) =>
    request<{ release: import('@/types').PressRelease }>(`/api/brands/${slug}/press-releases/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  reviewPressRelease: (slug: string, id: string, action: 'submit' | 'approve' | 'return' | 'finalize', note?: string) =>
    request<{ release: import('@/types').PressRelease }>(`/api/brands/${slug}/press-releases/${id}/review`, {
      method: 'POST', body: JSON.stringify({ action, note }),
    }),

  generateFromPressRelease: (slug: string, id: string) =>
    request<{ created: { contentId: string; platform: string }[]; failures: { platform: string; error: string }[] }>(
      `/api/brands/${slug}/press-releases/${id}/generate`, { method: 'POST', body: JSON.stringify({}) },
    ),

  generateArticleFromPressRelease: (slug: string, id: string) =>
    request<{ contentId: string; title: string }>(
      `/api/brands/${slug}/press-releases/${id}/generate-article`, { method: 'POST', body: JSON.stringify({}) },
    ),

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
      jobs: (import('@/types').PublishingJob & {
        contentTitle?: string; targetPlatform?: string;
        body?: string | null; imageUrl?: string | null;
      })[];
      queue: import('@/types').PublishingQueueItem[];
    }>(`/api/brands/${slug}/publishing`),

  schedule: (slug: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ items: import('@/types').ScheduleItem[]; from: string; to: string }>(
      `/api/brands/${slug}/schedule${suffix}`,
    );
  },

  retrySchedule: (slug: string, jobId: string) =>
    request<{ ok: boolean }>(`/api/brands/${slug}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),

  analytics: (slug: string) =>
    request<import('@/types').AnalyticsPayload>(`/api/brands/${slug}/analytics`),

  syncAnalytics: (slug: string, jobId?: string) =>
    request<{ attempted: number; synced: number; failed: number; skipped: number; remaining: number; results: { jobId: string; ok: boolean; error?: string }[] }>(
      `/api/brands/${slug}/analytics/sync`,
      { method: 'POST', body: JSON.stringify(jobId ? { jobId } : {}) },
    ),

  saveAnalyticsReport: (slug: string, body: {
    jobId: string; impressions?: number; clicks?: number; comments?: number; shares?: number; saves?: number; likes?: number;
  }) =>
    request<{ ok: boolean }>(`/api/brands/${slug}/analytics/reports`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  requestAnalyticsLearn: (slug: string) =>
    request<{ brandId: string; created: number; skipped: string | null }>(`/api/brands/${slug}/analytics/learn`, {
      method: 'POST',
    }),

  learning: (slug: string) =>
    request<{ records: import('@/types').LearningRecord[] }>(`/api/brands/${slug}/learning`),

  decideLearning: (slug: string, id: string, body: { action: 'approve' | 'dismiss'; insight?: string }) =>
    request<{ record: import('@/types').LearningRecord }>(`/api/brands/${slug}/learning/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

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

  adminUsers: () => request<{ users: User[] }>('/api/admin/users'),

  createAdminUser: (body: {
    displayName: string; username: string; password: string; email?: string; role: User['role']; brandIds: string[];
  }) =>
    request<{ user: User }>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),

  updateAdminUser: (id: string, body: {
    displayName?: string; username?: string; password?: string; email?: string;
    role?: User['role']; brandIds?: string[]; isActive?: boolean;
  }) =>
    request<{ user: User }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  trending: () =>
    request<{
      trends: { title: string; url: string | null; snippet: string | null }[];
      news: import('@/types').TrendingItem[];
      community: import('@/types').TrendingItem[];
      keywords: { text: string; weight: number }[];
      generatedAt: string;
    }>('/api/trending'),

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
    autoReply?: boolean; replyDailyCap?: number;
  }) =>
    request<{ account: import('@/types').SocialAccount }>(`/api/brands/${slug}/social-accounts`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // -- Threads 熱門貼文回覆佇列 ----------------------------------------------
  threadReplies: (slug: string, status = 'pending') =>
    request<{ targets: import('@/types').ThreadsReplyTarget[]; replied24h: number }>(
      `/api/brands/${slug}/thread-replies?status=${status}`,
    ),

  actThreadReply: (slug: string, body: { id: string; action: 'approve' | 'skip'; replyText?: string }) =>
    request<{ ok: boolean; status: string; permalink?: string | null }>(`/api/brands/${slug}/thread-replies`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  testSocialAccount: (slug: string, platform: string) =>
    request<{ ok: boolean; status: string; detail: string }>(`/api/brands/${slug}/social-accounts/test`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  // -- Collaboration 範圍的社群帳號(目前僅 Go 生態系共用 X 帳號) --------------
  collaborationSocialAccounts: (collaborationId: string) =>
    request<{ accounts: import('@/types').SocialAccount[] }>(`/api/collaborations/${collaborationId}/social-accounts`),

  saveCollaborationSocialAccount: (collaborationId: string, body: {
    platform: string; accountName?: string; externalId?: string;
    accessToken?: string; refreshToken?: string; clearToken?: boolean; notes?: string; autoPublish?: boolean;
  }) =>
    request<{ account: import('@/types').SocialAccount }>(`/api/collaborations/${collaborationId}/social-accounts`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  testCollaborationSocialAccount: (collaborationId: string, platform: string) =>
    request<{ ok: boolean; status: string; detail: string }>(`/api/collaborations/${collaborationId}/social-accounts/test`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  // -- Collaboration 範圍的行程表(目前僅 Go 生態系共用 X 帳號) --------------
  collaborationSchedule: (collaborationId: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ items: import('@/types').CollaborationScheduleItem[]; from: string; to: string }>(
      `/api/collaborations/${collaborationId}/schedule${suffix}`,
    );
  },

  retryCollaborationSchedule: (collaborationId: string, jobId: string) =>
    request<{ ok: boolean }>(`/api/collaborations/${collaborationId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ action: 'retry', jobId }),
    }),

  approveCollaborationContent: (collaborationId: string, contentId: string) =>
    request<{ ok: boolean; jobId: string }>(`/api/collaborations/${collaborationId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ action: 'approve_publish', contentId }),
    }),

  manualPublishContent: (contentId: string, body?: { externalPostUrl?: string }) =>
    request<{ ok: boolean; jobId: string }>(`/api/contents/${contentId}/manual-publish`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  apiPublishContent: (contentId: string) =>
    request<{ ok: boolean; jobId: string; permalink: string | null; postId: string }>(
      `/api/contents/${contentId}/api-publish`,
      { method: 'POST' },
    ),

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

  duplicateEvent: (id: string, body?: {
    title?: string; location?: string; eventDate?: string;
    status?: import('@/types').EventStatus;
  }) =>
    request<{ event: import('@/types').EventRecord }>(`/api/events/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  updateRegistration: (eventId: string, registrationId: string, body: Partial<{
    status: import('@/types').EventRegistrationStatus;
    name: string; phone: string; sessionId: string | null;
  }>) =>
    request<{ registration: import('@/types').EventRegistration }>(
      `/api/events/${eventId}/registrations/${registrationId}`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

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

  // -- Podcast(三小編熱門話題節目) ------------------------------------------
  podcastEpisodes: (status?: string) =>
    request<{ episodes: import('@/types').PodcastEpisode[] }>(
      `/api/podcast${status ? `?status=${status}` : ''}`,
    ),

  createPodcastEpisode: () =>
    request<{ episodeId: string; title: string; topicCount: number; lineCount: number; totalChars: number }>(
      '/api/podcast',
      { method: 'POST' },
    ),

  podcastEpisode: (id: string) =>
    request<{
      episode: import('@/types').PodcastEpisode;
      segments: import('@/types').PodcastSegment[];
      agents: import('@/types').PodcastAgentInfo[];
      progress: { total: number; completed: number };
    }>(`/api/podcast/${id}`),

  synthesizePodcastSegment: (id: string) =>
    request<{ done: boolean; completed: number; total: number; label: string | null; audioUrl: string | null }>(
      `/api/podcast/${id}/synthesize`,
      { method: 'POST' },
    ),

  reviewPodcastEpisode: (id: string, action: 'approve' | 'reject' | 'archive') =>
    request<{ id: string; status: string }>(`/api/podcast/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  // -- Podcast 訪談來賓 --------------------------------------------------------
  podcastGuests: () =>
    request<{ guests: import('@/types').PodcastGuest[] }>('/api/podcast/guests'),

  createPodcastGuest: async (params: { name: string; title: string; bio: string; audio: File }) => {
    const form = new FormData();
    form.append('name', params.name);
    form.append('title', params.title);
    form.append('bio', params.bio);
    form.append('consentConfirmed', 'true');
    form.append('audio', params.audio);
    const res = await fetch('/api/podcast/guests', { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as { guest: import('@/types').PodcastGuest };
  },

  deletePodcastGuest: (id: string) =>
    request<{ ok: boolean }>(`/api/podcast/guests/${id}`, { method: 'DELETE' }),

  createInterviewEpisode: (guestId: string) =>
    request<{ episodeId: string; title: string; topicCount: number; lineCount: number; totalChars: number }>(
      '/api/podcast/interview',
      { method: 'POST', body: JSON.stringify({ guestId }) },
    ),

  podcastTheme: () => request<{ url: string | null }>('/api/podcast/theme'),

  uploadPodcastTheme: async (file: File) => {
    const res = await fetch('/api/podcast/theme', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as { url: string };
  },

  deletePodcastTheme: () => request<{ ok: boolean }>('/api/podcast/theme', { method: 'DELETE' }),

  // -- 短影音(Podcast 切杯 / 長影片精華) ------------------------------------
  createPodcastClips: (episodeId: string, consentScribe: boolean) =>
    request<{ job: import('@/types').VideoJob }>(`/api/podcast/${episodeId}/clips`, {
      method: 'POST',
      body: JSON.stringify({ consentScribe }),
    }),

  videoJobs: (params?: { brand?: string; episodeId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.brand) qs.set('brand', params.brand);
    if (params?.episodeId) qs.set('episodeId', params.episodeId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ jobs: import('@/types').VideoJob[] }>(`/api/video-jobs${suffix}`);
  },

  videoJob: (id: string) =>
    request<{
      job: import('@/types').VideoJob;
      urls: { previewUrl: string | null; finalUrl: string | null; sourceMediaUrl: string | null };
    }>(`/api/video-jobs/${id}`),

  approveVideoStrategy: (id: string, body: {
    candidateId: string; title?: string; cta?: string; subtitleStyle?: 'large' | 'standard';
  }) =>
    request<{ job: import('@/types').VideoJob }>(`/api/video-jobs/${id}/approve-strategy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  approveVideoPreview: (id: string) =>
    request<{ job: import('@/types').VideoJob }>(`/api/video-jobs/${id}/approve-preview`, { method: 'POST' }),

  adjustVideoJob: (id: string, body: {
    action: 'retitle' | 'cta' | 'subtitle_large' | 'subtitle_standard' | 'pick_candidate';
    value?: string;
  }) =>
    request<{ job: import('@/types').VideoJob }>(`/api/video-jobs/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rejectVideoJob: (id: string, reason?: string) =>
    request<{ job: import('@/types').VideoJob }>(`/api/video-jobs/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', reason }),
    }),

  uploadVideoRender: async (id: string, kind: 'preview' | 'final', file: File) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    const res = await fetch(`/api/video-jobs/${id}/render-result`, {
      method: 'POST', credentials: 'include', body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as { job: import('@/types').VideoJob };
  },

  promoteVideoJob: (id: string, platform: 'instagram' | 'threads' | 'facebook') =>
    request<{ contentId: string; job: import('@/types').VideoJob }>(`/api/video-jobs/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  brandShorts: (slug: string) =>
    request<{ jobs: import('@/types').VideoJob[] }>(`/api/brands/${slug}/shorts`),

  uploadBrandShort: async (slug: string, params: { file: File; consentScribe: boolean }) => {
    const form = new FormData();
    form.append('file', params.file);
    form.append('consentScribe', params.consentScribe ? 'true' : 'false');
    const res = await fetch(`/api/brands/${slug}/shorts`, {
      method: 'POST', credentials: 'include', body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as { job: import('@/types').VideoJob };
  },
};

// -- 活動報名(公開端,無需登入) ----------------------------------------------
export const publicApi = {
  event: (slug: string) =>
    request<{
      event: Pick<import('@/types').EventRecord, 'id' | 'slug' | 'title' | 'description' | 'location' | 'eventDate' | 'status' | 'formFields' | 'priceLabel' | 'lineAddFriendUrl'>;
      brand: { name: string; slug: string; logoUrl?: string | null; primaryColor?: string | null; tagline?: string | null } | null;
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
