import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { BrandDocument } from '@/types';

interface CompanyProfile {
  companyName: string;
  showroom: string;
  phone: string;
  mobile: string;
  line: string;
  website: string;
  note: string;
}

const FIELDS: Array<{ key: keyof CompanyProfile; label: string; wide?: boolean }> = [
  { key: 'companyName', label: '公司名稱' },
  { key: 'showroom', label: '展示中心' },
  { key: 'phone', label: '電話' },
  { key: 'mobile', label: '手機' },
  { key: 'line', label: 'LINE' },
  { key: 'website', label: '官網' },
];

function isUploadedBriefing(doc: BrandDocument): boolean {
  if (!doc.fileName && !doc.fileUrl?.startsWith('/api/media/')) return false;
  return doc.sourceType === 'presentation' || doc.sourceType === 'pdf'
    || doc.sourceType === 'dm' || doc.sourceType === 'image';
}

function sourceLabel(sourceType: string): string {
  if (sourceType === 'presentation') return '簡報';
  if (sourceType === 'pdf') return 'PDF';
  if (sourceType === 'dm' || sourceType === 'image') return '圖檔';
  return sourceType;
}

export function BrandBriefings() {
  const { brand = 'bbbox' } = useParams();
  const docs = useAsyncData(() => api.listBrandDocuments(brand), [brand]);
  const profile = useAsyncData(() => api.companyProfile(brand), [brand]);
  const [draft, setDraft] = useState<CompanyProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  if (brand !== 'bbbox') return <Navigate to="/briefings" replace />;

  const form = draft ?? profile.data?.profile ?? null;
  const files = (docs.data?.documents ?? []).filter(isUploadedBriefing);

  async function saveProfile() {
    if (!form) return;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await api.saveCompanyProfile(brand, form);
      setDraft(saved.profile);
      profile.reload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '公司資料沒有存進去');
    } finally {
      setSaving(false);
    }
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const sourceType = ext === 'ppt' || ext === 'pptx' || ext === 'pdf' ? 'presentation' : 'dm';
      await api.uploadBrandDocument(brand, {
        file,
        sourceType,
        title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
      });
      setTitle('');
      setFile(null);
      setFileKey((n) => n + 1);
      docs.reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : '檔案沒有傳上去');
    } finally {
      setUploading(false);
    }
  }

  async function remove(doc: BrandDocument) {
    if (!window.confirm(`刪除「${doc.title}」？`)) return;
    await api.deleteBrandDocument(brand, doc.id);
    docs.reload();
  }

  return (
    <div>
      <PageHeader
        title="和居家居簡報"
        subtitle="這裡只放和居家居的公司資料與簡報。三個品牌的聯盟簡報頁不會出現在這一頁。"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>公司資料</div>
          {profile.loading && !form && <LoadingState />}
          {profile.error && <ErrorState message={profile.error} onRetry={profile.reload} />}
          {form && (
            <div style={{ display: 'grid', gap: 10 }}>
              {FIELDS.map((field) => (
                <label key={field.key} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{field.label}</span>
                  <input
                    value={form[field.key]}
                    onChange={(e) => setDraft({ ...form, [field.key]: e.target.value })}
                    style={{
                      border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px',
                      background: 'var(--color-surface)', color: 'inherit',
                    }}
                  />
                </label>
              ))}
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>補充說明</span>
                <textarea
                  value={form.note}
                  rows={5}
                  onChange={(e) => setDraft({ ...form, note: e.target.value })}
                  placeholder="營業時間、賞屋方式、這次簡報要強調的事。不寫價格、回本或合法保證。"
                  style={{
                    border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px',
                    background: 'var(--color-surface)', color: 'inherit', resize: 'vertical',
                  }}
                />
              </label>
              {saveError && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{saveError}</div>}
              <div>
                <Button onClick={saveProfile} disabled={saving}>{saving ? '儲存中' : '儲存公司資料'}</Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>上傳簡報</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>標題</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：2026 產品簡報"
                style={{
                  border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px',
                  background: 'var(--color-surface)', color: 'inherit',
                }}
              />
            </label>
            <input
              key={fileKey}
              type="file"
              accept=".pdf,.ppt,.pptx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              PDF、PPT、PPTX 或圖片，單檔 40MB 以內。傳上去之後會整理重點，給這個品牌的文案用。
            </div>
            {uploadError && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{uploadError}</div>}
            <div>
              <Button onClick={upload} disabled={!file || uploading}>{uploading ? '上傳中' : '上傳'}</Button>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>已上傳的簡報</div>
        {docs.loading && <LoadingState />}
        {docs.error && <ErrorState message={docs.error} onRetry={docs.reload} />}
        {!docs.loading && files.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>還沒有簡報。上傳之後會列在這裡。</div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {files.map((doc) => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Badge>{sourceLabel(doc.sourceType)}</Badge>
                {doc.fileUrl ? (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{doc.title}</a>
                ) : (
                  <span style={{ fontWeight: 700 }}>{doc.title}</span>
                )}
                {doc.fileName && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{doc.fileName}</span>}
              </div>
              <Button variant="ghost" onClick={() => remove(doc)}>刪除</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
