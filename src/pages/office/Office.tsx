import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { OfficeAgent, OfficeSnapshot } from './types';
import './office.css';

const SPOTS = [
  { role: 'brand_ai', slug: 'taskgo', x: '20%', y: '34%', tint: '#E2A23A' },
  { role: 'brand_ai', slug: 'homigo', x: '18%', y: '52%', tint: '#8FBF7A' },
  { role: 'brand_ai', slug: 'washgo', x: '22%', y: '70%', tint: '#7EB6E0' },
  { role: 'market_analyst', slug: null, x: '74%', y: '28%', tint: '#D5E7EA' },
  { role: 'content_strategist', slug: null, x: '80%', y: '44%', tint: '#F2C14E' },
  { role: 'publisher', slug: null, x: '70%', y: '58%', tint: '#7EE0FF' },
  { role: 'podcast_producer', slug: null, x: '84%', y: '66%', tint: '#F0B429' },
  { role: 'art_director', slug: null, x: '68%', y: '78%', tint: '#F4A6C4' },
  { role: 'video_editor', slug: null, x: '82%', y: '84%', tint: '#B9A6FF' },
] as const;

function matchAgent(agents: OfficeAgent[], role: string, slug: string | null) {
  return agents.find((agent) => agent.roleCode === role && (agent.brandSlug ?? null) === slug);
}

function nickname(agent: OfficeAgent) {
  return agent.persona.nickname || agent.displayName;
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

export function Office() {
  const [data, setData] = useState<OfficeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [bubbleAt, setBubbleAt] = useState(0);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [tick, setTick] = useState(0);

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

  const counts = useMemo(() => {
    const agents = data?.agents ?? [];
    const working = agents.filter((agent) => agent.status === 'working').length;
    const done = agents.filter((agent) => agent.status === 'done').length;
    const blocked = agents.filter((agent) => agent.status === 'blocked').length;
    return { idle: Math.max(0, agents.length - working - done - blocked), working, done, blocked };
  }, [data]);

  const chosen = data?.agents.find((agent) => agent.id === selected) ?? null;
  const visibleBubbles = meeting ? bubbles.slice(bubbleAt % Math.max(bubbles.length, 1)).slice(0, 3) : [];

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

  return (
    <div className={`office-page${meeting ? ' is-meeting' : ''}`}>
      <header className="office-hud">
        <div>
          <div className="office-title">
            匠管行銷辦公室
            <small>{data?.quiet ? '凌晨這一班只留方向，八點才發' : '點一個人，看他現在在做什麼'}</small>
          </div>
        </div>
        <div className="office-counts">
          <span>閒置 {counts.idle}</span>
          <span>工作中 {counts.working}</span>
          <span>完成 {counts.done}</span>
          {counts.blocked > 0 && <span>卡住 {counts.blocked}</span>}
          <button type="button" className={`office-switch${data?.autoPublish === false ? ' is-off' : ''}`} onClick={() => void toggle()} disabled={!data || switchBusy}>
            {data?.autoPublish === false ? '自動發文關著' : '自動發文開著'}
          </button>
        </div>
      </header>
      {data?.standup?.note && <div className="office-note">{data.standup.note}</div>}
      {error && <div className="office-note">{error}</div>}
      {loading && !data && <div className="office-note">辦公室正在亮燈…</div>}

      <div className="office-stage">
        <div className="office-floor" />
        <div className="office-wing left">品牌翼</div>
        <div className="office-wing right">行銷翼</div>
        <div className="office-table" />
        {meeting && visibleBubbles.length > 0 && (
          <div className="office-bubbles">
            {visibleBubbles.map((bubble) => (
              <p key={`${bubble.who}-${bubble.text}`}><b>{bubble.who}</b>{bubble.text}</p>
            ))}
          </div>
        )}
        {SPOTS.map((spot) => {
          const agent = data ? matchAgent(data.agents, spot.role, spot.slug) : null;
          const label = agent ? nickname(agent) : spot.slug ?? '小編';
          return (
            <button
              key={`${spot.role}-${spot.slug ?? 'x'}`}
              type="button"
              className={`office-person${agent?.status === 'working' ? ' is-working' : ''}`}
              style={{ left: spot.x, top: spot.y, ['--tint' as string]: spot.tint }}
              onClick={() => agent && setSelected(agent.id)}
            >
              <div className="office-figure" style={{ ['--tint' as string]: spot.tint }}>
                <i /><b />
              </div>
              <span className="office-name">
                <strong>{label}</strong>
                <em>{agent?.task ?? '等下一班晨會'}</em>
              </span>
            </button>
          );
        })}
        {chosen && (
          <aside className="office-panel">
            <button type="button" className="office-close" onClick={() => setSelected(null)} aria-label="關閉">×</button>
            <h2>{nickname(chosen)}</h2>
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
    </div>
  );
}
