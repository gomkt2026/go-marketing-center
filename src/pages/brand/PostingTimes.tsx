import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { PostingSlot, PostingSlotKind } from '@/types';

const PLATFORMS: Array<{ id: 'facebook' | 'instagram' | 'threads'; label: string }> = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
];

const KIND_LABEL: Record<PostingSlotKind, string> = {
  daily_theme: '每日主題',
  threads_hourly: '熱議跟風',
  threads_offtopic: '生活哏文',
};

type DraftSlot = {
  key: string;
  platform: 'facebook' | 'instagram' | 'threads';
  hourTw: number;
  slotKind: PostingSlotKind;
  enabled: boolean;
};

function toDraft(slots: PostingSlot[]): DraftSlot[] {
  return slots.map((s) => ({
    key: s.id,
    platform: s.platform,
    hourTw: s.hourTw,
    slotKind: s.slotKind,
    enabled: s.enabled,
  }));
}

export function PostingTimes() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const query = useAsyncData(() => slug ? api.postingSlots(slug) : Promise.reject(new Error('no slug')), [slug]);
  const [draft, setDraft] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.data?.slots) setDraft(toDraft(query.data.slots));
  }, [query.data]);

  const grouped = useMemo(() => {
    return PLATFORMS.map((p) => ({
      ...p,
      slots: draft.filter((s) => s.platform === p.id).sort((a, b) => a.hourTw - b.hourTw),
    }));
  }, [draft]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (query.loading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState message={query.error ?? '載入失敗'} onRetry={query.reload} />;

  function addSlot(platform: 'facebook' | 'instagram' | 'threads') {
    const used = new Set(draft.filter((s) => s.platform === platform).map((s) => s.hourTw));
    let hour = platform === 'threads' ? 12 : 19;
    while (used.has(hour) && hour < 23) hour += 1;
    if (used.has(hour)) hour = [...Array(24).keys()].find((h) => !used.has(h)) ?? 19;
    setDraft((prev) => [
      ...prev,
      {
        key: `${platform}-${hour}-${Date.now()}`,
        platform,
        hourTw: hour,
        slotKind: platform === 'threads' ? 'threads_hourly' : 'daily_theme',
        enabled: true,
      },
    ]);
  }

  async function save() {
    if (!slug) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.savePostingSlots(slug, draft.map((s) => ({
        platform: s.platform,
        hourTw: s.hourTw,
        slotKind: s.slotKind,
        enabled: s.enabled,
      })));
      setDraft(toDraft(res.slots));
      setMessage('已儲存發文時段。下一輪排程會依新時段產稿。');
      query.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} 發文時段`}
        subtitle="每個平台可設多個台灣時間整點。產稿會提前 1 小時；單篇仍可在行程表改實際發文時間。"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/${brand.slug}/schedule`} style={{ textDecoration: 'none' }}>
              <Button variant="ghost">看行程表</Button>
            </Link>
            <Button variant="primary" disabled={saving} onClick={save}>
              {saving ? '儲存中…' : '儲存時段'}
            </Button>
          </div>
        }
      />

      {message && (
        <Card style={{ marginBottom: 16, borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      {query.data.frequency && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          目前節奏：FB {query.data.frequency.facebook}；IG {query.data.frequency.instagram}；Threads {query.data.frequency.threads}
        </p>
      )}

      <div className="grid-3" style={{ gap: 16 }}>
        {grouped.map((group) => (
          <Card key={group.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>{group.label}</strong>
              <Button variant="ghost" onClick={() => addSlot(group.id)}>＋ 時段</Button>
            </div>
            {group.slots.length === 0 && (
              <p style={{ fontSize: 13 }}>尚未設定，這個平台不會自動產稿。</p>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              {group.slots.map((slot) => (
                <div
                  key={slot.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: group.id === 'threads' ? '88px 1fr auto auto' : '88px 1fr auto',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <select
                    value={slot.hourTw}
                    onChange={(e) => setDraft((prev) => prev.map((s) => s.key === slot.key ? { ...s, hourTw: Number(e.target.value) } : s))}
                    style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                    ))}
                  </select>
                  {group.id === 'threads' ? (
                    <select
                      value={slot.slotKind}
                      onChange={(e) => setDraft((prev) => prev.map((s) => s.key === slot.key ? { ...s, slotKind: e.target.value as PostingSlotKind } : s))}
                      style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                    >
                      <option value="threads_hourly">熱議跟風</option>
                      <option value="threads_offtopic">生活哏文</option>
                    </select>
                  ) : (
                    <Badge tone="secondary">{KIND_LABEL[slot.slotKind]}</Badge>
                  )}
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) => setDraft((prev) => prev.map((s) => s.key === slot.key ? { ...s, enabled: e.target.checked } : s))}
                    />
                    啟用
                  </label>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => prev.filter((s) => s.key !== slot.key))}
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12 }}
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
