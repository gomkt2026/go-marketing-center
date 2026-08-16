import { useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { useMeta } from '@/context/MetaContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { LearningRecordStatus, LearningRecordType } from '@/types';

const typeLabel: Record<LearningRecordType, string> = {
  content_performance: '內容成效', cta_effectiveness: 'CTA 成效',
  audience_engagement: '受眾互動', channel_insight: '渠道洞察', other: '其他',
};

const statusLabel: Record<LearningRecordStatus, string> = {
  pending_review: '待核准', approved: '已核准', dismissed: '已駁回',
};
const statusTone: Record<LearningRecordStatus, BadgeTone> = {
  pending_review: 'accent', approved: 'primary', dismissed: 'default',
};

export function Learning() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const { agentById } = useMeta();
  const brand = slug ? brandBySlug(slug) : undefined;
  const contentsQuery = useAsyncData(() => slug ? api.contents(slug) : Promise.reject(new Error('no slug')), [slug]);
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.learning(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );
  const [status, setStatus] = useState<'approved' | 'dismissed' | 'all'>('approved');

  const records = useMemo(() => {
    const list = data?.records ?? [];
    if (status === 'all') return list;
    return list.filter((r) => (r.status ?? 'approved') === status);
  }, [data, status]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading || contentsQuery.loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const contents = contentsQuery.data?.contents ?? [];
  const counts = {
    approved: data.records.filter((r) => (r.status ?? 'approved') === 'approved').length,
    dismissed: data.records.filter((r) => r.status === 'dismissed').length,
  };

  return (
    <div>
      <PageHeader
        title={`${brand.name} 持續學習`}
        subtitle="AI 不可修改品牌定位;Brand Truth(固定)與 Marketing Learning(持續學習)分開。待核准建議請到成效分析頁處理。"
      />

      <Card style={{ marginBottom: 16, background: 'var(--color-primary-soft)', border: 'none' }}>
        <strong style={{ fontSize: 13 }}>設計原則</strong>
        <p style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text)' }}>
          以下觀察全部來自 <code>learning_records</code>,只會新增洞察,永不寫入 <code>brands</code> / <code>brand_versions</code>。生成 AI 只會引用已核准的心得。
        </p>
      </Card>

      <Tabs
        tabs={[
          { id: 'approved', label: `已核准 ${counts.approved}` },
          { id: 'dismissed', label: `已駁回 ${counts.dismissed}` },
          { id: 'all', label: `全部 ${data.records.length}` },
        ]}
        active={status}
        onChange={(id) => setStatus(id as typeof status)}
      />

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {records.map((r) => {
          const content = contents.find((c) => c.id === r.relatedContentId);
          const agent = agentById(r.generatedByAgentId);
          const more = r.supportingData?.doMore ?? r.supportingData?.do_more ?? [];
          const less = r.supportingData?.doLess ?? r.supportingData?.do_less ?? [];
          return (
            <Card key={r.id}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <Badge tone="secondary">{typeLabel[r.recordType]}</Badge>
                <Badge tone={statusTone[r.status ?? 'approved']}>{statusLabel[r.status ?? 'approved']}</Badge>
              </div>
              <p style={{ fontSize: 14 }}>{r.insight}</p>
              {(more.length > 0 || less.length > 0) && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  {more.length ? `多做:${more.join('、')} ` : ''}
                  {less.length ? `少做:${less.join('、')}` : ''}
                </p>
              )}
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                {agent?.displayName && `由 ${agent.displayName} 分析`}
                {content && ` · 關聯內容:${content.title}`}
                {' · '}{new Date(r.createdAt).toLocaleDateString('zh-TW')}
              </div>
            </Card>
          );
        })}
        {records.length === 0 && <Card><p>這個篩選沒有學習紀錄</p></Card>}
      </div>
    </div>
  );
}
