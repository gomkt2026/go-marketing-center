import type { PublishingJob, PerformanceReport, LearningRecord } from '@/types';
import { daysAgo } from './brands';

export const publishingJobs: PublishingJob[] = [
  { id: 'job-homigo-1', contentId: 'content-homigo-1', contentVersionId: 'cv-homigo-1-2', platform: 'instagram', status: 'published', scheduledAt: daysAgo(5), publishedAt: daysAgo(5), publishedBy: 'u-homigo-mgr' },
  { id: 'job-taskgo-1', contentId: 'content-taskgo-1', contentVersionId: 'cv-taskgo-1-1', platform: 'threads', status: 'published', scheduledAt: daysAgo(11), publishedAt: daysAgo(11), publishedBy: 'u-taskgo-mgr' },
];

export const performanceReports: PerformanceReport[] = [
  { id: 'perf-1', publishingJobId: 'job-homigo-1', impressions: 18500, clicks: 620, comments: 34, shares: 58, saves: 112, engagementRate: 0.0442, capturedAt: daysAgo(2) },
  { id: 'perf-2', publishingJobId: 'job-taskgo-1', impressions: 42300, clicks: 980, comments: 156, shares: 210, saves: 88, engagementRate: 0.0562, capturedAt: daysAgo(9) },
];

export const learningRecords: LearningRecord[] = [
  { id: 'learn-1', brandId: 'b-homigo', recordType: 'content_performance', insight: '報修場景類圖文的收藏率明顯高於平均,建議提高此類內容佔比', relatedContentId: 'content-homigo-1', generatedByAgentId: 'agent-content', createdAt: daysAgo(2) },
  { id: 'learn-2', brandId: 'b-taskgo', recordType: 'audience_engagement', insight: '產業趨勢蹭熱度型貼文在Threads的留言互動率最高,建議維持每週至少一篇', relatedContentId: 'content-taskgo-1', generatedByAgentId: 'agent-market', createdAt: daysAgo(9) },
];

export function jobByContent(contentId: string): PublishingJob | undefined {
  return publishingJobs.find((j) => j.contentId === contentId);
}

export function performanceByJob(jobId: string): PerformanceReport | undefined {
  return performanceReports.find((p) => p.publishingJobId === jobId);
}

export function learningByBrand(brandId: string): LearningRecord[] {
  return learningRecords.filter((l) => l.brandId === brandId);
}
