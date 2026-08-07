import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { brandBySlug, learningByBrand, contents, agentById } from '@/mocks';

const typeLabel: Record<string, string> = {
  content_performance: '內容成效', cta_effectiveness: 'CTA 成效',
  audience_engagement: '受眾互動', channel_insight: '渠道洞察', other: '其他',
};

export function Learning() {
  const { brand: slug } = useParams();
  const brand = slug ? brandBySlug(slug) : undefined;
  if (!brand) return <Navigate to="/" replace />;
  const records = learningByBrand(brand.id);

  return (
    <div>
      <PageHeader
        title={`${brand.name} 持續學習`}
        subtitle="AI 不可修改品牌定位;Brand Truth(固定)與 Marketing Learning(持續學習)分開"
      />

      <Card style={{ marginBottom: 16, background: 'var(--color-primary-soft)', border: 'none' }}>
        <strong style={{ fontSize: 13 }}>設計原則</strong>
        <p style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text)' }}>
          以下觀察全部來自 <code>learning_records</code>,只會新增洞察,永不寫入 <code>brands</code> / <code>brand_versions</code>。
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 12 }}>
        {records.map((r) => {
          const content = contents.find((c) => c.id === r.relatedContentId);
          const agent = agentById(r.generatedByAgentId);
          return (
            <Card key={r.id}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <Badge tone="secondary">{typeLabel[r.recordType]}</Badge>
              </div>
              <p style={{ fontSize: 14, color: 'var(--color-text)' }}>{r.insight}</p>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                由 {agent?.displayName} 產出{content && ` · 依據內容:${content.title}`}
              </div>
            </Card>
          );
        })}
        {records.length === 0 && <Card><p>尚無學習觀察紀錄</p></Card>}
      </div>
    </div>
  );
}
