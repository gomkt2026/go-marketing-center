import type { ActivityLog } from '@/types';
import { daysAgo } from './brands';

function minutesAfter(iso: string, min: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + min);
  return d.toISOString();
}

export const activityLogs: ActivityLog[] = [
  { id: 'act-1', brandId: 'b-homigo', actorType: 'ai_agent', actorAgentId: 'agent-market', action: 'market_signal.discovered', entityType: 'market_signal', entityId: 'ms-rent-policy', createdAt: minutesAfter(daysAgo(10), -10) },
  { id: 'act-2', brandId: 'b-homigo', actorType: 'ai_agent', actorAgentId: 'agent-moderator', action: 'proposal.created', entityType: 'proposal', entityId: 'proposal-homigo-1', createdAt: daysAgo(9) },
  { id: 'act-3', brandId: 'b-homigo', actorType: 'user', actorUserId: 'u-homigo-mgr', action: 'decision.approved', entityType: 'proposal', entityId: 'proposal-homigo-1', createdAt: minutesAfter(daysAgo(9), 120) },
  { id: 'act-4', brandId: 'b-homigo', actorType: 'user', actorUserId: 'u-homigo-mgr', action: 'content.reviewed', entityType: 'content', entityId: 'content-homigo-1', createdAt: minutesAfter(daysAgo(6), 30) },
  { id: 'act-5', brandId: 'b-homigo', actorType: 'user', actorUserId: 'u-homigo-mgr', action: 'content.approved', entityType: 'content', entityId: 'content-homigo-1', createdAt: daysAgo(5) },
  { id: 'act-6', brandId: 'b-homigo', actorType: 'user', actorUserId: 'u-homigo-mgr', action: 'publishing.published', entityType: 'publishing_job', entityId: 'job-homigo-1', createdAt: daysAgo(5) },
  { id: 'act-7', brandId: 'b-taskgo', actorType: 'ai_agent', actorAgentId: 'agent-market', action: 'proposal.created', entityType: 'proposal', entityId: 'proposal-taskgo-1', createdAt: daysAgo(13) },
  { id: 'act-8', brandId: 'b-taskgo', actorType: 'user', actorUserId: 'u-taskgo-mgr', action: 'decision.approved', entityType: 'proposal', entityId: 'proposal-taskgo-1', createdAt: minutesAfter(daysAgo(13), 60) },
  { id: 'act-9', brandId: 'b-taskgo', actorType: 'user', actorUserId: 'u-taskgo-mgr', action: 'publishing.published', entityType: 'publishing_job', entityId: 'job-taskgo-1', createdAt: daysAgo(11) },
  { id: 'act-10', brandId: 'b-washgo', actorType: 'ai_agent', actorAgentId: 'agent-content', action: 'content.generated', entityType: 'content', entityId: 'content-washgo-1', createdAt: daysAgo(1) },
  { id: 'act-11', collaborationId: 'collab-1', actorType: 'ai_agent', actorAgentId: 'agent-moderator', action: 'proposal.created', entityType: 'proposal', entityId: 'proposal-collab-1', createdAt: minutesAfter(daysAgo(1), 120) },
  { id: 'act-12', brandId: 'b-homigo', actorType: 'user', actorUserId: 'u-homigo-mgr', action: 'brand_version.published', entityType: 'brand_version', entityId: 'v-homigo-1', createdAt: daysAgo(20) },
  { id: 'act-13', brandId: 'b-taskgo', actorType: 'user', actorUserId: 'u-taskgo-mgr', action: 'brand_version.published', entityType: 'brand_version', entityId: 'v-taskgo-1', createdAt: daysAgo(18) },
  { id: 'act-14', brandId: 'b-washgo', actorType: 'user', actorUserId: 'u-washgo-mgr', action: 'brand_version.published', entityType: 'brand_version', entityId: 'v-washgo-1', createdAt: daysAgo(15) },
];

export const actionLabels: Record<string, string> = {
  'market_signal.discovered': '發現市場情報',
  'proposal.created': '建立提案',
  'decision.approved': '批准決策',
  'content.reviewed': '審閱內容(要求修改)',
  'content.approved': '核准內容',
  'content.generated': '生成內容草稿',
  'publishing.published': '發布內容',
  'brand_version.published': '發布品牌版本',
};

export function sortedActivity(): ActivityLog[] {
  return [...activityLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
