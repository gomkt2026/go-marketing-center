import { useRef, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { VideoJobPanel } from '@/components/video/VideoJobPanel';
import type { VideoJob } from '@/types';

export function Shorts() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { loading, error, reload } = useAsyncData(
    async () => {
      if (!slug) throw new Error('no slug');
      const data = await api.brandShorts(slug);
      setJobs(data.jobs);
      return data;
    },
    [slug],
  );

  if (!slug) return <Navigate to="/" replace />;
  if (brandsLoading) return <LoadingState />;
  if (!brand) return <Navigate to="/" replace />;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setErrorMsg(null);
    try {
      const { job } = await api.uploadBrandShort(slug, { file, consentScribe: consent });
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="短影音工作台"
        subtitle={`${brand.name} · 可貼上分鏡腳本，或上傳長影片／音檔剪成 30 秒 9:16。策略與預覽都要人工核准。`}
      />

      {errorMsg && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--color-danger-soft)', color: '#B85454', fontSize: 13 }}>
          {errorMsg}
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>貼上分鏡腳本</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          標題用《》包起來。一次可貼多支。LINE 品牌工作群也可以直接貼給機器人。
        </p>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder={'《標題》\n開頭：「…」\n下一秒：\n📱「…」'}
          rows={8}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            fontSize: 13,
            background: 'var(--color-bg-soft)',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.6,
            marginBottom: 12,
            fontFamily: 'inherit',
          }}
        />
        <Button
          disabled={savingScript || !scriptText.trim()}
          onClick={async () => {
            setSavingScript(true);
            setErrorMsg(null);
            try {
              const { jobs: saved } = await api.createBrandShortScripts(slug, { text: scriptText });
              setJobs((prev) => {
                const next = [...saved, ...prev.filter((j) => !saved.some((s) => s.id === j.id))];
                return next;
              });
              setScriptText('');
            } catch (e) {
              setErrorMsg(e instanceof Error ? e.message : '儲存腳本失敗');
            } finally {
              setSavingScript(false);
            }
          }}
        >
          {savingScript ? '儲存中…' : '存進工作台'}
        </Button>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>上傳實拍 / 口播</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          單檔上限 80MB（建議先轉 720p）。完整精度需要 ElevenLabs Scribe v2 逐字時間碼。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,audio/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleUpload(file);
          }}
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            我同意把「即將上傳的這個檔案」送到 ElevenLabs Scribe v2 做轉寫（可能消耗額度）。
            不勾選則先用片頭 30 秒當候選。
          </span>
        </label>
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? '上傳並分析中…' : '上傳影片'}
        </Button>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && jobs.length === 0 && (
        <Card style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          這個品牌還沒有短影音工作。可貼上腳本，或從 Podcast 已核准集數切杯。
        </Card>
      )}

      {jobs.map((job) => (
        <VideoJobPanel
          key={job.id}
          job={job}
          onChange={(next) => setJobs((prev) => prev.map((j) => (j.id === next.id ? next : j)))}
        />
      ))}
    </div>
  );
}
