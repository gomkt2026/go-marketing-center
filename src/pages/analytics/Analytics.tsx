import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { AnalyticsPost, LearningRecord, LearningRecordType } from '@/types';

const typeLabel: Record<LearningRecordType, string> = {
  content_performance: '內容成效', cta_effectiveness: 'CTA 成效',
  audience_engagement: '受眾互動', channel_insight: '渠道洞察', other: '其他',
};

const genSourceLabel: Record<string, string> = {
  threads_30min: '30分熱議', threads_hourly: '熱議跟風', threads_offtopic: '生活哏文',
  daily_theme: '每日主題', auto_signal: '情報自動', market_signal: '市場情報',
  meeting_plan: '會議計畫',
};

const platformLabel: Record<string, string> = {
  threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram', x: 'X',
};

const platformTone: Record<string, BadgeTone> = {
  threads: 'secondary', facebook: 'accent', instagram: 'primary', x: 'default',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};

function formatRate(rate: number): string {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

function doMore(record: LearningRecord): string[] {
  return record.supportingData?.doMore ?? record.supportingData?.do_more ?? [];
}
function doLess(record: LearningRecord): string[] {
  return record.supportingData?.doLess ?? record.supportingData?.do_less ?? [];
}

function ManualForm({
  post, slug, onSaved, onCancel,
}: {
  post: AnalyticsPost; slug: string; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    impressions: String(post.perf?.impressions ?? ''),
    clicks: String(post.perf?.clicks ?? ''),
    comments: String(post.perf?.comments ?? ''),
    shares: String(post.perf?.shares ?? ''),
    saves: String(post.perf?.saves ?? ''),
    likes: String(post.perf?.likes ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.saveAnalyticsReport(slug, {
        jobId: post.job.id,
        impressions: Number(form.impressions || 0),
        clicks: Number(form.clicks || 0),
        comments: Number(form.comments || 0),
        shares: Number(form.shares || 0),
        saves: Number(form.saves || 0),
        likes: Number(form.likes || 0),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: 'impressions', label: '曝光' }, { key: 'likes', label: '按讚' },
    { key: 'clicks', label: '點擊' }, { key: 'comments', label: '留言' },
    { key: 'shares', label: '分享' }, { key: 'saves', label: '收藏' },
  ];

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
      <div className="grid-3" style={{ gap: 8 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {f.label}
            <input
              type="number" min={0} style={{ ...inputStyle, marginTop: 4 }}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {error && <p style={{ color: '#B85454', fontSize: 12, marginTop: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button variant="primary" disabled={saving} onClick={submit}>{saving ? '儲存中…' : '儲存數字'}</Button>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

export function Analytics() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.analytics(slug) : Promise.reject(new Error('no slug')),
    [slug],
  );
  const [platform, setPlatform] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const autoSyncRef = useRef(false);

  async function syncUntilDone() {
    let synced = 0;
    let failed = 0;
    let remaining = 0;
    let lastError = '';
    for (let i = 0; i < 12; i++) {
      const res = await api.syncAnalytics(slug!);
      synced += res.synced;
      failed += res.failed;
      remaining = res.remaining;
      const err = res.results.find((r) => !r.ok)?.error;
      if (err) lastError = err;
      if (res.remaining <= 0) break;
      if (res.synced === 0) break;
    }
    if (!synced && !failed) return '近 28 天沒有可同步的已發布貼文(需有平台貼文 ID)';
    const failNote = failed ? `;失敗 ${failed} 篇${lastError ? `:${lastError}` : ',可改手動補登'}` : '';
    const more = remaining > 0 ? `;還有 ${remaining} 篇未回收` : '';
    return `已自動同步 ${synced} 篇${failNote}${more}`;
  }

  const posts = useMemo(() => {
    const list = data?.posts ?? [];
    if (platform === 'all') return list;
    return list.filter((p) => p.job.platform === platform);
  }, [data, platform]);

  useEffect(() => {
    if (!slug || !data || autoSyncRef.current) return;
    if (data.syncedCount >= data.publishedCount) return;
    autoSyncRef.current = true;
    setBusy('sync');
    setMessage('正在自動同步尚未回收的成效,不用一直按…');
    void syncUntilDone()
      .then((text) => { setMessage(text); reload(); })
      .catch((e) => setMessage(e instanceof Error ? e.message : '自動同步失敗'))
      .finally(() => setBusy(null));
  }, [slug, data]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  const { totals, publishedCount, syncedCount, suggestions } = data;
  const platforms = Array.from(new Set((data.posts ?? []).map((p) => p.job.platform)));

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage(await fn());
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 成效分析`}
        subtitle="排程每 3 小時自動回收成效;進頁也會一次補齊尚未回收的貼文,不用一直按同步"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => run('sync', syncUntilDone)}
            >
              {busy === 'sync' ? '同步中…' : '同步成效'}
            </Button>
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={() => run('learn', async () => {
                const res = await api.requestAnalyticsLearn(slug!);
                if (res.created) return `已產出 ${res.created} 則待核准建議`;
                return res.skipped ?? '目前沒有新的建議';
              })}
            >
              {busy === 'learn' ? '分析中…' : '產生 AI 建議'}
            </Button>
          </div>
        }
      />

      {message && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        已發布 {publishedCount} 篇 · 已回收 {syncedCount} 篇
        {publishedCount > syncedCount ? ' · 尚未回收的貼文可同步或手動補登' : ''}
      </p>

      <div className="grid-5" style={{ marginBottom: 20 }}>
        <StatCard label="曝光" value={totals.impressions} delay={0} tone="var(--color-primary-dark)" />
        <StatCard label="點擊" value={totals.clicks} delay={0.03} />
        <StatCard label="留言" value={totals.comments} delay={0.06} />
        <StatCard label="分享" value={totals.shares} delay={0.09} />
        <StatCard label="收藏" value={totals.saves} delay={0.12} />
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16 }}>待核准的操盤建議</h2>
          {suggestions.map((s) => (
            <Card key={s.id} style={{ background: 'var(--color-primary-soft)', border: 'none' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <Badge tone="accent">待核准</Badge>
                <Badge tone="secondary">{typeLabel[s.recordType]}</Badge>
              </div>
              <textarea
                style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
                value={drafts[s.id] ?? s.insight}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />
              {(doMore(s).length > 0 || doLess(s).length > 0) && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  {doMore(s).length ? `多做:${doMore(s).join('、')} ` : ''}
                  {doLess(s).length ? `少做:${doLess(s).join('、')}` : ''}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => run(`approve-${s.id}`, async () => {
                    await api.decideLearning(slug!, s.id, { action: 'approve', insight: drafts[s.id] ?? s.insight });
                    return '已核准,下次生成會參考這則洞察';
                  })}
                >
                  核准回寫
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => run(`dismiss-${s.id}`, async () => {
                    await api.decideLearning(slug!, s.id, { action: 'dismiss' });
                    return '已駁回這則建議';
                  })}
                >
                  駁回
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'all', label: `全部 ${data.posts.length}` },
          ...platforms.map((p) => ({
            id: p,
            label: `${platformLabel[p] ?? p} ${data.posts.filter((x) => x.job.platform === p).length}`,
          })),
        ]}
        active={platform}
        onChange={setPlatform}
      />

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {posts.map((post) => {
          const perf = post.perf;
          return (
            <Card key={post.job.id}>
              <div className="card-row" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{post.content.title || '未命名貼文'}</strong>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge tone={platformTone[post.job.platform] ?? 'default'}>
                      {platformLabel[post.job.platform] ?? post.job.platform}
                    </Badge>
                    {post.content.genSource && (
                      <Badge>{genSourceLabel[post.content.genSource] ?? post.content.genSource}</Badge>
                    )}
                    {post.job.publishedAt && (
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {new Date(post.job.publishedAt).toLocaleString('zh-TW')}
                      </span>
                    )}
                  </div>
                </div>
                {perf ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                    互動率 {formatRate(perf.engagementRate)}
                  </span>
                ) : (
                  <Badge tone="accent">尚未回收</Badge>
                )}
              </div>

              {post.content.body && (
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: 10 }}>
                  {post.content.body}
                </p>
              )}

              {perf ? (
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                  <span>曝光 {Number(perf.impressions).toLocaleString()}</span>
                  <span>點擊 {Number(perf.clicks).toLocaleString()}</span>
                  <span>留言 {perf.comments}</span>
                  <span>分享 {perf.shares}</span>
                  <span>收藏 {perf.saves}</span>
                  <span>按讚 {perf.likes ?? 0}</span>
                  {post.content.predictedScore != null && (
                    <span>預測分 {post.content.predictedScore} vs 實際 {formatRate(perf.engagementRate)}</span>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {post.job.externalPostId ? '已發到平台,但還沒有 Insights 數字。可同步或手動補登。' : '這篇沒有平台貼文 ID,請手動補登。'}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {post.job.externalPostId && (
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => run(`sync-${post.job.id}`, async () => {
                      const res = await api.syncAnalytics(slug!, post.job.id);
                      const first = res.results[0];
                      if (first && !first.ok) return first.error ?? '同步失敗,可改手動補登';
                      return '已同步這篇成效';
                    })}
                  >
                    同步這篇
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setEditingJob(editingJob === post.job.id ? null : post.job.id)}>
                  {editingJob === post.job.id ? '收起補登' : '補登數字'}
                </Button>
              </div>

              {editingJob === post.job.id && (
                <ManualForm
                  post={post}
                  slug={slug!}
                  onSaved={() => { setEditingJob(null); setMessage('已補登成效'); reload(); }}
                  onCancel={() => setEditingJob(null)}
                />
              )}
            </Card>
          );
        })}
        {posts.length === 0 && (
          <Card>
            <p>這個品牌還沒有已發布貼文。內容審核通過並發布後,就會出現在這裡。</p>
          </Card>
        )}
      </div>
    </div>
  );
}
