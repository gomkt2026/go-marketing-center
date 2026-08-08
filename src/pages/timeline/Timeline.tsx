import { useState, useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useBrand } from '@/context/BrandContext';
import { useMeta } from '@/context/MetaContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';

export function Timeline() {
  const { brands, brandById, currentBrand } = useBrand();
  // 預設跟隨上方品牌切換,使用者仍可用下方 chips 手動改變篩選
  const [filterBrand, setFilterBrand] = useState<string>(currentBrand?.id ?? 'all');
  const { agentById, userName, actionLabels, setActionLabels } = useMeta();

  useEffect(() => {
    setFilterBrand(currentBrand?.id ?? 'all');
  }, [currentBrand?.id]);

  const { data, loading, error, reload } = useAsyncData(
    () => api.activity(filterBrand === 'all' ? undefined : filterBrand),
    [filterBrand],
  );
  const collabQuery = useAsyncData(() => api.collaborations(), []);

  useEffect(() => {
    if (data?.actionLabels) setActionLabels(data.actionLabels);
  }, [data?.actionLabels, setActionLabels]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const events = data.activity;
  const labels = { ...data.actionLabels, ...actionLabels };
  const collaborations = collabQuery.data?.collaborations ?? [];

  return (
    <div>
      <PageHeader title="時間軸 Timeline / Activity Log" subtitle="全流程事件保留:任何操作皆可回溯誰提出、誰修改、誰批准、什麼時間、哪個 AI、哪個品牌" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterChip active={filterBrand === 'all'} onClick={() => setFilterBrand('all')}>全部品牌</FilterChip>
        {brands.map((b) => (
          <FilterChip key={b.id} active={filterBrand === b.id} onClick={() => setFilterBrand(b.id)}>{b.name}</FilterChip>
        ))}
      </div>

      <Card>
        <div style={{ display: 'grid', gap: 0 }}>
          {events.map((e, i) => {
            const brand = e.brandId ? brandById(e.brandId) : undefined;
            const collab = e.collaborationId ? collaborations.find((c) => c.id === e.collaborationId) : undefined;
            const agent = e.actorAgentId ? agentById(e.actorAgentId) : undefined;
            const actor = e.actorType === 'ai_agent' ? agent?.displayName : userName(e.actorUserId);
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                style={{ display: 'flex', gap: 14, padding: '12px 0', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}
              >
                <div style={{ width: 130, fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {new Date(e.createdAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div
                  style={{
                    width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                    background: e.actorType === 'ai_agent' ? (agent?.avatarColor ?? 'var(--color-secondary)') : 'var(--color-primary)',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>
                    <span>{e.actorType === 'ai_agent' ? '🤖' : '👤'}</span>{' '}
                    <strong>{actor}</strong> {labels[e.action] ?? e.action}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {brand && <Badge tone="secondary">{brand.name}</Badge>}
                    {collab && <Badge tone="secondary">{collab.title}</Badge>}
                    <Badge tone="default">{e.entityType}</Badge>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {events.length === 0 && <p>此篩選條件下沒有事件</p>}
        </div>
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: active ? 'none' : '1px solid var(--color-border)',
        background: active ? 'var(--color-primary)' : 'var(--color-bg)',
        color: active ? '#2E3B26' : 'var(--color-text-muted)',
      }}
    >
      {children}
    </button>
  );
}
