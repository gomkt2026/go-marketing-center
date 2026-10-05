import type { Env } from './env';
import { getSql } from './db';
import { withGameSchema } from './game';

/** 與遊戲 INC_DEFS 的鍵順序一致。改這邊就要一起改 public/game/index.html 的 ROAD_IDS。 */
export const DAILY_ROADS = [
  { id: 'election', title: '選舉造勢車隊', line: '造勢車隊佔住整條路，要繞路。' },
  { id: 'fire', title: '住宅火災', line: '消防車佔住車道，請改道。' },
  { id: 'works', title: '前方施工', line: '圍籬擋住直走，要繞。' },
  { id: 'dogrun', title: '狗狗大逃家', line: '一群狗佔住馬路。' },
  { id: 'chicken', title: '雞群過馬路', line: '雞群過馬路，車都在等。' },
  { id: 'cat', title: '貓咪卡在車底', line: '有貓卡在車底，要停下來。' },
  { id: 'unload', title: '貨車卸貨中', line: '貨車卸貨擋路。' },
  { id: 'crane', title: '吊車作業', line: '吊車佔住車道。' },
  { id: 'riders', title: '外送大軍', line: '外送機車擠成一團。' },
  { id: 'hazard', title: '雙黃線臨停', line: '臨停車擋住車道。' },
  { id: 'bus', title: '公車故障', line: '故障公車擋在路上。' },
  { id: 'ambulance', title: '救護車通行', line: '救護車要通過，讓道有獎金。' },
  { id: 'filming', title: '街頭拍攝', line: '街頭在拍片，車道暫時封閉。' },
  { id: 'wedding', title: '婚禮車隊', line: '跟在婚禮車隊後面，有機會拿到喜糖。' },
  { id: 'temple', title: '廟會遶境', line: '廟會陣頭經過，整條路先暫停。' },
  { id: 'market', title: '臨時市集', line: '臨時市集佔住馬路。' },
  { id: 'school', title: '學校放學', line: '放學時間，路口擠滿學生和家長。' },
  { id: 'storm', title: '突然暴雨', line: '騎到一半突然下雨，路面變滑。' },
  { id: 'flood', title: '道路積水', line: '低窪路段積水，騎進去會變慢。' },
  { id: 'tree', title: '倒樹事件', line: '大樹倒在路上，暫時封路。' },
  { id: 'pothole', title: '巨大坑洞', line: '路上有大坑，騎太快會摔。' },
] as const;

export type DailyRoad = (typeof DAILY_ROADS)[number];
export type PromoFocus = 'plays' | 'leaders' | 'road';

export interface GamePromoBrief {
  date: string;
  road: DailyRoad;
  yesterdayPlays: number;
  yesterdayPlayers: number;
  leaders: string[];
  focus: PromoFocus;
  headline: string;
  fact: string;
}

export function taipeiDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function dailyRoadIndex(key: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 33) + key.charCodeAt(i)) >>> 0;
  return hash % length;
}

export function dailyRoadEvent(now = new Date()): DailyRoad {
  const key = taipeiDateKey(now);
  return DAILY_ROADS[dailyRoadIndex(key, DAILY_ROADS.length)];
}

function promoFocus(slug: string): PromoFocus {
  if (slug === 'homigo') return 'leaders';
  if (slug === 'washgo') return 'road';
  return 'plays';
}

function headlineFor(focus: PromoFocus, brief: { yesterdayPlays: number; leaders: string[]; road: DailyRoad }): string {
  if (focus === 'plays') return `昨天 ${brief.yesterdayPlays.toLocaleString('zh-TW')} 局`;
  if (focus === 'leaders') return brief.leaders[0] ? `${brief.leaders[0]} 領先` : '本週排行榜';
  const title = brief.road.title;
  return [...title].length <= 10 ? title : '今日路況';
}

function factFor(focus: PromoFocus, brief: { yesterdayPlays: number; yesterdayPlayers: number; leaders: string[]; road: DailyRoad }): string {
  if (focus === 'plays') {
    return `昨天匠城跑了 ${brief.yesterdayPlays.toLocaleString('zh-TW')} 局、${brief.yesterdayPlayers.toLocaleString('zh-TW')} 人。`;
  }
  if (focus === 'leaders') {
    return `這一週小地圖分數前面是 ${brief.leaders.join('、')}。`;
  }
  return `今天路上容易遇到${brief.road.title}。${brief.road.line}`;
}

export async function loadGamePromoBrief(env: Env, slug: string): Promise<GamePromoBrief> {
  const road = dailyRoadEvent();
  const date = taipeiDateKey();
  let yesterdayPlays = 0;
  let yesterdayPlayers = 0;
  let leaders: string[] = [];
  try {
    await withGameSchema(env, async () => {
      const sql = getSql(env);
      const y = await sql`
        SELECT
          COUNT(*)::int AS plays,
          COUNT(DISTINCT COALESCE(player_id::text, device_id, ip_hash))::int AS players
        FROM game_runs
        WHERE (started_at AT TIME ZONE 'Asia/Taipei')::date
          = ((now() AT TIME ZONE 'Asia/Taipei')::date - 1)
      `;
      const row = (y[0] ?? {}) as { plays?: number; players?: number };
      yesterdayPlays = Number(row.plays) || 0;
      yesterdayPlayers = Number(row.players) || 0;
      const top = await sql`
        SELECT p.nickname
        FROM game_scores s
        JOIN game_players p ON p.id = s.player_id
        WHERE NOT p.is_blocked
          AND s.map = 's'
          AND s.created_at >= now() - interval '7 days'
        ORDER BY s.score DESC
        LIMIT 3
      `;
      leaders = (top as { nickname?: string }[])
        .map((r) => String(r.nickname ?? '').trim())
        .filter(Boolean);
    });
  } catch (e) {
    console.warn('[game-daily] 讀昨天局數失敗', e);
  }

  let focus = promoFocus(slug);
  if (focus === 'plays' && yesterdayPlays <= 0) focus = 'road';
  if (focus === 'leaders' && leaders.length === 0) focus = 'road';
  const snapshot = { yesterdayPlays, yesterdayPlayers, leaders, road };
  return {
    date,
    road,
    yesterdayPlays,
    yesterdayPlayers,
    leaders,
    focus,
    headline: headlineFor(focus, snapshot),
    fact: factFor(focus, snapshot),
  };
}
