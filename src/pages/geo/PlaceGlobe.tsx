import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '@/lib/api';
import type { BrandPlaceKind, NearbyKind, NearbyPoi } from '@/types';

const CESIUM_VERSION = '1.134';
const CESIUM_JS = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Cesium.js`;
const CESIUM_CSS = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`;

const KIND_META: Record<NearbyKind, { label: string; color: string; glyph: string }> = {
  convenience: { label: '便利商店', color: '#2F9E44', glyph: '超' },
  bus: { label: '公車站', color: '#1C7ED6', glyph: '公' },
  transit: { label: '捷運／鐵路', color: '#E03131', glyph: '捷' },
  landmark: { label: '著名標的', color: '#F59F00', glyph: '地' },
  school: { label: '學校', color: '#7048E8', glyph: '學' },
  health: { label: '醫療藥局', color: '#D6336C', glyph: '醫' },
  park: { label: '公園', color: '#37B24D', glyph: '園' },
  daily: { label: '生活機能', color: '#0CA678', glyph: '生' },
};

const PLACE_COLOR = '#2F6B4F';

type CesiumAny = {
  Ion: { defaultAccessToken: string };
  Viewer: new (container: HTMLElement, options?: Record<string, unknown>) => CesiumViewer;
  Cartesian3: { fromDegrees: (lng: number, lat: number, height?: number) => unknown };
  Cartesian2: new (x: number, y: number) => unknown;
  Math: { toRadians: (value: number) => number };
  Color: { fromCssColorString: (value: string) => unknown; WHITE: unknown; BLACK: unknown };
  LabelStyle: { FILL_AND_OUTLINE: unknown };
  VerticalOrigin: { BOTTOM: unknown; TOP: unknown };
  HorizontalOrigin: { CENTER: unknown };
  HeightReference: { CLAMP_TO_GROUND: unknown; RELATIVE_TO_GROUND: unknown };
  NearFarScalar: new (near: number, nearValue: number, far: number, farValue: number) => unknown;
  createWorldTerrainAsync?: () => Promise<unknown>;
  createOsmBuildingsAsync?: () => Promise<unknown>;
};

interface CesiumViewer {
  camera: { flyTo: (options: Record<string, unknown>) => void };
  terrainProvider: unknown;
  scene: { primitives: { add: (item: unknown) => void } };
  entities: {
    add: (options: Record<string, unknown>) => { id: string };
    removeAll: () => void;
  };
  selectedEntity: { id?: string } | undefined;
  selectedEntityChanged: { addEventListener: (fn: () => void) => void };
  destroy: () => void;
}

declare global {
  interface Window {
    Cesium?: CesiumAny;
  }
}

function osmEmbedSrc(lat: number, lng: number) {
  const d = 0.012;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
}

function loadCesium(): Promise<CesiumAny> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CESIUM_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CESIUM_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${CESIUM_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium')));
      existing.addEventListener('error', () => reject(new Error('Cesium')));
      return;
    }
    const script = document.createElement('script');
    script.src = CESIUM_JS;
    script.async = true;
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium'));
    script.onerror = () => reject(new Error('Cesium'));
    document.head.appendChild(script);
  });
}

const pinCache = new Map<string, string>();

function pinDataUrl(color: string, glyph: string, large = false): string {
  const key = `${color}:${glyph}:${large ? 'lg' : 'sm'}`;
  const cached = pinCache.get(key);
  if (cached) return cached;
  const w = large ? 56 : 40;
  const h = large ? 72 : 52;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const r = w / 2 - 2;
  const cx = w / 2;
  const cy = r + 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.15, false);
  ctx.lineTo(cx, h - 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `bold ${large ? 16 : 12}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph.slice(0, 1), cx, cy + 1);
  const url = canvas.toDataURL('image/png');
  pinCache.set(key, url);
  return url;
}

function flyTo(viewer: CesiumViewer, cesium: CesiumAny, lat: number, lng: number) {
  viewer.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(lng, lat, 920),
    orientation: {
      heading: cesium.Math.toRadians(18),
      pitch: cesium.Math.toRadians(-32),
      roll: 0,
    },
    duration: 1.2,
  });
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

const overlayCard: CSSProperties = {
  background: 'rgba(11,18,32,0.86)',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: 1.5,
  backdropFilter: 'blur(8px)',
  maxWidth: 320,
};

export function PlaceGlobe({
  lat,
  lng,
  place,
}: {
  lat: number;
  lng: number;
  place?: {
    name: string;
    address?: string | null;
    note?: string | null;
    kind?: BrandPlaceKind;
  };
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const cesiumRef = useRef<CesiumAny | null>(null);
  const entityIdsRef = useRef<Map<string, NearbyPoi | 'place'>>(new Map());
  const [mode, setMode] = useState<'cesium' | 'osm'>('osm');
  const [pois, setPois] = useState<NearbyPoi[]>([]);
  const [nearbyNote, setNearbyNote] = useState('正在載入附近標的…');
  const [visibleKinds, setVisibleKinds] = useState<Record<NearbyKind, boolean>>({
    convenience: true,
    bus: true,
    transit: true,
    landmark: true,
    school: true,
    health: true,
    park: true,
    daily: true,
  });
  const [picked, setPicked] = useState<NearbyPoi | 'place' | null>('place');

  const visiblePois = useMemo(
    () => pois.filter((poi) => visibleKinds[poi.kind]),
    [pois, visibleKinds],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.globeConfig();
        if (cancelled || !cfg.cesiumIonToken || !hostRef.current) return;
        const Cesium = await loadCesium();
        if (cancelled || !hostRef.current) return;
        Cesium.Ion.defaultAccessToken = cfg.cesiumIonToken;
        const viewer = new Cesium.Viewer(hostRef.current, {
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          fullscreenButton: true,
          infoBox: false,
          selectionIndicator: true,
        });
        if (Cesium.createWorldTerrainAsync) {
          viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
        }
        if (Cesium.createOsmBuildingsAsync) {
          viewer.scene.primitives.add(await Cesium.createOsmBuildingsAsync());
        }
        viewer.selectedEntityChanged.addEventListener(() => {
          const id = viewer.selectedEntity?.id;
          if (!id) {
            setPicked('place');
            return;
          }
          setPicked(entityIdsRef.current.get(id) ?? 'place');
        });
        cesiumRef.current = Cesium;
        viewerRef.current = viewer;
        flyTo(viewer, Cesium, lat, lng);
        setMode('cesium');
      } catch {
        if (!cancelled) setMode('osm');
      }
    })();
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只初始化一次 Viewer
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNearbyNote('正在載入附近標的…');
    setPicked('place');
    void api.nearbyPlaces(lat, lng)
      .then((res) => {
        if (cancelled) return;
        setPois(res.pois);
        setNearbyNote(res.pois.length
          ? `${res.disclaimer} 共 ${res.pois.length} 處。`
          : (res.error ? '附近標的暫時抓不到，已先標示據點本身。' : '這附近 OpenStreetMap 還沒有足夠標的。'));
      })
      .catch(() => {
        if (cancelled) return;
        setPois([]);
        setNearbyNote('附近標的暫時抓不到，已先標示據點本身。');
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (mode !== 'cesium' || !viewer || !Cesium) return;
    viewer.entities.removeAll();
    entityIdsRef.current.clear();
    flyTo(viewer, Cesium, lat, lng);

    const placeEntity = viewer.entities.add({
      id: 'go-place',
      name: place?.name || '據點',
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 28),
      billboard: {
        image: pinDataUrl(PLACE_COLOR, '據', true),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      },
      label: {
        text: [place?.name || '據點', place?.address, place?.note].filter(Boolean).join('\n'),
        font: '14px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(11,18,32,0.82)'),
        backgroundPadding: new Cesium.Cartesian2(10, 8),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -78),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      },
    });
    entityIdsRef.current.set(placeEntity.id, 'place');
    viewer.selectedEntity = placeEntity;

    for (const poi of visiblePois) {
      const meta = KIND_META[poi.kind];
      const entity = viewer.entities.add({
        id: poi.id.replace('/', '-'),
        name: poi.name,
        position: Cesium.Cartesian3.fromDegrees(poi.lng, poi.lat, 16),
        billboard: {
          image: pinDataUrl(meta.color, meta.glyph),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(180, 1, 2200, 0.35),
        },
        label: {
          text: poi.name,
          font: '12px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(11,18,32,0.72)'),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -52),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(120, 1, 900, 0),
        },
      });
      entityIdsRef.current.set(entity.id, poi);
    }
  }, [mode, lat, lng, place?.name, place?.address, place?.note, visiblePois]);

  function toggleKind(kind: NearbyKind) {
    setVisibleKinds((current) => ({ ...current, [kind]: !current[kind] }));
  }

  const pickedPoi = picked && picked !== 'place' ? picked : null;
  const presentKinds = (Object.keys(KIND_META) as NearbyKind[]).filter((kind) => pois.some((poi) => poi.kind === kind));

  return (
    <div style={{ position: 'relative', minHeight: 720, background: '#0b1220' }}>
      <div
        ref={hostRef}
        style={{
          width: '100%',
          height: 720,
          display: mode === 'cesium' ? 'block' : 'none',
        }}
      />
      {mode === 'osm' && (
        <iframe
          title={place?.name || '據點地圖'}
          src={osmEmbedSrc(lat, lng)}
          style={{ width: '100%', height: 720, border: 0, display: 'block' }}
        />
      )}

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, display: 'grid', gap: 8 }}>
        <div style={overlayCard}>
          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>目前據點</div>
          <strong style={{ fontSize: 14 }}>{place?.name || '據點'}</strong>
          {place?.address && <div style={{ marginTop: 4 }}>{place.address}</div>}
          {place?.note && <div style={{ marginTop: 4, opacity: 0.88 }}>{place.note}</div>}
          <div style={{ marginTop: 6, opacity: 0.7 }}>{lat.toFixed(4)}, {lng.toFixed(4)}</div>
        </div>
        {pickedPoi && (
          <div style={{ ...overlayCard, borderLeft: `4px solid ${KIND_META[pickedPoi.kind].color}` }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{KIND_META[pickedPoi.kind].label}</div>
            <strong>{pickedPoi.name}</strong>
            <div style={{ marginTop: 4 }}>距離據點 {formatDistance(pickedPoi.distanceM)}</div>
            {pickedPoi.extra && <div style={{ opacity: 0.8 }}>{pickedPoi.extra}</div>}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', top: 48, right: 12, zIndex: 2, display: 'grid', gap: 8, justifyItems: 'end' }}>
        <div style={{ ...overlayCard, maxWidth: 280 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>地圖標註</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(presentKinds.length ? presentKinds : (Object.keys(KIND_META) as NearbyKind[])).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                style={{
                  fontSize: 11,
                  border: 0,
                  borderRadius: 999,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: visibleKinds[kind] ? KIND_META[kind].color : 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  opacity: visibleKinds[kind] ? 1 : 0.55,
                }}
              >
                {KIND_META[kind].glyph} {KIND_META[kind].label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, opacity: 0.78 }}>{nearbyNote}</div>
        </div>
        {visiblePois.length > 0 && (
          <div style={{ ...overlayCard, maxHeight: 280, overflow: 'auto', maxWidth: 280 }}>
            {visiblePois.slice(0, 14).map((poi) => (
              <button
                key={poi.id}
                type="button"
                onClick={() => {
                  setPicked(poi);
                  const viewer = viewerRef.current;
                  const Cesium = cesiumRef.current;
                  if (viewer && Cesium) {
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(poi.lng, poi.lat, 380),
                      orientation: {
                        heading: Cesium.Math.toRadians(18),
                        pitch: Cesium.Math.toRadians(-42),
                        roll: 0,
                      },
                      duration: 0.8,
                    });
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 0,
                  color: '#fff',
                  padding: '6px 0',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ color: KIND_META[poi.kind].color, marginRight: 6 }}>{KIND_META[poi.kind].glyph}</span>
                {poi.name}
                <span style={{ float: 'right', opacity: 0.7 }}>{formatDistance(poi.distanceM)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
