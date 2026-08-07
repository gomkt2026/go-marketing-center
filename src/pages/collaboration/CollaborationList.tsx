import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { collaborations, collaborationBriefs, brandById, proposals } from '@/mocks';

export function CollaborationList() {
  const [expanded, setExpanded] = useState<string | null>(collaborations[0]?.id ?? null);

  return (
    <div>
      <PageHeader
        title="品牌合作 Collaboration"
        subtitle="品牌之間可以合作,但不能直接共用彼此資料;AI 只能讀取 Collaboration Brief"
        actions={<Button variant="primary">+ 建立合作案</Button>}
      />

      <div style={{ display: 'grid', gap: 16 }}>
        {collaborations.map((c) => {
          const brief = collaborationBriefs.find((b) => b.collaborationId === c.id);
          const relatedProposals = proposals.filter((p) => p.collaborationId === c.id);
          const isOpen = expanded === c.id;
          return (
            <Card key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : c.id)}>
                <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {c.brandIds.map((bid) => {
                      const b = brandById(bid);
                      if (!b) return null;
                      return <Badge key={bid} tone="secondary">{b.name}</Badge>;
                    })}
                    <Badge tone={c.status === 'active' ? 'primary' : 'default'}>{c.status === 'active' ? '進行中' : '已結案'}</Badge>
                  </div>
                  <strong style={{ fontSize: 16 }}>{c.title}</strong>
                  <p style={{ fontSize: 13, marginTop: 4 }}>{c.description}</p>
                </div>
                <span style={{ color: 'var(--color-text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                  {brief && (
                    <>
                      <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                        {brief.title}(v{brief.versionNumber})— AI 唯一可讀的合作事實來源
                      </strong>
                      <pre style={{
                        background: 'var(--color-bg-soft)', borderRadius: 10, padding: 14, fontSize: 12.5,
                        whiteSpace: 'pre-wrap', lineHeight: 1.7,
                      }}
                      >
                        {brief.contentMarkdown}
                      </pre>
                    </>
                  )}
                  {relatedProposals.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ fontSize: 13 }}>相關提案</strong>
                      {relatedProposals.map((p) => (
                        <div key={p.id} style={{ fontSize: 13, padding: '6px 0' }}>▪ {p.title}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
