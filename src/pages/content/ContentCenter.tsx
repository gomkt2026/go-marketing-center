import { useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { brandBySlug, contentsByBrand, latestVersion } from '@/mocks';
import type { Content, ContentStatus } from '@/types';

const statusTone: Record<ContentStatus, BadgeTone> = {
  draft: 'default', pending_review: 'accent', approved: 'primary', needs_revision: 'secondary',
  rejected: 'danger', scheduled: 'primary', published: 'primary', archived: 'default',
};
const statusLabel: Record<ContentStatus, string> = {
  draft: '草稿', pending_review: '待審閱', approved: '已批准', needs_revision: '修改中',
  rejected: '已退回', scheduled: '排程中', published: '已發布', archived: '已封存',
};

const QUEUE_TABS = [
  { id: 'pending_review', label: '待審閱' },
  { id: 'needs_revision', label: '修改中' },
  { id: 'approved', label: '已批准' },
  { id: 'rejected', label: '已退回' },
];

export function ContentCenter() {
  const { brand: slug } = useParams();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState('pending_review');
  const [items, setItems] = useState<Content[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useMemo(() => {
    if (brand) {
      const list = contentsByBrand(brand.id);
      setItems(list);
      setSelectedId(list.find((c) => c.status === 'pending_review')?.id ?? list[0]?.id ?? null);
    }
  }, [brand?.id]);

  if (!brand) return <Navigate to="/" replace />;

  const filtered = items.filter((c) => c.status === tab || (tab === 'approved' && c.status === 'published'));
  const selected = items.find((c) => c.id === selectedId) ?? filtered[0];

  function review(action: 'approve' | 'modify' | 'return' | 'regenerate' | 'postpone' | 'reject') {
    if (!selected) return;
    const nextStatus: ContentStatus = action === 'approve' ? 'approved'
      : action === 'reject' ? 'rejected'
      : action === 'modify' || action === 'regenerate' ? 'needs_revision'
      : 'draft';
    setItems((prev) => prev.map((c) => (c.id === selected.id ? { ...c, status: nextStatus } : c)));
    const remaining = filtered.filter((c) => c.id !== selected.id);
    setSelectedId(remaining[0]?.id ?? null);
  }

  return (
    <div>
      <PageHeader title={`${brand.name} 內容中心`} subtitle="所有內容必須人工審閱:批准、修改、退回、重新生成、延期、否決" />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs
            tabs={QUEUE_TABS.map((t) => ({ ...t, label: `${t.label} ${items.filter((c) => c.status === t.id).length}` }))}
            active={tab}
            onChange={(id) => { setTab(id); setSelectedId(items.find((c) => c.status === id)?.id ?? null); }}
          />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              style={{
                textAlign: 'left', border: c.id === selected?.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 10, padding: 10, background: 'var(--color-bg)', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{c.targetPlatform} · v{latestVersion(c).versionNumber}</div>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13 }}>此分類目前沒有內容</p>}
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{brand.name} · {selected.targetPlatform}</div>
                    <strong style={{ fontSize: 16 }}>{selected.title}</strong>
                  </div>
                  <Badge tone={statusTone[selected.status]}>{statusLabel[selected.status]}</Badge>
                </div>

                <div
                  style={{
                    background: 'var(--color-bg-soft)', borderRadius: 12, padding: 18, marginBottom: 14,
                    aspectRatio: selected.contentType === 'image' ? '4 / 5' : undefined, maxWidth: 320,
                  }}
                >
                  <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7 }}>{latestVersion(selected).body}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {latestVersion(selected).hashtags.map((h) => <Badge key={h} tone="primary">{h}</Badge>)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-secondary)', marginTop: 10, fontWeight: 700 }}>{latestVersion(selected).cta}</div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14 }}>
                  版本:第 {latestVersion(selected).versionNumber} 版 · 品牌版本 {selected.brandVersionId} · 規則檢查:✅ 通過事實邊界
                </div>

                {selected.reviews.length > 0 && (
                  <div style={{ marginBottom: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                    <strong style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>審閱紀錄</strong>
                    {selected.reviews.map((r) => (
                      <div key={r.id} style={{ fontSize: 12.5, padding: '6px 0' }}>▪ {r.action} — {r.comment}</div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                  <Button variant="primary" onClick={() => review('approve')}>✓ 批准</Button>
                  <Button variant="ghost" onClick={() => review('modify')}>✎ 修改</Button>
                  <Button variant="secondary" onClick={() => review('return')}>↩ 退回</Button>
                  <Button variant="secondary" onClick={() => review('regenerate')}>🔄 重新生成</Button>
                  <Button variant="ghost" onClick={() => review('postpone')}>⏰ 延期</Button>
                  <Button variant="danger" onClick={() => review('reject')}>✗ 否決</Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <Card><p>此分類目前沒有內容可審閱</p></Card>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
