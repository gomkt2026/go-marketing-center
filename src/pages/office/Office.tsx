import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { createOfficeAmbience } from './office-audio';
import type { OfficeAgent, OfficeSnapshot } from './types';
import './office.css';

const ROOM_W = 1120;
const ROOM_H = 840;

const STATIONS = [
  { role: 'brand_ai', slug: 'taskgo', name: '阿豪', x: 40, y: 236, mat: '#e2a23a', screen: 'jobs', portrait: '/brands/taskgo-ahao.png', crop: 'center 14%' },
  { role: 'brand_ai', slug: 'homigo', name: '小咪', x: 52, y: 430, mat: '#d9c7a6', screen: 'homes', portrait: '/brands/homigo-xiaomi.png', crop: 'center 16%' },
  { role: 'brand_ai', slug: 'washgo', name: '阿樂', x: 36, y: 624, mat: '#7eb6e0', screen: 'laundry', portrait: '/brands/washgo-ale.png', crop: 'center 18%' },
  { role: 'market_analyst', slug: null, name: '新聞收集', x: 640, y: 228, mat: '#b7ddd4', screen: 'ticker', portrait: '/office/cast-news.jpg', crop: 'center 18%' },
  { role: 'content_strategist', slug: null, name: '行銷小編', x: 872, y: 240, mat: '#f2c14e', screen: 'plan', portrait: '/office/cast-strategy.jpg', crop: 'center 16%' },
  { role: 'publisher', slug: null, name: '發文小編', x: 656, y: 424, mat: '#7ee0ff', screen: 'queue', portrait: '/office/cast-publisher.jpg', crop: 'center 20%' },
  { role: 'podcast_producer', slug: null, name: 'Podcast小編', x: 860, y: 436, mat: '#f0b429', screen: 'wave', portrait: '/office/cast-podcast.jpg', crop: 'center 14%' },
  { role: 'art_director', slug: null, name: '圖片小編', x: 644, y: 616, mat: '#f4a6c4', screen: 'swatch', portrait: '/office/cast-art.jpg', crop: 'center 10%' },
  { role: 'video_editor', slug: null, name: '影片小編', x: 876, y: 628, mat: '#b9a6ff', screen: 'timeline', portrait: '/office/cast-video.jpg', crop: 'center 12%' },
] as const;

type Station = (typeof STATIONS)[number];
type ScreenKind = Station['screen'];

const WINDOW_LIGHTS = [
  { l: '22%', t: '36%', d: '0s' },
  { l: '34%', t: '52%', d: '1.1s' },
  { l: '46%', t: '34%', d: '0.4s' },
  { l: '58%', t: '58%', d: '1.8s' },
  { l: '70%', t: '40%', d: '0.9s' },
  { l: '80%', t: '62%', d: '1.5s' },
];

function matchAgent(agents: OfficeAgent[], station: Station) {
  return agents.find((agent) => agent.roleCode === station.role && (agent.brandSlug ?? null) === station.slug);
}

function nickname(agent: OfficeAgent | undefined, fallback: string) {
  return agent?.persona.nickname || agent?.displayName || fallback;
}

function themeFor(data: OfficeSnapshot | null, slug: string | null) {
  if (!slug) return '';
  return data?.standup?.directive?.brands?.find((brand) => brand.slug === slug)?.theme ?? '';
}

function screenCopy(station: Station, agent: OfficeAgent | undefined, data: OfficeSnapshot | null) {
  const task = agent?.task ?? '';
  const theme = themeFor(data, station.slug);
  const line = (theme || task || '等下一班晨會').replace(/\s+/g, ' ');
  if (station.screen === 'ticker') {
    const titles = (data?.signals ?? []).map((signal) => signal.title).filter(Boolean).slice(0, 4);
    return { title: '新聞', line: titles.length ? titles.join('  ·  ') : '在收頭條' };
  }
  if (station.screen === 'wave') {
    const episode = data?.podcasts?.[0];
    return { title: '錄音', line: episode?.title || data?.standup?.directive?.podcastTopic || '等這一集的題目' };
  }
  if (station.screen === 'timeline') {
    const video = data?.videos?.[0];
    return { title: '剪接', line: video?.title || '在等素材' };
  }
  if (station.screen === 'swatch') return { title: '配圖', line: data?.standup?.directive?.imageBrief || line };
  if (station.screen === 'plan') return { title: '策略', line };
  if (station.screen === 'queue') return { title: '排程', line };
  if (station.screen === 'jobs') return { title: '派工', line };
  if (station.screen === 'homes') return { title: '物件', line };
  return { title: '洗衣', line };
}

function manuscriptHref(agent: OfficeAgent): string | null {
  if (agent.preview?.slug) return `/${agent.preview.slug}/schedule`;
  if (agent.roleCode === 'brand_ai' && agent.brandSlug) return `/${agent.brandSlug}/schedule`;
  if (agent.roleCode === 'market_analyst') return '/trending';
  if (agent.roleCode === 'podcast_producer') return '/podcast';
  if (agent.roleCode === 'publisher') return '/taskgo/schedule';
  if (agent.roleCode === 'video_editor') return '/taskgo/shorts';
  if (agent.roleCode === 'art_director' && agent.preview?.slug) return `/${agent.preview.slug}/schedule`;
  return null;
}

function taipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { h: pick('hour'), m: pick('minute'), s: pick('second') };
}

function Face({ src, crop, alt, tint }: { src: string; crop: string; alt: string; tint: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <span className="face-fallback" style={{ background: tint }}>{alt.slice(0, 1)}</span>;
  }
  return <img className="portrait" src={src} alt="" style={{ objectPosition: crop }} onError={() => setOk(false)} />;
}

function Monitor({ kind, title, line }: { kind: ScreenKind; title: string; line: string }) {
  return (
    <div className={`monitor kind-${kind}`}>
      <div className="bezel">
        <div className="screen">
          {kind === 'wave' && (
            <div className="wave" aria-hidden>
              {Array.from({ length: 7 }, (_, i) => <b key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
            </div>
          )}
          {kind === 'swatch' && <div className="swatches" aria-hidden><i /><i /><i /><i /></div>}
          {kind === 'timeline' && <div className="timeline" aria-hidden><b /></div>}
          {kind === 'ticker' && (
            <div className="ticker" aria-hidden>
              <div className="ticker-move"><span>{line}</span><span>{line}</span></div>
            </div>
          )}
          {kind === 'queue' && (
            <div className="queue" aria-hidden><em>FB</em><em>IG</em><em>Threads</em></div>
          )}
          {kind === 'plan' && (
            <div className="chips" aria-hidden><b>豪</b><b>咪</b><b>樂</b></div>
          )}
          <strong>{title}</strong>
          {kind !== 'ticker' && <small>{line}</small>}
        </div>
        <i className="led" />
      </div>
      <i className="stand" />
      <i className="foot" />
    </div>
  );
}

function WindowPane({ moon }: { moon?: boolean }) {
  return (
    <div className="window">
      <div className="sky">
        {moon && <i className="moon" />}
        <i className="bldg b1" />
        <i className="bldg b2" />
        <i className="bldg b3" />
        {WINDOW_LIGHTS.map((light) => (
          <i key={`${light.l}-${light.t}`} className="win-light" style={{ left: light.l, top: light.t, animationDelay: light.d }} />
        ))}
      </div>
    </div>
  );
}

export function Office() {
  const [data, setData] = useState<OfficeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [bubbleAt, setBubbleAt] = useState(0);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [scale, setScale] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const [musicOn, setMusicOn] = useState(false);
  const fitRef = useRef<HTMLDivElement>(null);
  const ambience = useRef<ReturnType<typeof createOfficeAmbience> | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const next = await api.office();
        if (!stop) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : '載入失敗');
      } finally {
        if (!stop) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 45000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    ambience.current = createOfficeAmbience();
    return () => ambience.current?.dispose();
  }, []);

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const widthScale = rect.width / ROOM_W;
      const heightScale = rect.height / ROOM_H;
      const next = rect.width < 900
        ? Math.min(1, Math.max(widthScale, heightScale))
        : Math.min(widthScale, heightScale);
      if (next > 0.2) setScale(next);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bubbles = data?.standup?.bubbles ?? [];
  const meeting = useMemo(() => {
    if (!data?.standup || data.standup.status !== 'completed') return false;
    return Date.now() - new Date(data.standup.started_at).getTime() < 8 * 60 * 1000;
  }, [data]);

  useEffect(() => {
    if (!meeting || bubbles.length < 2) return;
    const timer = window.setInterval(() => setBubbleAt((n) => n + 1), 2600);
    return () => window.clearInterval(timer);
  }, [meeting, bubbles.length]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const counts = useMemo(() => {
    const agents = data?.agents ?? [];
    const working = agents.filter((agent) => agent.status === 'working').length;
    const done = agents.filter((agent) => agent.status === 'done').length;
    const blocked = agents.filter((agent) => agent.status === 'blocked').length;
    return { idle: Math.max(0, agents.length - working - done - blocked), working, done, blocked };
  }, [data]);

  const chosen = data?.agents.find((agent) => agent.id === selected) ?? null;
  const visibleBubbles = meeting ? bubbles.slice(bubbleAt % Math.max(bubbles.length, 1)).slice(0, 3) : [];
  const clock = taipeiParts(now);
  const brands = data?.standup?.directive?.brands ?? [];
  const spend = data?.monthSpendUsd ?? 0;
  const budget = data?.budgetUsd || 40;
  const spendPct = Math.max(4, Math.min(100, (spend / budget) * 100));

  async function toggle() {
    if (!data || switchBusy) return;
    setSwitchBusy(true);
    try {
      await api.setOfficePublish(!data.autoPublish);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '開關失敗');
    } finally {
      setSwitchBusy(false);
    }
  }

  function toggleMusic() {
    if (musicOn) {
      ambience.current?.stop();
      setMusicOn(false);
      return;
    }
    ambience.current?.start();
    setMusicOn(true);
  }

  return (
    <div className={`office-page${meeting ? ' is-meeting' : ''}`}>
      <header className="office-hud">
        <div className="office-title">
          Go 行銷辦公室
          <small>{data?.quiet ? '凌晨這一班只留方向，八點才發' : '點一個人，看他現在坐在哪一台電腦'}</small>
        </div>
        <div className="office-counts">
          <span>閒置 {counts.idle}</span>
          <span>工作中 {counts.working}</span>
          <span>完成 {counts.done}</span>
          {counts.blocked > 0 && <span>卡住 {counts.blocked}</span>}
          <button type="button" className={`office-music${musicOn ? ' is-on' : ''}`} aria-pressed={musicOn} onClick={toggleMusic}>
            <span className="eq" aria-hidden><i /><i /><i /></span>
            {musicOn ? '音樂開著' : '播放音樂'}
          </button>
          <button type="button" className={`office-switch${data?.autoPublish === false ? ' is-off' : ''}`} onClick={() => void toggle()} disabled={!data || switchBusy}>
            {data?.autoPublish === false ? '自動發文關著' : '自動發文開著'}
          </button>
        </div>
      </header>
      {data?.standup?.note && <div className="office-note">{data.standup.note}</div>}
      {error && <div className="office-note">{error}</div>}
      {loading && !data && <div className="office-note">辦公室正在亮燈…</div>}

      <div className="office-fit" ref={fitRef}>
        <div className="office-scaler" style={{ width: ROOM_W * scale, height: ROOM_H * scale }}>
          <div className="office-room" style={{ width: ROOM_W, height: ROOM_H, transform: `scale(${scale})` }}>
            <div className="wall" />
            <div className="floor" />
            <div className="baseboard" />
            <i className="pendant left" />
            <i className="pendant right" />

            <div className="whiteboard">
              <strong>這一班</strong>
              {brands.length === 0 && <p>等人來開會</p>}
              {brands.map((brand) => (
                <p key={brand.slug}><b>{brand.slug === 'taskgo' ? '阿豪' : brand.slug === 'homigo' ? '小咪' : '阿樂'}</b>{brand.theme}</p>
              ))}
            </div>
            <div className="windows">
              <WindowPane />
              <WindowPane moon />
              <WindowPane />
            </div>
            <div className="clock" aria-hidden>
              <i className="hand hour" style={{ transform: `rotate(${(clock.h % 12) * 30 + clock.m * 0.5}deg)` }} />
              <i className="hand min" style={{ transform: `rotate(${clock.m * 6}deg)` }} />
              <i className="hand sec" style={{ transform: `rotate(${clock.s * 6}deg)` }} />
            </div>
            <div className="usage">
              <span>晨會額度</span>
              <strong>${spend.toFixed(2)}</strong>
              <small> / ${budget}</small>
              <i style={{ width: `${spendPct}%` }} />
            </div>
            <div className="rack" aria-hidden>{Array.from({ length: 5 }, (_, i) => <b key={i} />)}</div>

            <div className="carpet brand" />
            <div className="carpet market" />
            <div className="shelf" aria-hidden><i /><i /><i /><i /></div>
            <div className="plant" aria-hidden><i className="leaf a" /><i className="leaf b" /><i className="leaf c" /><i className="pot" /></div>

            <div className="lounge">
              <div className="sofa" />
              <div className="coffee">
                <i className="mug" />
                <i className="steam" />
              </div>
              {meeting && <div className="meet-flag">晨會中</div>}
              {meeting && visibleBubbles.length > 0 && (
                <div className="office-bubbles">
                  {visibleBubbles.map((bubble) => (
                    <p key={`${bubble.who}-${bubble.text}`}><b>{bubble.who}</b>{bubble.text}</p>
                  ))}
                </div>
              )}
            </div>

            {STATIONS.map((station, index) => {
              const agent = data ? matchAgent(data.agents, station) : undefined;
              const label = nickname(agent, station.name);
              const copy = screenCopy(station, agent, data);
              const saying = visibleBubbles.find((bubble) => bubble.who === label);
              const status = agent?.status ?? 'done';
              return (
                <button
                  key={`${station.role}-${station.slug ?? 'x'}`}
                  type="button"
                  className={`station is-${status}${selected && agent?.id === selected ? ' is-picked' : ''}${saying ? ' is-speaking' : ''}`}
                  style={{ left: station.x, top: station.y, zIndex: 10 + index, ['--mat' as string]: station.mat, animationDelay: `${index * 0.35}s` }}
                  aria-label={`${label}，${agent?.task ?? '等下一班晨會'}`}
                  onClick={() => agent && setSelected(agent.id)}
                >
                  <span className="tip">{agent?.task ?? '等下一班晨會'}</span>
                  {saying && <span className="say">{saying.text}</span>}
                  <span className="chair" />
                  <span className="who" style={{ animationDelay: `${index * 0.4}s` }}>
                    <Face src={station.portrait} crop={station.crop} alt={label} tint={station.mat} />
                  </span>
                  <Monitor kind={station.screen} title={copy.title} line={copy.line} />
                  <span className="desk">
                    <span className="keys" aria-hidden><b /><b /><b /><b /><b /></span>
                    <strong>{label}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {chosen && (
        <aside className="office-panel">
          <button type="button" className="office-close" onClick={() => setSelected(null)} aria-label="關閉">×</button>
          <h2>{nickname(chosen, chosen.displayName)}</h2>
          <div className="role">{chosen.persona.characterTitle}</div>
          <p className="task">{chosen.task}</p>
          {chosen.persona.catchphrase && <p className="quote">「{chosen.persona.catchphrase}」</p>}
          {chosen.persona.focus && <p className="meta">{chosen.persona.focus}</p>}
          {chosen.roleCode === 'content_strategist' && (
            <ul>
              {(data?.standup?.directive?.brands ?? []).map((brand) => (
                <li key={brand.slug}>{brand.slug}：{brand.theme}</li>
              ))}
            </ul>
          )}
          {chosen.roleCode === 'market_analyst' && (
            <ul>
              {(data?.signals ?? []).map((signal) => <li key={signal.id}>{signal.title}</li>)}
            </ul>
          )}
          {chosen.roleCode === 'podcast_producer' && (
            <ul>
              {(data?.podcasts ?? []).map((episode) => <li key={episode.id}>{episode.title}（{episode.status}）</li>)}
              {data?.standup?.directive?.podcastTopic && <li>下一題：{data.standup.directive.podcastTopic}</li>}
            </ul>
          )}
          {chosen.roleCode === 'video_editor' && (
            <ul>
              {(data?.videos ?? []).length
                ? data!.videos.map((video) => <li key={video.id}>{video.title}（{video.status}）</li>)
                : <li>在等素材，這班不剪新片</li>}
            </ul>
          )}
          {chosen.roleCode === 'brand_ai' && (
            <ul>
              {(data?.findings ?? []).filter((finding) => finding.slug === chosen.brandSlug).map((finding) => (
                <li key={finding.summary}>{finding.summary}</li>
              ))}
            </ul>
          )}
          {chosen.preview?.body && <p className="meta">{chosen.preview.body}</p>}
          {chosen.preview?.file_url && <img src={chosen.preview.file_url} alt="" />}
          {manuscriptHref(chosen) && <p><Link to={manuscriptHref(chosen)!}>打開原稿</Link></p>}
        </aside>
      )}
    </div>
  );
}
