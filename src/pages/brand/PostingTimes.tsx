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
  threads_offtopic: '生活梗文',
  threads_love: '感情散文',
  threads_weather: '天氣季節',
  threads_entertainment: '娛樂影視',
  threads_sports: '運動賽事',
  threads_emotion: '人際視角',
  threads_workplace: '行業現場',
  threads_qa: '互動提問',
  threads_image: '實績畫面',
};

const THREADS_KIND_OPTIONS: Array<{ value: PostingSlotKind; label: string; group: string; hint: string }> = [
  { value: 'threads_hourly', label: '熱議跟風', group: '話題', hint: '跟當下熱搜、PTT／Dcard 自然掛勾' },
  { value: 'threads_weather', label: '天氣季節', group: '話題', hint: '梅雨、颱風、換季等台灣天氣' },
  { value: 'threads_entertainment', label: '娛樂影視', group: '話題', hint: '影劇、綜藝、明星、動漫話題' },
  { value: 'threads_sports', label: '運動賽事', group: '話題', hint: '棒球、籃球、路跑、健身風潮' },
  { value: 'threads_offtopic', label: '生活梗文', group: '生活', hint: '不提品牌的生活觀察與幹話' },
  { value: 'threads_love', label: '感情散文', group: '生活', hint: '品牌世界當場景的感情長文' },
  { value: 'threads_emotion', label: '人際視角', group: '生活', hint: '房東房客、工班、洗衣店的人際現場' },
  { value: 'threads_workplace', label: '行業現場', group: '品牌', hint: '第一線具體畫面與真實對話' },
  { value: 'threads_qa', label: '互動提問', group: '品牌', hint: '丟一個好回的問題，邀留言' },
  { value: 'threads_image', label: '實績畫面', group: '品牌', hint: '用素材庫圖片當話題' },
];

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
        subtitle="每個平台可設多個台灣時間整點。Threads 每檔可選主題，產稿會照那個角度寫。產稿提前 1 小時；單篇仍可在行程表改實際發文時間。"
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
                      title={THREADS_KIND_OPTIONS.find((o) => o.value === slot.slotKind)?.hint}
                      onChange={(e) => setDraft((prev) => prev.map((s) => s.key === slot.key ? { ...s, slotKind: e.target.value as PostingSlotKind } : s))}
                      style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}
                    >
                      {['話題', '生活', '品牌'].map((group) => (
                        <optgroup key={group} label={group}>
                          {THREADS_KIND_OPTIONS.filter((o) => o.group === group).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
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
            {group.id === 'threads' && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.6 }}>
                每檔選一個主題，產稿會鎖那個角度，不要六檔都用熱議跟風。
                話題：熱議／天氣／娛樂／運動。生活：梗文、感情散文、人際視角。品牌：現場、提問、實績畫面。
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
