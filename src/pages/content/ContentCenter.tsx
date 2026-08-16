import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
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
  { id: 'draft', label: '草稿' },
  { id: 'needs_revision', label: '修改中' },
  { id: 'approved', label: '已批准' },
  { id: 'rejected', label: '已退回' },
];

const PLATFORM_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
  { id: 'seo', label: 'SEO 長文' },
];

const platformTone: Record<string, BadgeTone> = {
  facebook: 'primary', instagram: 'secondary', threads: 'accent',
};
const platformLabel: Record<string, string> = {
  facebook: 'FB', instagram: 'IG', threads: 'Threads',
};
const API_PUBLISH_PLATFORMS = ['threads', 'facebook', 'instagram'];
const apiPublishLabel: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads',
};

function latestVersion(content: Content) {
  return content.versions[content.versions.length - 1];
}

export function ContentCenter() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState('pending_review');
  const [platform, setPlatform] = useState('all');
  const [items, setItems] = useState<Content[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [apiPublishing, setApiPublishing] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.contents(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );

  useEffect(() => {
    let cancelled = false;
    if (data?.contents) {
      if (!cancelled) {
        setItems(data.contents);
        setSelectedId((prev) => {
          if (prev && data.contents.some((c) => c.id === prev)) return prev;
          return data.contents.find((c) => c.status === 'pending_review')?.id ?? data.contents[0]?.id ?? null;
        });
      }
    }
    return () => { cancelled = true; };
  }, [data?.contents]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const inTab = items.filter((c) => c.status === tab || (tab === 'approved' && c.status === 'published'));
  const filtered = platform === 'all' ? inTab
    : platform === 'seo' ? inTab.filter((c) => !c.targetPlatform && c.contentType === 'article')
    : inTab.filter((c) => c.targetPlatform === platform);
  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0];

  async function review(action: 'approve' | 'modify' | 'return' | 'postpone' | 'reject') {
    if (!selected) return;
    const version = latestVersion(selected);
    await api.reviewContent(selected.id, {
      action,
      contentVersionId: version?.id,
      comment: action === 'approve' ? '核准發布' : '',
    });
    reload();
  }

  async function copyBody() {
    if (!selected) return;
    const v = latestVersion(selected);
    const text = [
      v.body,
      v.hashtags.length ? v.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ') : '',
    ].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text);
    setPublishMessage('文案已複製,可貼到平台發布');
  }

  async function markPublished() {
    if (!selected) return;
    try {
      await api.manualPublishContent(selected.id);
      setPublishMessage('已標記為發布,發布紀錄已寫入發布管理');
      reload();
    } catch (e) {
      setPublishMessage(`標記失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    }
  }

  async function apiPublish() {
    if (!selected || apiPublishing) return;
    setApiPublishing(true);
    setPublishMessage(null);
    const label = apiPublishLabel[selected.targetPlatform ?? ''] ?? selected.targetPlatform;
    try {
      const res = await api.apiPublishContent(selected.id);
      setPublishMessage(res.permalink ? `已發布到 ${label}:${res.permalink}` : `已發布到 ${label}`);
      reload();
    } catch (e) {
      setPublishMessage(`發布失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setApiPublishing(false);
    }
  }

  async function regenerate() {
    if (!selected || regenerating) return;
    const instruction = window.prompt('要給 AI 的修改方向?(可留空直接換角度重寫)') ?? undefined;
    setRegenerating(true);
    setRegenError(null);
    try {
      await api.regenerateContent(selected.id, instruction ? { instruction } : undefined);
      reload();
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : '重新生成失敗');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div>
      <PageHeader title={`${brand.name} 內容中心`} subtitle="所有內容必須人工審閱:批准、修改、退回、重新生成、延期、否決" />

      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs
            tabs={QUEUE_TABS.map((t) => ({ ...t, label: `${t.label} ${items.filter((c) => c.status === t.id || (t.id === 'approved' && c.status === 'published')).length}` }))}
            active={tab}
            onChange={(id) => { setTab(id); setSelectedId(null); }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 12px', borderTop: '1px solid var(--color-border)' }}>
          {PLATFORM_FILTERS.map((p) => {
            const count = p.id === 'all' ? inTab.length
              : p.id === 'seo' ? inTab.filter((c) => !c.targetPlatform && c.contentType === 'article').length
              : inTab.filter((c) => c.targetPlatform === p.id).length;
            const active = platform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setPlatform(p.id); setSelectedId(null); }}
                style={{
                  border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: active ? 'var(--color-primary-soft)' : 'var(--color-bg)',
                  color: active ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                  fontWeight: active ? 700 : 500,
                  borderRadius: 999, padding: '4px 14px', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                {p.label} {count}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid-split">
        <div className="content-queue">
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Badge tone={platformTone[c.targetPlatform ?? ''] ?? 'default'}>
                  {c.targetPlatform ? (platformLabel[c.targetPlatform] ?? c.targetPlatform) : 'SEO'}
                </Badge>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  v{latestVersion(c)?.versionNumber ?? '-'}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13 }}>此分類目前沒有內容</p>}
        </div>

        <AnimatePresence mode="wait">
          {selected && latestVersion(selected) ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Card>
                <div className="card-row" style={{ marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{brand.name} · {selected.targetPlatform}</div>
                    <strong style={{ fontSize: 16 }}>{selected.title}</strong>
                  </div>
                  <Badge tone={statusTone[selected.status]}>{statusLabel[selected.status]}</Badge>
                </div>

                {(latestVersion(selected).assets ?? []).filter((a) => a.assetType === 'image').map((a) => (
                  <img
                    key={a.id}
                    src={a.fileUrl}
                    alt="AI 生成配圖"
                    style={{ maxWidth: 320, width: '100%', borderRadius: 12, marginBottom: 14, border: '1px solid var(--color-border)' }}
                  />
                ))}
                {(latestVersion(selected).assets ?? []).filter((a) => a.assetType === 'video').map((a) => (
                  <video
                    key={a.id}
                    src={a.fileUrl}
                    controls
                    playsInline
                    style={{ maxWidth: 280, width: '100%', borderRadius: 12, marginBottom: 14, background: '#111' }}
                  />
                ))}

                <div
                  style={{
                    background: 'var(--color-bg-soft)', borderRadius: 12, padding: 18, marginBottom: 14,
                  }}
                >
                  <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{latestVersion(selected).body}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {latestVersion(selected).hashtags.map((h) => <Badge key={h} tone="primary">{h}</Badge>)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-secondary)', marginTop: 10, fontWeight: 700 }}>{latestVersion(selected).cta}</div>
                </div>

                {latestVersion(selected).seoMeta && (
                  <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid var(--color-border)', padding: 14 }}>
                    <strong style={{ fontSize: 13 }}>SEO metadata</strong>
                    <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
                      <div><strong>title:</strong> {latestVersion(selected).seoMeta?.title}</div>
                      <div><strong>description:</strong> {latestVersion(selected).seoMeta?.description}</div>
                      <div><strong>slug:</strong> {latestVersion(selected).seoMeta?.slug}</div>
                      {latestVersion(selected).seoMeta?.keywords?.length ? (
                        <div><strong>keywords:</strong> {latestVersion(selected).seoMeta?.keywords?.join('、')}</div>
                      ) : null}
                    </div>
                  </div>
                )}

                {selected.predictedEngagementScore != null && (
                  <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid var(--color-border)', padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>AI 互動潛力評估</strong>
                      <Badge tone={Number(selected.predictedEngagementScore) >= 70 ? 'primary' : Number(selected.predictedEngagementScore) >= 40 ? 'accent' : 'danger'}>
                        {Number(selected.predictedEngagementScore).toFixed(0)} / 100
                      </Badge>
                    </div>
                    {selected.engagementAnalysis && (
                      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.engagementAnalysis}</p>
                    )}
                  </div>
                )}

                {selected.reviews.length > 0 && (
                  <div style={{ marginBottom: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                    <strong style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>審閱紀錄</strong>
                    {selected.reviews.map((r) => (
                      <div key={r.id} style={{ fontSize: 12.5, padding: '6px 0' }}>▪ {r.action} — {r.comment}</div>
                    ))}
                  </div>
                )}

                {(selected.status === 'approved' || selected.status === 'published') && (
                  <div style={{ marginBottom: 14, borderRadius: 12, background: 'var(--color-primary-soft)', padding: 14 }}>
                    <strong style={{ fontSize: 13 }}>發布</strong>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 10px' }}>
                      {API_PUBLISH_PLATFORMS.includes(selected.targetPlatform ?? '')
                        ? `已連接 ${apiPublishLabel[selected.targetPlatform ?? '']} API 的品牌可一鍵發布;或複製文案手動貼文後標記已發布${selected.targetPlatform === 'instagram' ? '(IG 圖文需 JPEG,短影音走 Reels)' : ''}`
                        : `複製文案與下載配圖後貼到 ${selected.targetPlatform},再回來標記已發布`}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {API_PUBLISH_PLATFORMS.includes(selected.targetPlatform ?? '') && selected.status === 'approved' && (
                        <Button variant="primary" style={{ fontSize: 12, padding: '5px 12px' }} disabled={apiPublishing} onClick={() => void apiPublish()}>
                          {apiPublishing ? '⏳ 發布中...' : `🚀 發布到 ${apiPublishLabel[selected.targetPlatform ?? '']}`}
                        </Button>
                      )}
                      <Button variant="secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => void copyBody()}>📋 複製文案</Button>
                      {(latestVersion(selected).assets ?? []).filter((a) => a.assetType === 'image').map((a) => (
                        <a key={a.id} href={a.fileUrl} download target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <Button variant="secondary" style={{ fontSize: 12, padding: '5px 12px' }}>🖼 下載配圖</Button>
                        </a>
                      ))}
                      {(latestVersion(selected).assets ?? []).filter((a) => a.assetType === 'video').map((a) => (
                        <a key={a.id} href={a.fileUrl} download target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <Button variant="secondary" style={{ fontSize: 12, padding: '5px 12px' }}>下載短影音</Button>
                        </a>
                      ))}
                      {selected.status === 'approved' && (
                        <Button
                          variant={API_PUBLISH_PLATFORMS.includes(selected.targetPlatform ?? '') ? 'ghost' : 'primary'}
                          style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => void markPublished()}
                        >
                          ✓ 標記已發布
                        </Button>
                      )}
                    </div>
                    {publishMessage && <p style={{ fontSize: 12, marginTop: 8 }}>{publishMessage}</p>}
                  </div>
                )}

                {regenError && (
                  <p style={{ fontSize: 12.5, color: '#B85454', marginBottom: 10 }}>{regenError}</p>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                  <Button variant="primary" onClick={() => void review('approve')}>✓ 批准</Button>
                  <Button variant="ghost" onClick={() => void review('modify')}>✎ 修改</Button>
                  <Button variant="secondary" onClick={() => void review('return')}>↩ 退回</Button>
                  <Button variant="secondary" disabled={regenerating} onClick={() => void regenerate()}>
                    {regenerating ? '⏳ AI 生成中...' : '🔄 重新生成'}
                  </Button>
                  <Button variant="ghost" onClick={() => void review('postpone')}>⏰ 延期</Button>
                  <Button variant="danger" onClick={() => void review('reject')}>✗ 否決</Button>
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
