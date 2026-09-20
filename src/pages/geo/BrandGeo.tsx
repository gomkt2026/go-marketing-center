import { useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { BrandPlace, BrandPlaceKind } from '@/types';
import { PlaceGlobe } from './PlaceGlobe';

const KIND_LABEL: Record<BrandPlaceKind, string> = {
  property: '租屋',
  site: '案場',
  store: '門市',
  event: '活動',
  contact: '人脈',
};

const KIND_TONE: Record<BrandPlaceKind, BadgeTone> = {
  property: 'primary',
  site: 'accent',
  store: 'secondary',
  event: 'default',
  contact: 'default',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 13,
  background: 'var(--color-bg-soft)',
};

export function BrandGeo() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '', kind: defaultKind(slug) });

  const query = useAsyncData(
    () => (slug ? api.brandPlaces(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );

  const places = query.data?.places ?? [];
  const selected = useMemo(
    () => places.find((place) => place.id === selectedId) ?? places[0] ?? null,
    [places, selectedId],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (query.loading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState message={query.error ?? '載入失敗'} onRetry={query.reload} />;

  function flyTo(place: BrandPlace) {
    setSelectedId(place.id);
    if (place.lat == null || place.lng == null) {
      setNotice('這筆還沒有座標，請補 lat / lng。');
    }
  }

  async function addPlace() {
    if (!slug || !form.name.trim()) {
      setNotice('請填名稱');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const lat = form.lat ? Number(form.lat) : undefined;
      const lng = form.lng ? Number(form.lng) : undefined;
      const { place } = await api.createBrandPlace(slug, {
        kind: form.kind,
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
      });
      setForm({ name: '', address: '', lat: '', lng: '', kind: defaultKind(slug) });
      setNotice(`已新增 ${place.name}`);
      setSelectedId(place.id);
      query.reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '新增失敗');
    } finally {
      setBusy(false);
    }
  }

  const mapLat = selected?.lat ?? 25.033;
  const mapLng = selected?.lng ?? 121.5654;

  return (
    <div>
      <PageHeader
        title={`${brand.name} 場域地圖`}
        subtitle="點左側據點，地圖會飛到該位置，並標出據點資訊與附近便利商店、公車站、地標。"
      />

      <Card style={{ marginBottom: 16, background: 'var(--color-primary-soft)' }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          {query.data.disclaimer}
          {' '}點左側卡片即可切換地圖中心。
        </div>
      </Card>

      <div className="geo-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {places.map((place) => (
            <Card
              key={place.id}
              hoverable
              delay={0}
              onClick={() => flyTo(place)}
              style={{
                cursor: 'pointer',
                outline: selected?.id === place.id ? '2px solid var(--color-primary)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <strong>{place.name}</strong>
                <Badge tone={KIND_TONE[place.kind]}>{KIND_LABEL[place.kind]}</Badge>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{place.address}</div>
              {place.note && <div style={{ fontSize: 12, marginTop: 6 }}>{place.note}</div>}
              {place.lat != null && place.lng != null && (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                </div>
              )}
            </Card>
          ))}

          <Card delay={0}>
            <strong style={{ display: 'block', marginBottom: 10 }}>新增自己的點</strong>
            <div style={{ display: 'grid', gap: 8 }}>
              <select
                value={form.kind}
                onChange={(e) => setForm((current) => ({ ...current, kind: e.target.value as BrandPlaceKind }))}
                style={inputStyle}
              >
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input placeholder="名稱" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} style={inputStyle} />
              <input placeholder="地址" value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input placeholder="緯度 lat" value={form.lat} onChange={(e) => setForm((c) => ({ ...c, lat: e.target.value }))} style={inputStyle} />
                <input placeholder="經度 lng" value={form.lng} onChange={(e) => setForm((c) => ({ ...c, lng: e.target.value }))} style={inputStyle} />
              </div>
              <Button disabled={busy} onClick={() => void addPlace()}>{busy ? '新增中…' : '加到地圖'}</Button>
              {notice && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{notice}</div>}
            </div>
          </Card>
        </div>

        <Card delay={0} style={{ padding: 0, overflow: 'hidden', minHeight: 720 }}>
          {selected?.lat != null && selected?.lng != null ? (
            <PlaceGlobe
              lat={mapLat}
              lng={mapLng}
              place={{
                name: selected.name,
                address: selected.address,
                note: selected.note,
                kind: selected.kind,
              }}
            />
          ) : (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--color-text-muted)' }}>
              請先選左側有座標的據點。
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function defaultKind(slug?: string): BrandPlaceKind {
  if (slug === 'taskgo') return 'site';
  if (slug === 'washgo') return 'store';
  return 'property';
}
