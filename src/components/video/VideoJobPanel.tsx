import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { VideoJob, VideoJobStatus } from '@/types';

const STATUS_META: Record<VideoJobStatus, { label: string; tone: BadgeTone }> = {
  analyzing: { label: '分析中', tone: 'secondary' },
  strategy_review: { label: '待核准策略', tone: 'accent' },
  rendering_preview: { label: '等 720p 預覽', tone: 'secondary' },
  preview_review: { label: '待核准預覽', tone: 'primary' },
  rendering_final: { label: '等正式檔', tone: 'secondary' },
  ready: { label: '可交付', tone: 'success' },
  rejected: { label: '已打回', tone: 'danger' },
};

export function VideoJobPanel({
  job,
  onChange,
}: {
  job: VideoJob;
  onChange: (job: VideoJob) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(job.strategy?.title ?? job.candidates[0]?.title ?? '');
  const [ctaDraft, setCtaDraft] = useState(job.strategy?.cta ?? job.candidates[0]?.cta ?? '');
  const [selectedId, setSelectedId] = useState(job.selectedCandidateId ?? job.candidates[0]?.id ?? '');
  const [promotePlatform, setPromotePlatform] = useState<'instagram' | 'threads' | 'facebook'>('instagram');
  const previewInput = useRef<HTMLInputElement>(null);
  const finalInput = useRef<HTMLInputElement>(null);

  const status = STATUS_META[job.status] ?? { label: job.status, tone: 'default' as BadgeTone };

  const run = async (fn: () => Promise<VideoJob>) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const next = await fn();
      onChange(next);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ fontSize: 15 }}>{job.title ?? '短影音工作'}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone="default">{job.sourceType === 'podcast_clip' ? 'Podcast 切杯' : '上傳精華'}</Badge>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            30 秒 · 9:16 · 策略核准後才渲染預覽，預覽核准後才出正式檔
          </p>
        </div>
        {job.status !== 'rejected' && job.status !== 'ready' && (
          <Button variant="ghost" disabled={busy} onClick={() => run(async () => (await api.rejectVideoJob(job.id)).job)}>
            打回
          </Button>
        )}
      </div>

      {job.errorMessage && (
        <p style={{ fontSize: 12, color: '#B85454', marginBottom: 10 }}>{job.errorMessage}</p>
      )}
      {errorMsg && (
        <p style={{ fontSize: 12, color: '#B85454', marginBottom: 10 }}>{errorMsg}</p>
      )}

      {job.candidates.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
          {job.candidates.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setTitleDraft(c.title);
                  setCtaDraft(c.cta);
                }}
                style={{
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: 'var(--color-bg-soft)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{c.hook}</div>
                <div style={{ fontSize: 11, marginTop: 6, color: 'var(--color-text-muted)' }}>
                  約 {c.estimatedSeconds} 秒 · {c.speakers.join('、') || '口播'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {job.candidates.find((c) => c.id === selectedId)?.strategy && (
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {job.candidates.find((c) => c.id === selectedId)?.strategy}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="標題"
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
        />
        <input
          value={ctaDraft}
          onChange={(e) => setCtaDraft(e.target.value)}
          placeholder="CTA"
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(job.status === 'strategy_review' || job.status === 'preview_review' || job.status === 'rendering_preview') && selectedId && (
          <Button
            disabled={busy}
            onClick={() => run(async () => (await api.approveVideoStrategy(job.id, {
              candidateId: selectedId, title: titleDraft, cta: ctaDraft, subtitleStyle: 'large',
            })).job)}
          >
            {job.status === 'strategy_review' ? '核准這套策略' : '用這套策略重產 EDL'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => (await api.adjustVideoJob(job.id, { action: 'retitle', value: titleDraft })).job)}>
          改標題
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => (await api.adjustVideoJob(job.id, { action: 'cta', value: ctaDraft })).job)}>
          改 CTA
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => (await api.adjustVideoJob(job.id, { action: 'subtitle_large' })).job)}>
          字幕加大
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => (await api.adjustVideoJob(job.id, { action: 'subtitle_standard' })).job)}>
          字幕標準
        </Button>
      </div>

      {(job.status === 'rendering_preview' || job.status === 'preview_review' || job.status === 'rendering_final' || job.status === 'ready') && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            本機渲染：<code>python3 scripts/render-short-video.py --job {job.id} --mode preview</code>
            ，再把 mp4 傳回來。或直接上傳已剪好的檔。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={previewInput}
              type="file"
              accept="video/mp4,video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) run(async () => (await api.uploadVideoRender(job.id, 'preview', file)).job);
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => previewInput.current?.click()}>
              上傳 720p 預覽
            </Button>
            {job.previewUrl && job.status === 'preview_review' && (
              <Button disabled={busy} onClick={() => run(async () => (await api.approveVideoPreview(job.id)).job)}>
                核准預覽，準備定稿
              </Button>
            )}
            <input
              ref={finalInput}
              type="file"
              accept="video/mp4,video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) run(async () => (await api.uploadVideoRender(job.id, 'final', file)).job);
              }}
            />
            {(job.status === 'rendering_final' || job.status === 'ready') && (
              <Button variant="secondary" disabled={busy} onClick={() => finalInput.current?.click()}>
                上傳 1080×1920 正式檔
              </Button>
            )}
          </div>
        </div>
      )}

      {job.previewUrl && (
        <video
          src={job.previewUrl}
          controls
          playsInline
          style={{ width: '100%', maxWidth: 280, borderRadius: 12, background: '#111', marginBottom: 12 }}
        />
      )}
      {job.finalUrl && job.status === 'ready' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href={job.finalUrl} download style={{ fontSize: 13 }}>下載正式檔</a>
          <select
            value={promotePlatform}
            onChange={(e) => setPromotePlatform(e.target.value as typeof promotePlatform)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
          >
            <option value="instagram">Instagram Reels</option>
            <option value="threads">Threads 影片</option>
            <option value="facebook">Facebook</option>
          </select>
          <Button
            disabled={busy || !!job.contentId}
            onClick={() => run(async () => (await api.promoteVideoJob(job.id, promotePlatform)).job)}
          >
            {job.contentId ? '已送內容中心' : '送內容中心待審'}
          </Button>
        </div>
      )}
    </Card>
  );
}
