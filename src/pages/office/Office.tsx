import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { api, publicApi } from '@/lib/api';
import { createOfficeAmbience, type DanceKind } from './office-audio';
import { bbboxAsk, bbboxBoard, bbboxDraftCounts, bbboxHref, bbboxMoment, bbboxReply, bbboxScreenCopy, BBBOX_STATIONS, loadBbboxOffice } from './bbbox-room';
import { compactNumber, deskWork, liveAsk, nextBoard, officeMoment, officeReply, type Ask, type LiveReply } from './talk';
import type { OfficeAgent, OfficeSnapshot, OfficeStatPeriod } from './types';
import './office.css';

const ROOM_W = 1120;
const ROOM_H = 840;

const STATIONS = [
  { role: 'brand_ai', slug: 'taskgo', name: '阿豪', x: 40, y: 292, mat: '#e2a23a', screen: 'jobs', portrait: '/brands/taskgo-ahao.png', crop: 'center 14%' },
  { role: 'brand_ai', slug: 'homigo', name: '小咪', x: 52, y: 430, mat: '#d9c7a6', screen: 'homes', portrait: '/brands/homigo-xiaomi.png', crop: 'center 16%' },
  { role: 'brand_ai', slug: 'washgo', name: '阿樂', x: 36, y: 624, mat: '#7eb6e0', screen: 'laundry', portrait: '/brands/washgo-ale.png', crop: 'center 18%' },
  { role: 'market_analyst', slug: null, name: '新聞收集', x: 640, y: 300, mat: '#b7ddd4', screen: 'ticker', portrait: '/office/cast-news.jpg', crop: 'center 18%' },
  { role: 'content_strategist', slug: null, name: '行銷小編', x: 872, y: 308, mat: '#f2c14e', screen: 'plan', portrait: '/office/cast-strategy.jpg', crop: 'center 16%' },
  { role: 'publisher', slug: null, name: '發文小編', x: 656, y: 424, mat: '#7ee0ff', screen: 'queue', portrait: '/office/cast-publisher.jpg', crop: 'center 20%' },
  { role: 'podcast_producer', slug: null, name: 'Podcast小編', x: 860, y: 436, mat: '#f0b429', screen: 'wave', portrait: '/office/cast-podcast.jpg', crop: 'center 14%' },
  { role: 'art_director', slug: null, name: '圖片小編', x: 644, y: 616, mat: '#f4a6c4', screen: 'swatch', portrait: '/office/cast-art.jpg', crop: 'center 10%' },
  { role: 'video_editor', slug: null, name: '影片小編', x: 876, y: 628, mat: '#b9a6ff', screen: 'timeline', portrait: '/office/cast-video.jpg', crop: 'center 12%' },
] as const;

type Station = (typeof STATIONS)[number];
type ScreenKind = Station['screen'] | 'cabin';

const DANCE_SPOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => ({
  x: 168 + index * 88,
  y: 668,
}));

const BRAND_ORDER = ['taskgo', 'homigo', 'washgo'] as const;
const BRAND_LABEL: Record<string, string> = { taskgo: 'TaskGo', homigo: 'Homigo', washgo: 'Washgo' };

function stationKey(station: { role: string; slug: string | null }) {
  return `${station.role}-${station.slug ?? 'x'}`;
}

const WINDOW_LIGHTS = [
  { l: '22%', t: '36%', d: '0s' },
  { l: '34%', t: '52%', d: '1.1s' },
  { l: '46%', t: '34%', d: '0.4s' },
  { l: '58%', t: '58%', d: '1.8s' },
  { l: '70%', t: '40%', d: '0.9s' },
  { l: '80%', t: '62%', d: '1.5s' },
];

function matchAgent(agents: OfficeAgent[], station: { role: string; slug: string | null }) {
  return agents.find((agent) => agent.roleCode === station.role && (agent.brandSlug ?? null) === station.slug);
}

function nickname(agent: OfficeAgent | undefined, fallback: string) {
  return agent?.persona.nickname || agent?.displayName || fallback;
}

function themeFor(data: OfficeSnapshot | null, slug: string | null) {
  if (!slug) return '';
  return data?.standup?.directive?.brands?.find((brand) => brand.slug === slug)?.theme ?? '';
}

function screenCopy(station: Station, agent: OfficeAgent | undefined, data: OfficeSnapshot | null, beat = 0) {
  const task = agent?.task ?? '';
  const theme = themeFor(data, station.slug);
  const line = (theme || task || '等下一班晨會').replace(/\s+/g, ' ');
  const work = deskWork(station.name, beat);
  if (agent?.status === 'blocked' && task.trim()) {
    return { title: work?.title ?? '卡住', line: task.trim() };
  }
  if (station.screen === 'ticker') {
    const titles = (data?.keywords ?? []).filter(Boolean).slice(0, 8);
    return { title: '熱門', line: titles.length ? titles.join('  ·  ') : '在收頭條' };
  }
  if (station.screen === 'wave') {
    const episode = data?.podcasts?.[0];
    return { title: '對稿', line: episode?.title || data?.standup?.directive?.podcastTopic || work?.line || '在對這一集的場面' };
  }
  if (station.screen === 'timeline') {
    const video = data?.videos?.[0];
    return { title: '剪片', line: video?.title || work?.line || '在等素材' };
  }
  if (work) return work;
  if (station.screen === 'swatch') return { title: '配圖', line: data?.standup?.directive?.imageBrief || line };
  if (station.screen === 'plan') return { title: '策略', line };
  if (station.screen === 'queue') return { title: 'PO文', line };
  if (station.screen === 'jobs') return { title: '報價', line };
  if (station.screen === 'homes') return { title: '管理', line };
  return { title: '洗滌', line };
}

function standupSummary(standup: NonNullable<OfficeSnapshot['standup']>): string {
  const names: Record<string, string> = { homigo: 'Homigo', taskgo: 'TaskGo', washgo: 'Washgo', bbbox: '和居家居' };
  const themes = (standup.directive?.brands ?? [])
    .map((brand) => {
      const theme = brand.theme?.replace(/\s+/g, ' ').trim();
      return theme ? `${names[brand.slug] ?? brand.slug}：${theme}` : '';
    })
    .filter(Boolean);
  if (themes.length) return `這一班：${themes.join('　')}`;
  const said = (standup.bubbles ?? []).slice(0, 3)
    .map((bubble) => `${bubble.who}：${bubble.text.replace(/\s+/g, ' ').trim()}`)
    .filter((line) => line.length > 1);
  return said.join('　');
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
  const [ok, setOk] = useState(Boolean(src));
  if (!ok || !src) {
    return <span className="face-fallback" style={{ background: tint }}>{alt.slice(0, 1)}</span>;
  }
  return (
    <img
      className={`portrait${src.includes('bbbox-logo') ? ' is-logo' : ''}`}
      src={src}
      alt=""
      style={{ objectPosition: crop }}
      onError={() => setOk(false)}
    />
  );
}

function Monitor({ kind, title, line, marks }: { kind: ScreenKind; title: string; line: string; marks?: string[] }) {
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
            <div className="chips" aria-hidden>{(marks ?? ['豪', '咪', '樂']).map((mark) => <b key={mark}>{mark}</b>)}</div>
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

function TypedText({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length);
      return;
    }
    const timer = window.setInterval(() => {
      setCount((value) => (value >= text.length ? value : value + 1));
    }, 22);
    return () => window.clearInterval(timer);
  }, [text]);
  return <>{text.slice(0, count)}</>;
}

function skyPhase(hour: number): 'dawn' | 'day' | 'dusk' | 'night' {
  if (hour >= 6 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 16) return 'day';
  if (hour >= 16 && hour < 19) return 'dusk';
  return 'night';
}

function WindowPane({ phase, moon }: { phase: 'dawn' | 'day' | 'dusk' | 'night'; moon?: boolean }) {
  return (
    <div className="window">
      <div className={`sky is-${phase}`}>
        {phase === 'day' && <i className="sun" />}
        {phase === 'night' && moon && <i className="moon" />}
        <i className="bldg b1" />
        <i className="bldg b2" />
        <i className="bldg b3" />
        {(phase === 'night' || phase === 'dusk') && WINDOW_LIGHTS.map((light) => (
          <i key={`${light.l}-${light.t}`} className="win-light" style={{ left: light.l, top: light.t, animationDelay: light.d }} />
        ))}
      </div>
    </div>
  );
}

function ClockHands() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = taipeiParts(now);
  return (
    <>
      <i className="hand hour" style={{ transform: `rotate(${(clock.h % 12) * 30 + clock.m * 0.5}deg)` }} />
      <i className="hand min" style={{ transform: `rotate(${clock.m * 6}deg)` }} />
      <i className="hand sec" style={{ transform: `rotate(${clock.s * 6}deg)` }} />
    </>
  );
}

function OfficeSky() {
  const [hour, setHour] = useState(() => taipeiParts(new Date()).h);
  useEffect(() => {
    const timer = window.setInterval(() => setHour(taipeiParts(new Date()).h), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const phase = skyPhase(hour);
  return (
    <>
      <div className="windows">
        <WindowPane phase={phase} />
        <WindowPane phase={phase} moon />
        <WindowPane phase={phase} />
      </div>
      <div className="clock" aria-hidden>
        <ClockHands />
      </div>
    </>
  );
}

function FloatingTalk({
  rootRef,
  notes,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  notes: { id: string; who: string; text: string }[];
}) {
  const [spots, setSpots] = useState<{ id: string; who: string; text: string; x: number; y: number }[]>([]);
  const signature = notes.map((note) => `${note.id}\u0000${note.who}\u0000${note.text}`).join('\u0001');

  useEffect(() => {
    const root = rootRef.current;
    if (!root || notes.length === 0) {
      setSpots([]);
      return;
    }
    let last = '';
    const place = () => {
      if (document.hidden) return;
      const host = root.getBoundingClientRect();
      const compact = host.width < 720;
      const shown = compact ? notes.slice(0, 1) : notes;
      const next = shown.map((note) => {
        if (compact) return { ...note, x: host.width / 2, y: 8 };
        const who = CSS.escape(note.who);
        const el = root.querySelector(`[data-who="${who}"]`) ?? root.querySelector(`[data-station="${who}"]`);
        const rect = el?.getBoundingClientRect();
        const rawX = rect ? rect.left + rect.width / 2 - host.left : host.width / 2;
        const rawY = rect ? rect.top - host.top : 120;
        const edge = Math.max(24, Math.min(150, host.width * 0.32));
        const x = Math.min(host.width - edge, Math.max(edge, rawX));
        const y = Math.max(28, rawY);
        return { ...note, x, y };
      });
      const mark = next.map((spot) => `${spot.id}:${Math.round(spot.x)}:${Math.round(spot.y)}`).join('|');
      if (mark !== last) {
        last = mark;
        setSpots(next);
      }
    };
    place();
    const timer = window.setInterval(place, 500);
    return () => window.clearInterval(timer);
  }, [rootRef, signature]);

  if (spots.length === 0) return null;
  return (
    <div className="float-layer" aria-live="polite">
      {spots.map((spot, index) => (
        <div
          key={spot.id}
          className={`float-card${spot.y <= 8 ? ' is-docked' : ''}`}
          style={{ left: spot.x, top: spot.y, transform: spot.y <= 8 ? 'translate(-50%, 0)' : `translate(-50%, calc(-100% - ${8 + (index % 2) * 36}px))` }}
        >
          <b>{spot.who}</b>
          <span>{spot.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Office({ view = false, room = 'go' }: { view?: boolean; room?: 'go' | 'bbbox' }) {
  const stations = room === 'bbbox' ? BBBOX_STATIONS : STATIONS;
  const [data, setData] = useState<OfficeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [bubbleAt, setBubbleAt] = useState(0);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [scale, setScale] = useState(1);
  const [musicOn, setMusicOn] = useState(false);
  const [demo, setDemo] = useState(false);
  const [ask, setAsk] = useState<Ask>('now');
  const [period, setPeriod] = useState<OfficeStatPeriod>('28');
  const [walks, setWalks] = useState<Record<string, { x: number; y: number }>>({});
  const [chat, setChat] = useState<{ who: string; text: string }[] | null>(null);
  const [beat, setBeat] = useState(0);
  const beatRef = useRef(0);
  const [dance, setDance] = useState<DanceKind | null>(null);
  const danceTimer = useRef(0);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState('');
  const [spoken, setSpoken] = useState<LiveReply | null>(null);
  const [said, setSaid] = useState<{ agentId: string; line: string } | null>(null);
  const [roster, setRoster] = useState<'done' | 'blocked' | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const peekTimer = useRef(0);
  const fitRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const ambience = useRef<ReturnType<typeof createOfficeAmbience> | null>(null);
  const dataRef = useRef(data);
  const selectedRef = useRef(selected);
  dataRef.current = data;
  selectedRef.current = selected;

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const next = room === 'bbbox'
          ? await loadBbboxOffice()
          : view ? await publicApi.officeLive() : await api.office();
        if (!stop) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!stop && !dataRef.current) setError(e instanceof Error ? e.message : '載入失敗');
      } finally {
        if (!stop) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 45000);
    const onShow = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [tick, view, room]);

  useEffect(() => {
    ambience.current = createOfficeAmbience();
    return () => {
      window.clearTimeout(danceTimer.current);
      ambience.current?.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    let timer = 0;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const widthScale = Math.max(0, rect.width - 16) / ROOM_W;
      const heightScale = Math.max(0, rect.height - 16) / ROOM_H;
      const next = Math.min(widthScale, heightScale);
      if (next > 0.05) setScale((current) => (Math.abs(current - next) > 0.02 ? next : current));
    };
    apply();
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 150);
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
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
    setAsk('now');
    setNote('');
    setNoteSaved('');
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  useEffect(() => {
    const onFull = () => {
      if (!document.fullscreenElement) setDemo(false);
    };
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  useEffect(() => {
    if (dance) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (meeting) return;
    let alive = true;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
    };
    const meet = () => {
      if (!alive) return;
      const snapshot = dataRef.current;
      const picked = selectedRef.current;
      const idle = stations.filter((station) => {
        const agent = snapshot ? matchAgent(snapshot.agents, station) : undefined;
        if (agent?.id && agent.id === picked) return false;
        return (agent?.status ?? 'done') !== 'working';
      });
      if (!idle.length) {
        later(meet, 8000);
        return;
      }
      const moment = room === 'bbbox'
        ? bbboxMoment(idle.map((station) => station.name), beatRef.current)
        : officeMoment(idle.map((station) => station.name), snapshot, beatRef.current);
      beatRef.current += 1;
      setBeat(beatRef.current);
      if (moment.gather) {
        const spots: Record<string, { x: number; y: number }> = {};
        moment.who.forEach((name, index) => {
          const station = stations.find((item) => item.name === name);
          if (!station) return;
          spots[stationKey(station)] = index === 0 ? { x: 430, y: 530 } : { x: 536, y: 530 };
        });
        setWalks(spots);
      } else {
        setWalks({});
      }
      later(() => {
        if (!alive) return;
        setChat(moment.lines);
        const talk = moment.gather ? 6200 : 4600;
        later(() => {
          if (!alive) return;
          setWalks({});
          setChat(null);
          later(meet, moment.gather ? 2800 : 1400);
        }, talk);
      }, moment.gather ? 2800 : 250);
    };
    later(meet, 1800);
    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
      setChat(null);
    };
  }, [selected, meeting, dance, room, stations]);

  const counts = useMemo(() => {
    const agents = data?.agents ?? [];
    const working = agents.filter((agent) => agent.status === 'working').length;
    const done = agents.filter((agent) => agent.status === 'done').length;
    const blocked = agents.filter((agent) => agent.status === 'blocked').length;
    return { idle: Math.max(0, agents.length - working - done - blocked), working, done, blocked };
  }, [data]);

  const rosterRows = useMemo(() => {
    if (!roster || !data) return [];
    return stations.flatMap((station) => {
      const agent = matchAgent(data.agents, station);
      if (!agent || agent.status !== roster) return [];
      const task = agent.task?.trim() || (roster === 'blocked' ? '卡住了，原因沒寫下來' : '完成了，結果沒寫下來');
      const piece = agent.preview?.title ? `《${agent.preview.title}》` : '';
      const excerpt = agent.preview?.body?.replace(/\s+/g, ' ').trim().slice(0, 90) ?? '';
      return [{
        id: agent.id,
        name: nickname(agent, station.name),
        task,
        piece,
        excerpt,
        href: room === 'bbbox' ? bbboxHref(agent.roleCode) : manuscriptHref(agent),
      }];
    });
  }, [roster, data, stations, room]);

  const chosen = data?.agents.find((agent) => agent.id === selected) ?? null;
  const visibleBubbles = meeting ? bubbles.slice(bubbleAt % Math.max(bubbles.length, 1)).slice(0, 3) : [];
  const floatNotes = useMemo(() => {
    const notes: { id: string; who: string; text: string }[] = [];
    const seen = new Set<string>();
    const add = (id: string, who: string, text: string) => {
      const line = text.replace(/\s+/g, ' ').trim();
      if (!who || !line || seen.has(who)) return;
      seen.add(who);
      notes.push({ id, who, text: line });
    };
    chat?.forEach((line, index) => add(`chat-${index}`, line.who, line.text));
    if (said) {
      const speaker = data?.agents.find((agent) => agent.id === said.agentId);
      const station = stations.find((item) => speaker && matchAgent([speaker], item));
      add('said', speaker ? nickname(speaker, station?.name ?? '') : station?.name ?? '', said.line);
    }
    visibleBubbles.forEach((bubble, index) => add(`meet-${index}`, bubble.who, bubble.text));
    if (selected) {
      const speaker = data?.agents.find((agent) => agent.id === selected);
      const station = stations.find((item) => speaker && matchAgent([speaker], item));
      if (station) {
        const copy = room === 'bbbox'
          ? bbboxScreenCopy(station.name, speaker?.task ?? '', beat, data?.keywords ?? [])
          : screenCopy(station as Station, speaker, data, beat);
        add('selected', nickname(speaker, station.name), speaker?.task?.trim() || copy.line);
      }
    }
    if (peek) {
      const station = stations.find((item) => item.name === peek) ?? stations.find((item) => {
        const agent = data ? matchAgent(data.agents, item) : undefined;
        return nickname(agent, item.name) === peek;
      });
      if (station) {
        const agent = data ? matchAgent(data.agents, station) : undefined;
        const copy = room === 'bbbox'
          ? bbboxScreenCopy(station.name, agent?.task ?? '', beat, data?.keywords ?? [])
          : screenCopy(station as Station, agent, data, beat);
        add('peek', nickname(agent, station.name), agent?.task?.trim() || copy.line);
      }
    }
    return notes.slice(0, 4);
  }, [chat, said, visibleBubbles, peek, data, room, stations, beat]);
  const showPeek = (who: string) => {
    window.clearTimeout(peekTimer.current);
    setPeek(who);
  };
  const hidePeek = () => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(null), 140);
  };
  const board = room === 'bbbox' ? bbboxBoard(data) : nextBoard(data);
  const preset = chosen && data
    ? (room === 'bbbox' ? bbboxReply(chosen, ask, data) : officeReply(chosen, ask, data, period))
    : null;
  const reply = spoken ?? preset;
  const stats = BRAND_ORDER.map((slug) => data?.brandStats?.[period]?.find((row) => row.slug === slug) ?? {
    slug, posts: 0, views: 0, reach: 0, interactions: 0,
  });
  const rememberedBody = room === 'bbbox'
    ? (chosen ? localNotes[chosen.id] : undefined)
    : chosen ? data?.suggestions?.find((item) => item.agentId === chosen.id)?.body : undefined;
  const draftRows = room === 'bbbox' ? bbboxDraftCounts(data) : [];
  const periodLabel = period === '1' ? '今天' : period === '7' ? '近 7 天' : '近 28 天';

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

  function endDance() {
    window.clearTimeout(danceTimer.current);
    setDance(null);
    setWalks({});
    ambience.current?.stopDance();
  }

  function beginDance(kind: DanceKind) {
    window.clearTimeout(danceTimer.current);
    if (dance === kind) {
      endDance();
      return;
    }
    const spots: Record<string, { x: number; y: number }> = {};
    stations.forEach((station, index) => {
      const spot = DANCE_SPOTS[index];
      if (spot) spots[stationKey(station)] = spot;
    });
    setChat(null);
    setWalks(spots);
    setDance(kind);
    ambience.current?.playDance(kind);
    danceTimer.current = window.setTimeout(endDance, 16000);
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

  async function enterDemo() {
    setDemo(true);
    ambience.current?.start();
    setMusicOn(true);
    try {
      await pageRef.current?.requestFullscreen();
    } catch {
      /* 全螢幕被瀏覽器擋住時，仍用蓋住整個畫面的展示層 */
    }
  }

  async function askEditor() {
    if (!chosen || !data || note.trim().length < 2 || noteBusy) return;
    const text = note.trim();
    if (room === 'bbbox') {
      const reply = bbboxAsk(chosen, text, data);
      setSpoken(reply);
      setSaid({ agentId: chosen.id, line: reply.bubble });
      if (reply.mode === 'note') setLocalNotes((current) => ({ ...current, [chosen.id]: text }));
      setNote('');
      setNoteSaved('');
      return;
    }
    const reply = liveAsk(chosen, text, data, period);
    if (reply.mode === 'answer') {
      setSpoken(reply);
      setSaid({ agentId: chosen.id, line: reply.bubble });
      setNote('');
      setNoteSaved('');
      return;
    }
    setNoteBusy(true);
    try {
      await api.addOfficeSuggestion(chosen.id, text);
      setSpoken(reply);
      setSaid({ agentId: chosen.id, line: reply.bubble });
      setNote('');
      setNoteSaved('');
      setTick((n) => n + 1);
    } catch (e) {
      setNoteSaved(e instanceof Error ? e.message : '沒記下');
    } finally {
      setNoteBusy(false);
    }
  }

  async function leaveDemo() {
    setDemo(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* 已經退出 */ }
    }
  }

  return (
    <div ref={pageRef} className={`office-page${room === 'bbbox' ? ' is-bbbox' : ''}${meeting ? ' is-meeting' : ''}${demo ? ' is-demo' : ''}${view ? ' is-view' : ''}`}>
      <header className="office-hud">
        <div className="office-title">
          {room === 'bbbox' ? '和居家居行銷辦公室' : 'Go 行銷辦公室'}
          <small>{view ? '展示畫面，只能看' : room === 'bbbox' ? '點一個人，問這一牌的草稿和賞屋' : data?.quiet ? '凌晨這一班只留方向，八點才發' : '點一個人，直接問，他用手上的資料回答'}</small>
          {!view && room === 'bbbox' && <Link className="office-film" to="/bbbox/intelligence">品牌智慧</Link>}
          {!view && room === 'bbbox' && <Link className="office-film" to="/bbbox/contents">草稿工作台</Link>}
          {!view && room !== 'bbbox' && <a className="office-film" href="/watch/office" target="_blank" rel="noreferrer">手機展示連結</a>}
          {data?.standup && !view ? (
            <span className="office-film">{standupSummary(data.standup) || '這一班還沒有討論摘要'}</span>
          ) : null}
        </div>
        {!view && <div className="office-counts">
          <span>閒置 {counts.idle}</span>
          <span>工作中 {counts.working}</span>
          <button
            type="button"
            className={`office-count${roster === 'done' ? ' is-on' : ''}`}
            aria-expanded={roster === 'done'}
            onClick={() => setRoster((current) => current === 'done' ? null : 'done')}
          >
            完成 {counts.done}
          </button>
          <button
            type="button"
            className={`office-count is-blocked${roster === 'blocked' ? ' is-on' : ''}`}
            aria-expanded={roster === 'blocked'}
            onClick={() => setRoster((current) => current === 'blocked' ? null : 'blocked')}
          >
            卡住 {counts.blocked}
          </button>
          <button type="button" className={`office-music${musicOn ? ' is-on' : ''}`} aria-pressed={musicOn} onClick={toggleMusic}>
            <span className="eq" aria-hidden><i /><i /><i /></span>
            {musicOn ? '音樂開著' : '播放音樂'}
          </button>
          <button type="button" className={`office-music${dance === 'naughty' ? ' is-on' : ''}`} onClick={() => beginDance('naughty')}>
            {dance === 'naughty' ? '停下' : '跳你好壞'}
          </button>
          <button type="button" className={`office-music${dance === 'sidestep' ? ' is-on' : ''}`} onClick={() => beginDance('sidestep')}>
            {dance === 'sidestep' ? '停下' : '跳閃身步'}
          </button>
          <button type="button" className="office-music" onClick={() => void (demo ? leaveDemo() : enterDemo())}>
            {demo ? '結束展示' : '全螢幕展示'}
          </button>
          {room === 'bbbox' ? <span>草稿留著</span> : (
            <button type="button" className={`office-switch${data?.autoPublish === false ? ' is-off' : ''}`} onClick={() => void toggle()} disabled={!data || switchBusy}>
              {data?.autoPublish === false ? '自動發文關著' : '自動發文開著'}
            </button>
          )}
        </div>}
      </header>
      {!view && roster && (
        <section className={`office-roster is-${roster}`} aria-label={roster === 'blocked' ? '卡住的人' : '完成的人'}>
          <header>
            <strong>{roster === 'blocked' ? '卡住的原因' : '完成的結果'}</strong>
            <button type="button" onClick={() => setRoster(null)}>關閉</button>
          </header>
          {rosterRows.length === 0 ? (
            <p>{roster === 'blocked' ? '現在沒有人卡住。' : '這一班還沒有人完成。'}</p>
          ) : rosterRows.map((row) => (
            <article key={row.id} className={selected === row.id ? 'is-on' : ''}>
              <button type="button" onClick={() => { setSpoken(null); setSelected(row.id); }}>
                <b>{row.name}</b>
                <span>{row.task}</span>
                {(row.piece || row.excerpt) && <small>{row.piece}{row.excerpt ? ` ${row.excerpt}` : ''}</small>}
              </button>
              {!view && row.href && <Link to={row.href}>打開原稿</Link>}
            </article>
          ))}
        </section>
      )}
      {data?.standup?.note && <div className="office-note">{data.standup.note}</div>}
      {error && !data && (
        <div className="office-note">
          辦公室這次沒載入。
          <button type="button" onClick={() => setTick((n) => n + 1)}>再試一次</button>
        </div>
      )}
      {loading && !data && <div className="office-note">辦公室正在亮燈…</div>}

      <div className="office-fit" ref={fitRef}>
        <div className="office-scaler" style={{ width: ROOM_W * scale, height: ROOM_H * scale }}>
          <div className={`office-room${dance ? ' is-dancing' : ''}`} style={{ width: ROOM_W, height: ROOM_H, transform: `scale(${scale})` }}>
            <div className="diorama">
            <div className="back-wall">
            <div className="wall" />
            <div className="baseboard" />
            <div className="whiteboard">
              <strong>{board.title}</strong>
              {board.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
            <OfficeSky />
            {room === 'bbbox' ? (
              <div className="brand-wall" aria-label="和居家居">
                <img src="/brands/bbbox-logo.png" alt="和居家居" />
              </div>
            ) : (
              <div className="brand-wall" aria-label="TaskGo、Homigo、Washgo">
                <img src="/brands/taskgo-logo.png" alt="TaskGo" />
                <img src="/office/logo-homigo.png" alt="Homigo" />
                <img src="/office/logo-washgo.png" alt="Washgo" />
              </div>
            )}
            <div className="scoreboard">
              {room === 'bbbox' ? (
                <>
                  <div className="period"><strong>和居家居</strong></div>
                  {draftRows.map((row) => (
                    <p key={row.label}><b>{row.label}</b><span>{row.value}</span></p>
                  ))}
                </>
              ) : (
                <>
                  <div className="period">
                    <strong>{periodLabel}</strong>
                    {(['1', '7', '28'] as const).map((value) => (
                      <button key={value} type="button" className={period === value ? 'is-on' : ''} disabled={view} onClick={() => { if (!view) setPeriod(value); }}>
                        {value === '1' ? '1天' : value === '7' ? '7天' : '28天'}
                      </button>
                    ))}
                  </div>
                  {stats.map((row) => (
                    <p key={row.slug}>
                      <b>{BRAND_LABEL[row.slug]}</b>
                      <span>瀏覽 {compactNumber(row.views)}</span>
                      <span>觸及 {row.reach > 0 ? compactNumber(row.reach) : '—'}</span>
                      <span>互動 {row.views > 0 ? `${((row.interactions / row.views) * 100).toFixed(1)}%` : '—'}</span>
                    </p>
                  ))}
                </>
              )}
            </div>
            <div className="rack" aria-hidden>{Array.from({ length: 5 }, (_, i) => <b key={i} />)}</div>
            </div>

            <div className="floor-stage">
            <div className="floor" />
            <div className="carpet brand" />
            <div className="carpet market" />
            <div className="shelf" aria-hidden><i /><i /><i /><i /></div>
            <div className="plant" aria-hidden><i className="leaf a" /><i className="leaf b" /><i className="leaf c" /><i className="pot" /></div>

            {dance && <div className="dance-flag">{dance === 'naughty' ? '她 · 很 · 壞 · 嘟嘟嘟' : '站好 · 左閃 · 右閃'}</div>}
            <div className="lounge">
              <div className="sofa" />
              <div className="coffee">
                <i className="mug" />
                <i className="steam" />
              </div>
              {meeting && <div className="meet-flag">晨會中</div>}
            </div>

            {stations.map((station, index) => {
              const agent = data ? matchAgent(data.agents, station) : undefined;
              const label = nickname(agent, station.name);
              const copy = room === 'bbbox'
                ? bbboxScreenCopy(station.name, agent?.task ?? '', beat, data?.keywords ?? [])
                : screenCopy(station as Station, agent, data, beat);
              const saying = visibleBubbles.find((bubble) => bubble.who === label);
              const status = agent?.status ?? 'done';
              const key = stationKey(station);
              const away = Boolean(walks[key]);
              return (
                <button
                  key={key}
                  type="button"
                  className={`station is-${status}${selected && agent?.id === selected ? ' is-picked' : ''}${roster && status === roster ? ' is-roster' : ''}${saying ? ' is-speaking' : ''}${away ? ' is-away' : ''}`}
                  style={{ left: station.x, top: station.y, zIndex: 10 + Math.round(station.y / 8), ['--mat' as string]: station.mat, animationDelay: `${index * 0.35}s` }}
                  aria-label={`${label}，${agent?.task ?? '等下一班晨會'}`}
                  onMouseEnter={() => showPeek(label)}
                  onMouseLeave={hidePeek}
                  onClick={() => { if (view || !agent) return; setSpoken(null); setSelected(agent.id); }}
                >
                  <span className="tip">{agent?.task ?? '等下一班晨會'}</span>
                  <span className="who-space" />
                  <span className="chair" />
                  <Monitor kind={station.screen as ScreenKind} title={copy.title} line={copy.line} marks={room === 'bbbox' ? ['盒'] : undefined} />
                  <span className="desk">
                    <span className="keys" aria-hidden><b /><b /><b /><b /><b /></span>
                    <strong>{label}</strong>
                  </span>
                </button>
              );
            })}
            {stations.map((station, index) => {
              const key = stationKey(station);
              const walk = walks[key];
              const agent = data ? matchAgent(data.agents, station) : undefined;
              const label = nickname(agent, station.name);
              return (
                <button
                  key={`walk-${key}`}
                  type="button"
                  className={`walker${walk ? ' is-away' : ''}${dance ? ` is-dancing is-${dance}` : ''}${selected && agent?.id === selected ? ' is-picked' : ''}`}
                  style={{ left: walk ? walk.x : station.x + 50, top: walk ? walk.y : station.y, zIndex: dance ? 80 + index : 30 + Math.round((walk ? walk.y : station.y) / 8) }}
                  data-who={label}
                  data-station={station.name}
                  aria-label={label}
                  onMouseEnter={() => showPeek(label)}
                  onMouseLeave={hidePeek}
                  onClick={() => { if (view || !agent) return; setSpoken(null); setSelected(agent.id); }}
                >
                  <span className="doll" style={{ ['--mat' as string]: station.mat }}>
                    <Face src={station.portrait} crop={station.crop} alt={label} tint={station.mat} />
                    <i className="arm left" />
                    <i className="arm right" />
                    <i className="torso" />
                    <i className="leg left" />
                    <i className="leg right" />
                  </span>
                  <em>{label}</em>
                </button>
              );
            })}
            </div>
            </div>
          </div>
        </div>
        <FloatingTalk rootRef={fitRef} notes={floatNotes} />
      </div>

      {!view && chosen && reply && (
        <aside className="talkbox">
          <button type="button" className="office-close" onClick={() => setSelected(null)} aria-label="關閉">×</button>
          {(() => {
            const face = stations.find((station) => matchAgent([chosen], station))?.portrait || '';
            if (!face) return <span className="talk-face is-fallback">{nickname(chosen, chosen.displayName).slice(0, 1)}</span>;
            return <img className={`talk-face${face.includes('bbbox-logo') ? ' is-logo' : ''}`} src={face} alt="" />;
          })()}
          <div className="talk-body">
            <h2>{nickname(chosen, chosen.displayName)} <small>{chosen.persona.characterTitle}</small></h2>
            <p className="ask">{reply.question}</p>
            <p className="reply"><TypedText text={reply.answer} /></p>
            {reply.details.length > 0 && (
              <ul>
                {reply.details.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
            <div className="asks">
              <button type="button" className={ask === 'now' && !spoken ? 'is-on' : ''} onClick={() => { setSpoken(null); setAsk('now'); }}>你現在在做什麼</button>
              <button type="button" className={ask === 'next' && !spoken ? 'is-on' : ''} onClick={() => { setSpoken(null); setAsk('next'); }}>下一件是什麼</button>
              <button type="button" className={ask === 'result' && !spoken ? 'is-on' : ''} onClick={() => { setSpoken(null); setAsk('result'); }}>成效怎麼樣</button>
              {(room === 'bbbox' ? bbboxHref(chosen.roleCode) : manuscriptHref(chosen)) && (
                <Link to={(room === 'bbbox' ? bbboxHref(chosen.roleCode) : manuscriptHref(chosen))!}>
                  {room === 'bbbox' ? '打開這一層' : '打開原稿'}
                </Link>
              )}
            </div>
            {rememberedBody && <p className="hint">上次交代：{rememberedBody}</p>}
            <form className="advice" onSubmit={(event) => { event.preventDefault(); void askEditor(); }}>
              <input
                value={note}
                maxLength={400}
                placeholder="直接問他，或交代下一班要注意什麼"
                onChange={(event) => setNote(event.target.value)}
              />
              <button type="submit" disabled={noteBusy || note.trim().length < 2}>問他</button>
            </form>
            {noteSaved && <p className="hint">{noteSaved}</p>}
          </div>
        </aside>
      )}
    </div>
  );
}

export function OfficeLive() {
  return <Office view />;
}
