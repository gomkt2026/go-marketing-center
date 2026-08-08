import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { useBrand } from '@/context/BrandContext';
import { useMeta } from '@/context/MetaContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { PublishingJobStatus, ContentStatus } from '@/types';

const statusTone: Record<PublishingJobStatus, BadgeTone> = {
  queued: 'default', scheduled: 'accent', publishing: 'accent', published: 'primary', failed: 'danger', cancelled: 'default',
};
const statusLabel: Record<PublishingJobStatus, string> = {
  queued: '排隊中', scheduled: '已排程', publishing: '發布中', published: '已發布', failed: '失敗', cancelled: '已取消',
};
const contentStatusLabel: Partial<Record<ContentStatus, string>> = {
  draft: '草稿', pending_review: '待審閱', approved: '已批准', needs_revision: '修改中', scheduled: '已排程',
};
const contentStatusTone: Partial<Record<ContentStatus, BadgeTone>> = {
  draft: 'default', pending_review: 'accent', approved: 'primary', needs_revision: 'danger', scheduled: 'accent',
};
const genSourceLabel: Record<string, string> = {
  threads_30min: '30分熱議', threads_hourly: '熱議跟風', daily_theme: '每日主題',
  auto_signal: '情報自動', market_signal: '市場情報', meeting_plan: '會議計畫',
};

const PLATFORM_COLUMNS: { id: 'facebook' | 'instagram' | 'threads'; label: string; note: string }[] = [
  { id: 'facebook', label: 'Facebook', note: '每日 1-2 主題故事文,人工審核後發布' },
  { id: 'instagram', label: 'Instagram', note: '與 FB 共用每日主題,搭配 AI 生成配圖' },
  { id: 'threads', label: 'Threads', note: '每 30 分鐘熱門議題貼文;連接 API 後可自動發布' },
];

export function Publishing() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const { userName } = useMeta();
  const brand = slug ? brandBySlug(slug) : undefined;
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.publishing(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const queue = data.queue ?? [];

  return (
    <div>
      <PageHeader
        title={`${brand.name} 發布管理`}
        subtitle="FB / IG / Threads 三平台獨立佇列;發布保留時間、平台、版本、發布人"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        {PLATFORM_COLUMNS.map((col) => {
          const colQueue = queue.filter((q) => q.targetPlatform === col.id);
          const colJobs = data.jobs.filter((j) => (j.targetPlatform ?? j.platform) === col.id).slice(0, 10);
          return (
            <div key={col.id} style={{ display: 'grid', gap: 10 }}>
              <Card style={{ background: 'var(--color-bg-soft)' }}>
                <strong style={{ fontSize: 15 }}>{col.label}</strong>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{col.note}</p>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  待處理 {colQueue.length} · 近期發布 {colJobs.filter((j) => j.status === 'published').length}
                </div>
              </Card>

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>待發布佇列</div>
                {colQueue.length === 0 && (
                  <Card><p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>目前沒有待發布內容</p></Card>
                )}
                {colQueue.slice(0, 12).map((item) => (
                  <Card key={item.id}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Badge tone={contentStatusTone[item.status] ?? 'default'}>{contentStatusLabel[item.status] ?? item.status}</Badge>
                      {item.genSource && <Badge tone="secondary">{genSourceLabel[item.genSource] ?? item.genSource}</Badge>}
                      {item.predictedEngagementScore != null && (
                        <Badge tone={Number(item.predictedEngagementScore) >= 70 ? 'primary' : 'default'}>
                          互動 {Math.round(Number(item.predictedEngagementScore))}
                        </Badge>
                      )}
                    </div>
                    <Link to={`/${slug}/contents`} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>
                      {item.title}
                    </Link>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {new Date(item.createdAt).toLocaleString('zh-TW')}
                    </div>
                  </Card>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>發布紀錄</div>
                {colJobs.length === 0 && (
                  <Card><p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>尚無發布紀錄</p></Card>
                )}
                {colJobs.map((job) => (
                  <Card key={job.id}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <Badge tone={statusTone[job.status]}>{statusLabel[job.status]}</Badge>
                    </div>
                    <strong style={{ fontSize: 13.5 }}>{job.contentTitle ?? job.contentId}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {job.publishedAt ? `發布於 ${new Date(job.publishedAt).toLocaleString('zh-TW')}` : job.scheduledAt ? `排程於 ${new Date(job.scheduledAt).toLocaleString('zh-TW')}` : ''}
                      {job.publishedBy ? ` · 發布人:${userName(job.publishedBy)}` : job.publishedAt ? ' · 排程自動發布' : ''}
                    </div>
                    {job.externalPostId && (
                      <div style={{ fontSize: 11.5, marginTop: 4 }}>
                        {job.externalPostId.startsWith('http')
                          ? <a href={job.externalPostId} target="_blank" rel="noreferrer">查看貼文 ↗</a>
                          : `貼文 ID:${job.externalPostId}`}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
