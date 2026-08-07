import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { brandBySlug, contentsByBrand, jobByContent, userName } from '@/mocks';
import type { PublishingJobStatus } from '@/types';

const statusTone: Record<PublishingJobStatus, BadgeTone> = {
  queued: 'default', scheduled: 'accent', publishing: 'accent', published: 'primary', failed: 'danger', cancelled: 'default',
};
const statusLabel: Record<PublishingJobStatus, string> = {
  queued: '排隊中', scheduled: '已排程', publishing: '發布中', published: '已發布', failed: '失敗', cancelled: '已取消',
};
const platformLabel: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', line_oa: 'LINE OA',
  tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', edm: 'EDM',
};

export function Publishing() {
  const { brand: slug } = useParams();
  const brand = slug ? brandBySlug(slug) : undefined;
  if (!brand) return <Navigate to="/" replace />;
  const contents = contentsByBrand(brand.id);
  const jobs = contents.map((c) => ({ content: c, job: jobByContent(c.id) })).filter((x) => x.job);

  return (
    <div>
      <PageHeader title={`${brand.name} 發布管理`} subtitle="發布必須保留時間、平台、版本、發布人" />
      <div style={{ display: 'grid', gap: 12 }}>
        {jobs.map(({ content, job }) => job && (
          <Card key={job.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Badge tone="secondary">{platformLabel[job.platform]}</Badge>
                  <Badge tone={statusTone[job.status]}>{statusLabel[job.status]}</Badge>
                </div>
                <strong style={{ fontSize: 15 }}>{content.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  {job.publishedAt ? `發布於 ${new Date(job.publishedAt).toLocaleString('zh-TW')}` : job.scheduledAt ? `排程於 ${new Date(job.scheduledAt).toLocaleString('zh-TW')}` : ''}
                  {job.publishedBy && ` · 發布人:${userName(job.publishedBy)}`}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {jobs.length === 0 && <Card><p>尚無發布紀錄</p></Card>}
      </div>
    </div>
  );
}
