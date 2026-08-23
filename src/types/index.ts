// 對應 db/schema.sql 的 TypeScript 型別定義(V1 前端骨架用,未來直接替換為 API 回傳型別)

export type UserRole = 'super_admin' | 'brand_manager' | 'brand_editor' | 'viewer';

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  brandIds?: string[];
  brandSlugs?: string[];
  username?: string | null;
  hasPassword?: boolean;
  isActive?: boolean;
}

export type BrandVersionStatus = 'draft' | 'published' | 'archived';

export interface Brand {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  primaryColor: string;
  logoInitial: string;
  logoUrl: string | null;
  currentVersionId: string;
  versionNumber?: number | null;
}

export interface BrandVersion {
  id: string;
  brandId: string;
  versionNumber: number;
  status: BrandVersionStatus;
  summaryOfChanges: string;
  confidenceScore: number;
  publishedBy?: string;
  publishedAt?: string;
}

export type VerificationStatus = 'verified' | 'claimed' | 'pending';
export type BrandRuleType = 'can_claim' | 'cannot_claim' | 'marketing_rule' | 'negative_rule';

export interface BrandRule {
  id: string;
  brandId: string;
  ruleType: BrandRuleType;
  statement: string;
  conditionNote?: string;
  verification: VerificationStatus;
  validUntil?: string;
}

export interface BrandAudience {
  id: string;
  brandId: string;
  name: string;
  painPoints: string[];
  appealAngle: string;
}

export interface BrandPersona {
  id: string;
  brandId: string;
  code: string;
  name: string;
  ageRange?: string;
  profile?: string;
  painPoints: string[];
  appealAngle: string;
}

export type PublishingPlatform =
  | 'instagram' | 'facebook' | 'threads' | 'line_oa'
  | 'tiktok' | 'youtube' | 'linkedin' | 'x' | 'edm';

export interface BrandChannel {
  id: string;
  brandId: string;
  platform: PublishingPlatform;
  toneOfVoice: string;
  lengthGuideline: string;
  formatGuideline: string;
  hashtagCountMin: number;
  hashtagCountMax: number;
}

export interface BrandKeyword {
  id: string;
  brandId: string;
  category: 'hashtag' | 'cta' | 'key_message';
  value: string;
}

export interface BrandVisual {
  id: string;
  brandId: string;
  label: string;
  value: string;
  category: 'color' | 'layout' | 'typography';
}

export interface BrandHistory {
  id: string;
  brandId: string;
  happenedOn: string;
  title: string;
  description: string;
}

export interface BrandExample {
  id: string;
  brandId: string;
  category: 'content_pillar' | 'storytelling' | 'hot_topic_bank' | 'competitor';
  title: string;
  body: string;
  weightPercent?: number;
}

export interface BrandDocument {
  id: string;
  brandId: string;
  sourceType: string;
  title: string;
  fileUrl: string;
}

export type BrandAssetImageCategory =
  | 'system_screenshot' | 'real_photo' | 'people' | 'scene'
  | 'brand_collab' | 'press_clipping' | 'other';

export type PressCoverageStatus = 'inbox' | 'published' | 'syndicated' | 'dismissed';
export type PressDiscoverySource = 'manual' | 'scheduler';
export type PressReleaseStatus = 'draft' | 'pending_review' | 'approved' | 'final';

export interface ParsedPressCoverage {
  articleUrl: string;
  canonicalUrl: string;
  outlet: string;
  headline: string;
  publishedOn: string | null;
  summary: string;
  keyQuotes: string[];
  claimableFacts: string[];
  storyKey: string;
  fetched: boolean;
  parseNotes: string[];
}

export interface DiscoveredPressItem {
  title: string;
  url: string | null;
  snippet: string | null;
  outletGuess: string;
  kind: 'own_coverage' | 'industry_news' | 'noise' | 'unknown';
  alreadySaved: boolean;
}

export interface PressCoverage {
  id: string;
  brandId: string;
  pressReleaseId?: string | null;
  storyKey: string;
  outlet: string;
  headline: string;
  articleUrl: string | null;
  publishedOn: string | null;
  status: PressCoverageStatus;
  discoverySource: PressDiscoverySource;
  summary: string | null;
  keyQuotes: string[];
  claimableFacts: string[];
  isPrimary: boolean;
  relatedBrandSlugs: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PressRelease {
  id: string;
  brandId: string;
  title: string;
  body: string;
  status: PressReleaseStatus;
  embargoOn: string | null;
  reviewNote: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandAsset {
  id: string;
  brandId: string;
  assetType: string;
  name: string;
  fileUrl: string | null;
  imageCategory: BrandAssetImageCategory | null;
  caption: string | null;
  usedInThreadsCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export type MarketSignalType =
  | 'news' | 'policy' | 'current_event' | 'trending_topic'
  | 'industry_trend' | 'social_content' | 'evergreen';
export type MarketSignalStatus = 'new' | 'discussed' | 'used' | 'dismissed';

export interface MarketSignal {
  id: string;
  brandId: string;
  signalType: MarketSignalType;
  title: string;
  summary: string;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  autoGenerated?: boolean;
  relevanceScore: number;
  status: MarketSignalStatus;
  discoveredByAgentId: string;
  discoveredAt: string;
}

/** 即時熱門看板的項目(來自精選情報或即時抓取) */
export interface TrendingItem {
  title: string;
  url: string | null;
  source: string;
  summary: string | null;
  brandSlug: string | null;
  brandName: string | null;
  relevance: number | null;
  signalId: string | null;
  discoveredAt: string | null;
}

export type AgentRoleCode =
  | 'brand_ai' | 'market_analyst' | 'content_strategist'
  | 'risk_advisor' | 'devils_advocate' | 'moderator';

export interface AIAgent {
  id: string;
  brandId: string | null;
  roleCode: AgentRoleCode;
  displayName: string;
  avatarColor: string;
}

/** 品牌小編人設(存於 ai_agents.persona JSONB) */
export interface AgentPersona {
  nickname?: string;
  characterTitle?: string;
  avatarUrl?: string | null;
  temperament?: string;
  catchphrase?: string;
  focus?: string;
}

/** /api/agents 回傳的 Agent(含人設與品牌) */
export interface AgentWithPersona {
  id: string;
  displayName: string;
  roleCode: AgentRoleCode;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  persona: AgentPersona;
}

export interface Collaboration {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'closed';
  brandIds: string[];
}

export interface CollaborationBrief {
  id: string;
  collaborationId: string;
  title: string;
  contentMarkdown: string;
  versionNumber: number;
}

export type MeetingStatus = 'scheduled' | 'in_progress' | 'concluded' | 'archived';

export interface Meeting {
  id: string;
  brandId?: string;
  collaborationId?: string;
  title: string;
  topic: string;
  status: MeetingStatus;
  mode?: 'standard' | 'live_editors';
  metadata?: { postPlan?: MeetingPostPlanItem[]; planExecuted?: boolean } & Record<string, unknown>;
  participantAgentIds: string[];
  participantUserIds: string[];
  createdAt: string;
}

export interface MeetingMessage {
  id: string;
  meetingId: string;
  senderType: 'user' | 'ai_agent';
  senderAgentId?: string;
  senderUserId?: string;
  content: string;
  metadata?: { emotion?: string; interrupted?: boolean } & Record<string, unknown>;
  createdAt: string;
}

/** 會議結論的發文計畫項目 */
export interface MeetingPostPlanItem {
  brandSlug: string;
  platform: 'facebook' | 'instagram' | 'threads';
  topic: string;
  angle: string;
}

export interface MeetingSummary {
  meetingId: string;
  summaryMarkdown: string;
  generatedByAgentId: string;
}

export type ProposalStatus = 'pending_decision' | 'approved' | 'rejected' | 'needs_revision' | 'withdrawn';

export interface ProposalOption {
  id: string;
  proposalId: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedCost?: number;
  brandFitScore: number;
  estimatedImpact: Record<string, string>;
}

export interface Proposal {
  id: string;
  brandId?: string;
  collaborationId?: string;
  meetingId?: string;
  title: string;
  status: ProposalStatus;
  proposedByAgentId: string;
  createdAt: string;
  options: ProposalOption[];
}

export type DecisionAction = 'approve' | 'modify_approve' | 'reject' | 'return_for_discussion' | 'defer';

export interface Decision {
  id: string;
  proposalId: string;
  chosenOptionId?: string;
  action: DecisionAction;
  decidedBy: string;
  note: string;
  decidedAt: string;
}

export type CampaignStatus = 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  primaryBrandId: string;
  brandIds: string[];
  collaborationId?: string;
  decisionId?: string;
  title: string;
  objective?: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
}

export type ContentType = 'article' | 'image' | 'video' | 'video_prompt' | 'video_script' | 'edm' | 'live_stream_plan';
export type ContentStatus =
  | 'draft' | 'pending_review' | 'approved' | 'needs_revision'
  | 'rejected' | 'scheduled' | 'published' | 'archived';

export interface ContentAsset {
  id: string;
  contentVersionId: string;
  assetType: 'logo' | 'image' | 'video' | 'document' | 'color_palette' | 'font';
  fileUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  versionNumber: number;
  body: string;
  hashtags: string[];
  cta: string;
  seoMeta?: {
    title?: string;
    description?: string;
    keywords?: string[];
    slug?: string;
    canonicalHint?: string;
  } | null;
  createdAt: string;
  assets?: ContentAsset[];
}

export interface ContentReviewAction {
  id: string;
  contentId: string;
  contentVersionId: string;
  reviewerId: string;
  action: 'approve' | 'modify' | 'return' | 'regenerate' | 'postpone' | 'reject';
  comment: string;
  reviewedAt: string;
}

export interface Content {
  id: string;
  campaignId: string | null;
  brandId: string;
  brandVersionId: string;
  contentType: ContentType;
  targetPlatform: PublishingPlatform | null;
  title: string;
  status: ContentStatus;
  generatedByAgentId: string;
  predictedEngagementScore?: number | null;
  engagementAnalysis?: string | null;
  sourceMarketSignalId?: string | null;
  versions: ContentVersion[];
  reviews: ContentReviewAction[];
}

export type SocialAccountStatus = 'disconnected' | 'manual' | 'connected' | 'error';

export interface SocialAccount {
  id: string;
  brandId?: string | null;
  /** collaboration 範圍的帳號(如 Go 生態系共用 X 帳號)才會有值,與 brandId 二者恰有一個非 null */
  collaborationId?: string | null;
  platform: PublishingPlatform;
  accountName?: string | null;
  externalId?: string | null;
  status: SocialAccountStatus;
  notes?: string | null;
  autoPublish?: boolean;
  autoReply?: boolean;
  replyDailyCap?: number;
  connectedAt?: string | null;
  hasToken?: boolean;
  tokenMasked?: string | null;
  tokenExpiresAt?: string | null;
  /** X(Twitter) OAuth2 才需要:是否已存有 refresh token */
  hasRefreshToken?: boolean;
}

export type ThreadsReplyStatus = 'pending' | 'approved' | 'replied' | 'skipped' | 'failed';

/** Threads 熱門貼文回覆佇列項目 */
export interface ThreadsReplyTarget {
  id: string;
  brandId: string;
  targetPostId: string;
  targetPermalink?: string | null;
  targetUsername?: string | null;
  targetText?: string | null;
  targetTimestamp?: string | null;
  sourceKeyword: string;
  relevanceScore?: number | null;
  relevanceReason?: string | null;
  replyText?: string | null;
  status: ThreadsReplyStatus;
  replyPostId?: string | null;
  replyPermalink?: string | null;
  repliedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export type PublishingJobStatus = 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

/** 發布管理頁:各平台待發布佇列項目 */
export interface PublishingQueueItem {
  id: string;
  title: string;
  status: ContentStatus;
  targetPlatform: PublishingPlatform;
  predictedEngagementScore?: number | null;
  genSource?: string | null;
  createdAt: string;
  body?: string | null;
  hashtags?: string[] | null;
  imageUrl?: string | null;
}

export interface PublishingJob {
  id: string;
  contentId: string;
  contentVersionId: string;
  platform: PublishingPlatform;
  status: PublishingJobStatus;
  scheduledAt?: string;
  publishedAt?: string;
  publishedBy?: string;
  externalPostId?: string | null;
}

/** 行程表頁面:排程/發布狀態項目(讀取 publishing_jobs,依 scheduled_at 排序) */
export interface ScheduleItem {
  id: string;
  contentId: string;
  contentVersionId: string;
  platform: PublishingPlatform;
  status: PublishingJobStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  externalPostId?: string | null;
  createdAt: string;
  title?: string | null;
  contentStatus?: ContentStatus;
  genSource?: string | null;
  genCategory?: string | null;
  body?: string | null;
  hashtags?: string[] | null;
  imageUrl?: string | null;
  lastLogDetail?: string | null;
}

/**
 * Collaboration 範圍的行程表項目(目前只有 Go 生態系共用 X 帳號會用到)。
 * 跟 ScheduleItem 的差異:以 contents 為主表,jobId/status 可能是 null
 * (auto_publish 關閉時 pending_review 的內容還沒有 publishing_jobs,但仍要能在行程表看到)。
 */
export interface CollaborationScheduleItem {
  contentId: string;
  title?: string | null;
  contentStatus: ContentStatus;
  platform: PublishingPlatform;
  jobId?: string | null;
  jobStatus?: PublishingJobStatus | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  externalPostId?: string | null;
  contentCreatedAt: string;
  genSource?: string | null;
  genCategory?: string | null;
  body?: string | null;
  hashtags?: string[] | null;
  imageUrl?: string | null;
  lastLogDetail?: string | null;
}

export interface PerformanceReport {
  id: string;
  publishingJobId: string;
  impressions: number;
  clicks: number;
  comments: number;
  shares: number;
  saves: number;
  likes?: number;
  engagementRate: number;
  capturedAt: string;
  rawMetrics?: Record<string, unknown>;
}

export type LearningRecordType = 'content_performance' | 'cta_effectiveness' | 'audience_engagement' | 'channel_insight' | 'other';
export type LearningRecordStatus = 'pending_review' | 'approved' | 'dismissed';

export interface LearningSupportingData {
  source?: string;
  doMore?: string[];
  doLess?: string[];
  winningHooks?: string[];
  weakCta?: string[];
  platform?: string;
  genSource?: string;
  do_more?: string[];
  do_less?: string[];
  winning_hooks?: string[];
  weak_cta?: string[];
  gen_source?: string;
}

export interface LearningRecord {
  id: string;
  brandId: string;
  recordType: LearningRecordType;
  insight: string;
  supportingData?: LearningSupportingData;
  relatedContentId?: string;
  generatedByAgentId: string;
  status?: LearningRecordStatus;
  createdAt: string;
}

export interface AnalyticsPost {
  job: {
    id: string;
    platform: string;
    publishedAt: string | null;
    externalPostId: string | null;
  };
  content: {
    id: string;
    title: string | null;
    genSource: string | null;
    predictedScore: number | null;
    body: string | null;
    cta: string | null;
  };
  perf: PerformanceReport | null;
}

export interface AnalyticsPayload {
  posts: AnalyticsPost[];
  suggestions: LearningRecord[];
  totals: { impressions: number; clicks: number; comments: number; shares: number; saves: number; likes: number };
  publishedCount: number;
  syncedCount: number;
}

// ============================================================================
// Events(活動報名與報到)
// ============================================================================

export type EventStatus = 'draft' | 'open' | 'closed' | 'completed';
export type EventRegistrationStatus = 'registered' | 'cancelled';
export type EventReferrerCommissionType = 'percentage' | 'fixed';
export type EventFormFieldType = 'text' | 'number' | 'select' | 'textarea' | 'checkbox';

export interface EventFormField {
  key: string;
  label: string;
  type: EventFormFieldType;
  required?: boolean;
  options?: string[];
}

export interface EventEdmImage {
  id: string;
  label: string;
  url: string;
}

export interface EventRecord {
  id: string;
  brandId: string;
  campaignId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null;
  status: EventStatus;
  staffToken: string;
  formFields: EventFormField[];
  price?: number | null;
  priceLabel?: string | null;
  lineAddFriendUrl?: string | null;
  edmImages?: EventEdmImage[];
  createdAt: string;
  updatedAt: string;
  registrationCount?: number;
  checkedInCount?: number;
}

export interface EventSession {
  id: string;
  eventId: string;
  label: string;
  startsAt?: string | null;
  capacity?: number | null;
  sortOrder: number;
  registeredCount?: number;
  remaining?: number | null;
}

export interface EventReferrer {
  id: string;
  eventId: string;
  name: string;
  commissionType: EventReferrerCommissionType;
  commissionValue: number;
  isActive: boolean;
  sortOrder: number;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  sessionId?: string | null;
  sessionLabel?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  lineId?: string | null;
  referrerId?: string | null;
  referrerName?: string | null;
  referrerDisplayName?: string | null;
  customAnswers: Record<string, unknown>;
  qrToken: string;
  status: EventRegistrationStatus;
  source: 'web' | 'manual';
  checkedInAt?: string | null;
  createdAt: string;
}

export interface EventReferrerStat {
  referrerId: string | null;
  name: string;
  commissionType: EventReferrerCommissionType | null;
  commissionValue: number | null;
  isActive: boolean | null;
  registrationCount: number;
  checkedInCount: number;
  commissionAmount: number | null;
}

export interface EventStats {
  totalRegistrations: number;
  totalCheckedIn: number;
  checkInRate: number;
  sessions: { id: string; label: string; registeredCount: number; checkedInCount: number }[];
  referrers: EventReferrerStat[];
}

export interface ActivityLog {
  id: string;
  brandId?: string;
  collaborationId?: string;
  actorType: 'user' | 'ai_agent';
  actorUserId?: string;
  actorAgentId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
}

// ============================================================================
// Podcast(三小編熱門話題節目)
// ============================================================================

export type PodcastEpisodeStatus =
  | 'script_draft' | 'audio_generating' | 'ready_for_review'
  | 'approved' | 'rejected' | 'archived';

export interface PodcastScriptLine {
  order: number;
  segmentLabel: string;
  agentId: string;
  nickname: string;
  text: string;
  emotion: string;
}

export type PodcastEpisodeType = 'regular' | 'interview';

export interface PodcastEpisode {
  id: string;
  weekOf: string;
  episodeSeq: number;
  title: string | null;
  topicSummary: string | null;
  status: PodcastEpisodeStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  episodeType?: PodcastEpisodeType;
  guestId?: string | null;
  guestName?: string | null;
  lineCount?: number;
  segmentsReady?: number;
  sourceSignalIds?: string[];
  script?: PodcastScriptLine[];
}

export interface PodcastSegment {
  id: string;
  segmentOrder: number;
  label: string;
  lines: PodcastScriptLine[];
  audioUrl: string | null;
  charCount: number | null;
  createdAt: string;
}

export interface PodcastAgentInfo {
  id: string;
  displayName: string;
  avatarColor: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  characterTitle: string | null;
  brandSlug: string;
  brandName: string;
}

export type VideoSourceType = 'podcast_clip' | 'upload';
export type VideoJobStatus =
  | 'analyzing' | 'strategy_review' | 'rendering_preview'
  | 'preview_review' | 'rendering_final' | 'ready' | 'rejected';

export interface VideoClipCandidate {
  id: string;
  hook: string;
  title: string;
  summary: string;
  strategy: string;
  estimatedSeconds: number;
  startLineOrder: number;
  endLineOrder: number;
  speakers: string[];
  cta: string;
  brandSlug: string | null;
}

export interface VideoStrategy {
  candidateId: string;
  title: string;
  hook: string;
  narrative: string;
  estimatedSeconds: number;
  subtitleStyle: 'large' | 'standard';
  cta: string;
  brandSlug: string | null;
}

export interface VideoEdlChunkLine {
  order: number;
  text: string;
}

export interface VideoEdlSegment {
  id: string;
  sourceKey: string | null;
  sourceUrl: string | null;
  startMs: number;
  endMs: number;
  speaker: string;
  brandSlug: string | null;
  text: string;
  fadeInMs: number;
  fadeOutMs: number;
  chunkLines?: VideoEdlChunkLine[];
}

export interface VideoJob {
  id: string;
  sourceType: VideoSourceType;
  status: VideoJobStatus;
  brandId: string | null;
  podcastEpisodeId: string | null;
  contentId: string | null;
  title: string | null;
  sourceMediaKey: string | null;
  sourceMediaUrl: string | null;
  consentScribe: boolean;
  candidates: VideoClipCandidate[];
  selectedCandidateId: string | null;
  strategy: VideoStrategy | null;
  edl: VideoEdlSegment[] | null;
  srt: string | null;
  previewUrl: string | null;
  finalUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  episodeTitle?: string | null;
  brandSlug?: string | null;
}

export type PodcastGuestStatus = 'pending' | 'cloning' | 'ready' | 'failed';

/** 訪談來賓(聲音已 Clone 到 ElevenLabs) */
export interface PodcastGuest {
  id: string;
  name: string;
  title: string | null;
  bio: string;
  voiceId: string | null;
  status: PodcastGuestStatus;
  errorMessage: string | null;
  consentConfirmedAt: string;
  createdAt: string;
}
