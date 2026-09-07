import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { NetworkContact, NetworkContactSource, NetworkContactStatus } from '@/types';

const SOURCE_LABEL: Record<NetworkContactSource, string> = {
  event: '活動報名',
  csv: '報名 CSV',
  business_card: '名片 OCR',
  line_chat: 'LINE',
  manual: '手動',
};

const STATUS_LABEL: Record<NetworkContactStatus, string> = {
  pending_review: '待確認',
  verified: '已確認',
  archived: '已封存',
};

const STATUS_TONE: Record<NetworkContactStatus, BadgeTone> = {
  pending_review: 'accent',
  verified: 'primary',
  archived: 'default',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-bg-soft)',
  outline: 'none',
};

export function BrandNetwork() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [matchText, setMatchText] = useState('');
  const [matchReply, setMatchReply] = useState('');
  const cardInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const query = useAsyncData(
    () => (slug ? api.networkContacts(slug, { search, source, status }) : Promise.reject(new Error('no slug'))),
    [slug, search, source, status],
  );
  const statusQuery = useAsyncData(
    () => (slug ? api.networkStatus(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );

  const selected = useMemo(
    () => query.data?.contacts.find((c) => c.id === selectedId) ?? query.data?.contacts[0] ?? null,
    [query.data, selectedId],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (query.loading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState message={query.error ?? '載入失敗'} onRetry={query.reload} />;

  async function run(label: string, work: () => Promise<string>) {
    setBusy(label);
    setNotice('');
    try {
      setNotice(await work());
      query.reload();
    } catch (e) {
      setNotice(e instanceof ApiError || e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy('');
    }
  }

  async function onUploadCards(files: FileList | null) {
    if (!files?.length || !slug) return;
    await run('ocr', async () => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const file of Array.from(files)) {
        const res = await api.ocrNetworkCard(slug, file);
        if (res.skipped) skipped += 1;
        else if (res.created) created += 1;
        else updated += 1;
      }
      return `名片辨識完成：新增 ${created}、更新 ${updated}、略過 ${skipped}`;
    });
  }

  async function onImportCsv(file: File | null) {
    if (!file || !slug) return;
    await run('csv', async () => {
      const res = await api.importNetworkCsv(slug, file);
      return `CSV 匯入完成：新增 ${res.created}、更新 ${res.updated}、略過 ${res.skipped}`;
    });
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 人脈資料庫`}
        subtitle="把活動報名與 LINE 名片收成可搜尋的廠商名單，給群組求推薦時使用"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              disabled={Boolean(busy)}
              onClick={() => void run('events', async () => {
                const res = await api.importNetworkEvents(slug!);
                return `已同步活動報名：新增 ${res.created}、更新 ${res.updated}`;
              })}
            >
              {busy === 'events' ? '同步中…' : '同步活動報名'}
            </Button>
            <input ref={cardInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onUploadCards(e.target.files); e.target.value = ''; }} />
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void onImportCsv(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => cardInputRef.current?.click()}>
              {busy === 'ocr' ? '辨識中…' : '上傳名片 OCR'}
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => csvInputRef.current?.click()}>
              {busy === 'csv' ? '匯入中…' : '匯入報名 CSV'}
            </Button>
          </div>
        }
      />

      {notice && (
        <Card style={{ marginBottom: 14, background: 'var(--color-primary-soft)' }}>{notice}</Card>
      )}

      {statusQuery.data?.line && (
        <Card style={{ marginBottom: 14 }}>
          <strong>LINE 人脈 Bot {statusQuery.data.line.botId}</strong>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
            Webhook：<code>{statusQuery.data.line.webhookUrl}</code>
            <br />
            {statusQuery.data.line.configured
              ? statusQuery.data.line.appliesToThisBrand
                ? 'Channel Secret / Access Token 已設定。LINE 官方帳號後台請把回應模式改成 Bot，並關閉「自動回應訊息」，否則會出現「本帳號無法個別回覆」。'
                : `此 Bot 目前寫入 ${statusQuery.data.line.brandSlug}，不是這個品牌。`
              : '尚未設定 LINE_NETWORK_CHANNEL_SECRET / ACCESS_TOKEN。請在 Cloudflare Pages 環境變數補上後重新部署。'}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="全部" value={query.data.stats.total} />
        <Stat label="待確認" value={query.data.stats.pendingReview} />
        <Stat label="來自活動" value={query.data.stats.fromEvents} />
        <Stat label="來自名片 / LINE" value={query.data.stats.fromCards + query.data.stats.fromLine} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 140px', gap: 10 }}>
          <input
            style={inputStyle}
            placeholder="搜尋姓名、公司、電話、專長…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">全部來源</option>
            {Object.entries(SOURCE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部狀態</option>
            {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 10 }}>
          <input
            style={inputStyle}
            placeholder="試跑 Bot：例如「前金有人做排煙管嗎？」"
            value={matchText}
            onChange={(e) => setMatchText(e.target.value)}
          />
          <Button
            variant="accent"
            disabled={!matchText.trim() || Boolean(busy)}
            onClick={() => void run('match', async () => {
              const res = await api.matchNetworkVendors(slug!, matchText.trim());
              setMatchReply(res.reply);
              return res.ask.isVendorAsk ? `辨識工種：${res.ask.category ?? '未定'}` : '這則不像求廠商';
            })}
          >
            {busy === 'match' ? '比對中…' : '試跑媒合'}
          </Button>
        </div>
        {matchReply && (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 10, color: 'var(--color-text-muted)' }}>{matchReply}</pre>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {query.data.contacts.map((c) => (
            <Card key={c.id} hoverable onClick={() => setSelectedId(c.id)} style={{ cursor: 'pointer', borderColor: selected?.id === c.id ? 'var(--color-primary)' : undefined }}>
              <div className="card-row">
                <div style={{ minWidth: 0 }}>
                  <strong>{c.name}</strong>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {[c.company, c.industry, c.specialties.slice(0, 3).join('、')].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {[c.phone, c.lineId && `LINE ${c.lineId}`, c.eventTitle].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  <Badge>{SOURCE_LABEL[c.source]}</Badge>
                </div>
              </div>
            </Card>
          ))}
          {query.data.contacts.length === 0 && (
            <Card>還沒有人脈。先同步活動報名，或上傳 LINE 名片夾的照片。</Card>
          )}
        </div>
        {selected && (
          <ContactEditor
            slug={brand.slug}
            contact={selected}
            busy={Boolean(busy)}
            onSaved={() => query.reload()}
            onDeleted={() => { setSelectedId(null); query.reload(); }}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </Card>
  );
}

function ContactEditor({
  slug, contact, busy, onSaved, onDeleted,
}: {
  slug: string;
  contact: NetworkContact;
  busy: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState(contact);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(contact); }, [contact]);

  function set<K extends keyof NetworkContact>(key: K, value: NetworkContact[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card>
      <strong>編輯人脈</strong>
      {form.cardImageUrl && (
        <img src={form.cardImageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 12, objectFit: 'cover', maxHeight: 180 }} />
      )}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <Field label="姓名" value={form.name} onChange={(v) => set('name', v)} />
        <Field label="公司" value={form.company ?? ''} onChange={(v) => set('company', v)} />
        <Field label="職稱" value={form.title ?? ''} onChange={(v) => set('title', v)} />
        <Field label="電話" value={form.phone ?? ''} onChange={(v) => set('phone', v)} />
        <Field label="Email" value={form.email ?? ''} onChange={(v) => set('email', v)} />
        <Field label="LINE ID" value={form.lineId ?? ''} onChange={(v) => set('lineId', v)} />
        <Field label="產業" value={form.industry ?? ''} onChange={(v) => set('industry', v)} />
        <Field label="專長（逗號分隔）" value={form.specialties.join('、')} onChange={(v) => set('specialties', v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))} />
        <Field label="服務地區" value={form.serviceRegions.join('、')} onChange={(v) => set('serviceRegions', v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))} />
        <Field label="備註" value={form.notes ?? ''} onChange={(v) => set('notes', v)} />
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
          狀態
          <select style={inputStyle} value={form.status} onChange={(e) => set('status', e.target.value as NetworkContactStatus)}>
            {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button
          variant="primary"
          disabled={saving || busy}
          onClick={() => void (async () => {
            setSaving(true);
            try {
              await api.updateNetworkContact(slug, form.id, form);
              onSaved();
            } catch (e) {
              window.alert(e instanceof Error ? e.message : '儲存失敗');
            } finally {
              setSaving(false);
            }
          })()}
        >
          {saving ? '儲存中…' : '儲存'}
        </Button>
        <Button
          variant="danger"
          disabled={saving || busy}
          onClick={() => void (async () => {
            if (!window.confirm(`確定刪除「${form.name}」？`)) return;
            await api.deleteNetworkContact(slug, form.id);
            onDeleted();
          })()}
        >
          刪除
        </Button>
      </div>
      {form.rawOcr && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12, whiteSpace: 'pre-wrap' }}>{form.rawOcr}</p>
      )}
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
      {label}
      <input style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
