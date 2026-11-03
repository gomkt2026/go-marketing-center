import { api } from '@/lib/api';
import type { Content } from '@/types';
import type { Ask, OfficeMoment } from './talk';
import type { OfficeAgent, OfficeSnapshot } from './types';

export const BBBOX_STATIONS = [
  { role: 'brand_ai', slug: 'bbbox', name: '小盒', x: 40, y: 292, mat: '#5B949A', screen: 'cabin', portrait: '/brands/bbbox-logo.png', crop: 'center center' },
  { role: 'content_strategist', slug: 'bbbox', name: '企劃', x: 52, y: 430, mat: '#f2c14e', screen: 'plan', portrait: '/office/cast-strategy.jpg', crop: 'center 16%' },
  { role: 'publisher', slug: 'bbbox', name: '草稿', x: 36, y: 624, mat: '#7ee0ff', screen: 'queue', portrait: '/office/cast-publisher.jpg', crop: 'center 20%' },
  { role: 'market_analyst', slug: 'bbbox', name: '情報', x: 640, y: 300, mat: '#b7ddd4', screen: 'ticker', portrait: '/office/cast-news.jpg', crop: 'center 18%' },
  { role: 'site_survey', slug: 'bbbox', name: '場勘', x: 872, y: 308, mat: '#F0D93D', screen: 'jobs', portrait: '', crop: 'center' },
  { role: 'showroom', slug: 'bbbox', name: '賞屋', x: 656, y: 424, mat: '#8A6A12', screen: 'homes', portrait: '', crop: 'center' },
  { role: 'script', slug: 'bbbox', name: '對稿', x: 860, y: 436, mat: '#f0b429', screen: 'wave', portrait: '/office/cast-podcast.jpg', crop: 'center 14%' },
  { role: 'art_director', slug: 'bbbox', name: '配圖', x: 644, y: 616, mat: '#f4a6c4', screen: 'swatch', portrait: '/office/cast-art.jpg', crop: 'center 10%' },
  { role: 'video_editor', slug: 'bbbox', name: '剪片', x: 876, y: 628, mat: '#b9a6ff', screen: 'timeline', portrait: '/office/cast-video.jpg', crop: 'center 12%' },
] as const;

const TASKS: Record<string, string> = {
  小盒: '在對賞屋草稿，等人看過再發',
  企劃: '在收和居家居這一題',
  草稿: '稿先留在這一層',
  情報: '熱門接不上賞屋就不寫',
  場勘: '先問這塊地能做什麼',
  賞屋: '電話 04-2355-0256，LINE @BBBOX',
  對稿: '在對這一則的場面',
  配圖: '青綠底、黃標，這張不做成語錄卡',
  剪片: '素材不夠就不假裝剪完',
};

const DESK: Record<string, { title: string; line: string }[]> = {
  小盒: [
    { title: '賞屋', line: '在對這塊地能做什麼' },
    { title: '賞屋', line: '草稿先留著，等人看過' },
  ],
  企劃: [
    { title: '題目', line: '這一題只寫和居家居' },
    { title: '題目', line: '硬跟熱門的那則先拿掉' },
  ],
  草稿: [
    { title: '草稿', line: 'FB、IG、Threads 各留一則' },
    { title: '草稿', line: '看過的那則才送出去' },
  ],
  情報: [
    { title: '熱門', line: '接不上賞屋就先放著' },
    { title: '熱門', line: '不把別的牌子的題拿過來' },
  ],
  場勘: [
    { title: '場地', line: '先問這塊地進不進得去' },
    { title: '場地', line: '路進不去就看能不能現場組' },
  ],
  賞屋: [
    { title: '賞屋', line: '04-2355-0256' },
    { title: '賞屋', line: 'LINE @BBBOX' },
  ],
  對稿: [
    { title: '對稿', line: '前兩行要是一個場面' },
    { title: '對稿', line: '價格、合法、回本這則不寫' },
  ],
  配圖: [
    { title: '配圖', line: '青綠底，黃標四到十字' },
    { title: '配圖', line: '這張不做成語錄卡' },
  ],
  剪片: [
    { title: '剪片', line: '在等賞屋或進場的素材' },
    { title: '剪片', line: '素材不夠就不假裝剪完' },
  ],
};

const TITLES: Record<string, string> = {
  小盒: '和居家居小編',
  企劃: '這一牌的題',
  草稿: '草稿台',
  情報: '熱門',
  場勘: '場地',
  賞屋: '展間',
  對稿: '對稿',
  配圖: '配圖',
  剪片: '剪片',
};

function desk(name: string, beat: number) {
  const rows = DESK[name];
  if (!rows?.length) return null;
  return rows[Math.abs(beat) % rows.length];
}

function platformName(platform: string | null) {
  if (platform === 'facebook') return 'Facebook';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'threads') return 'Threads';
  return '社群';
}

function previewOf(content: Content | undefined): OfficeAgent['preview'] {
  if (!content) return null;
  const version = content.versions[content.versions.length - 1];
  const image = version?.assets?.find((asset) => asset.assetType === 'image')?.fileUrl ?? null;
  return {
    id: content.id,
    title: content.title,
    target_platform: content.targetPlatform ?? '',
    slug: 'bbbox',
    body: version?.body?.replace(/\s+/g, ' ').trim().slice(0, 220) ?? null,
    file_url: image,
  };
}

function buildSnapshot(drafts: Content[]): OfficeSnapshot {
  const byPlatform = (platform: string) => drafts.find((item) => item.targetPlatform === platform);
  const previewFor = (name: string) => {
    if (name === '小盒') return previewOf(byPlatform('facebook') ?? drafts[0]);
    if (name === '配圖') return previewOf(byPlatform('instagram'));
    if (name === '草稿') return previewOf(byPlatform('threads') ?? drafts[0]);
    return null;
  };
  return {
    autoPublish: false,
    quiet: false,
    budgetUsd: 0,
    monthSpendUsd: 0,
    standup: null,
    signals: drafts.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.targetPlatform,
      source_url: null,
      slug: 'bbbox',
    })),
    podcasts: [],
    videos: [],
    findings: [],
    keywords: drafts.map((item) => item.title).slice(0, 8),
    suggestions: [],
    brandStats: { '1': [], '7': [], '28': [] },
    nextJobs: [],
    agents: BBBOX_STATIONS.map((station) => ({
      id: `bbbox-${station.role}`,
      roleCode: station.role,
      brandSlug: 'bbbox',
      displayName: station.name,
      color: station.mat,
      persona: {
        nickname: station.name,
        characterTitle: TITLES[station.name] ?? '和居家居',
        focus: TASKS[station.name] ?? '',
      },
      status: station.name === '小盒' || station.name === '配圖' ? 'working' : 'done',
      task: TASKS[station.name] ?? '在看和居家居這一則',
      artifactType: previewFor(station.name) ? 'content' : null,
      artifactId: previewFor(station.name)?.id ?? null,
      preview: previewFor(station.name),
      updatedAt: null,
    })),
  };
}

export async function loadBbboxOffice(): Promise<OfficeSnapshot> {
  try {
    const list = await api.contents('bbbox', { status: 'draft' });
    const details = await Promise.all(list.contents.slice(0, 6).map((item) => api.contentDetail(item.id)));
    return buildSnapshot(details.map((item) => item.content));
  } catch {
    return buildSnapshot([]);
  }
}

export function bbboxScreenCopy(name: string, task: string, beat: number, keywords: string[]) {
  if (name === '情報') {
    const line = keywords.filter(Boolean).slice(0, 6).join('  ·  ');
    return { title: '熱門', line: line || '在看能不能接到賞屋' };
  }
  const work = desk(name, beat);
  if (work) return work;
  return { title: '賞屋', line: task || '在看這一則' };
}

export function bbboxBoard(data: OfficeSnapshot | null) {
  const lines = (data?.signals ?? []).map((item) => `${platformName(item.summary)}　${item.title}`);
  return {
    title: '這一層的草稿',
    lines: lines.length ? lines : ['先問這塊地能做什麼'],
  };
}

export function bbboxDraftCounts(data: OfficeSnapshot | null) {
  const signals = data?.signals ?? [];
  const count = (platform: string) => signals.filter((item) => item.summary === platform).length;
  return [
    { label: 'Facebook', value: `草稿 ${count('facebook')}` },
    { label: 'Instagram', value: `草稿 ${count('instagram')}` },
    { label: 'Threads', value: `草稿 ${count('threads')}` },
    { label: '賞屋', value: '04-2355-0256' },
  ];
}

const EXCHANGES: { a: string; b: string; lineA: string; lineB: string }[] = [
  { a: '場勘', b: '小盒', lineA: '這塊地的路要先問', lineB: '結論：文案先寫進不進得去，價格不寫' },
  { a: '企劃', b: '情報', lineA: '熱門接不上賞屋就別硬寫', lineB: '結論：這一則仍寫這塊地能做什麼' },
  { a: '配圖', b: '小盒', lineA: '這張用青綠底、黃標，不做成語錄卡', lineB: '結論：圖跟現場組或賞屋那個場面一起出' },
  { a: '草稿', b: '賞屋', lineA: '這三則先留在草稿', lineB: '結論：看過再發。電話跟 LINE 留在文末' },
  { a: '對稿', b: '剪片', lineA: '前兩行要是一個場面', lineB: '結論：片子等素材，字卡不蓋重點' },
];

export function bbboxMoment(names: string[], salt: number): OfficeMoment {
  const pool = names.filter(Boolean);
  if (!pool.length) return { who: [], lines: [], gather: false };
  const who = pool[Math.abs(salt) % pool.length];
  const work = desk(who, salt);
  const solo: OfficeMoment = {
    who: [who],
    lines: [{ who, text: work ? `${work.title}，${work.line}` : '我先把手上這件做完' }],
    gather: false,
  };
  const open = EXCHANGES.filter((item) => pool.includes(item.a) && pool.includes(item.b));
  if (Math.abs(salt) % 3 !== 2 || !open.length) return solo;
  const pick = open[Math.abs(salt) % open.length];
  return {
    who: [pick.a, pick.b],
    lines: [
      { who: pick.a, text: pick.lineA },
      { who: pick.b, text: pick.lineB },
    ],
    gather: Math.abs(salt) % 5 === 3,
  };
}

export function bbboxReply(agent: OfficeAgent, ask: Ask, data: OfficeSnapshot) {
  const name = agent.persona.nickname || agent.displayName;
  const drafts = data.signals ?? [];
  if (ask === 'result') {
    return {
      question: `${name}，成效怎麼樣？`,
      answer: drafts.length
        ? `和居家居這一層有 ${drafts.length} 則草稿。粉專還沒接上，所以沒有瀏覽和觸及。`
        : '和居家居這一層還沒有草稿，也還沒有瀏覽。',
      details: drafts.map((item) => `${platformName(item.summary)}　${item.title}`),
    };
  }
  if (ask === 'next') {
    return {
      question: `${name}，下一件是什麼？`,
      answer: drafts.length
        ? `下一則先留在草稿：${drafts.map((item) => item.title).join('、')}。`
        : '下一則先問這塊地能做什麼，寫完留在草稿。',
      details: ['預約賞屋：04-2355-0256，或 LINE @BBBOX'],
    };
  }
  const bits = [agent.task];
  if (agent.preview?.title) bits.push(`手上這篇是《${agent.preview.title}》。`);
  if (agent.preview?.body) bits.push(agent.preview.body);
  return {
    question: `${name}，你現在在做什麼？`,
    answer: bits.filter(Boolean).join(''),
    details: ['預約賞屋：04-2355-0256，或 LINE @BBBOX'],
  };
}

export function bbboxAsk(agent: OfficeAgent, text: string, data: OfficeSnapshot) {
  const question = text.trim();
  const name = agent.persona.nickname || agent.displayName;
  const directing = /不要|記得|記住|注意|下一班|交代|避開|改成|先別|以後|幫我記/.test(question) && !/[？?]/.test(question);
  if (directing) {
    return {
      mode: 'note' as const,
      question,
      answer: `${name}記下了。這一層下一則照這句寫，不會把它寫成已經發生的新聞或數字。`,
      details: [] as string[],
      bubble: '下一則我照這個方向',
    };
  }
  const topic = /成效|瀏覽|觸及|互動/.test(question)
    ? 'result'
    : /下一|排程|草稿|要發/.test(question)
      ? 'next'
      : 'now';
  const reply = bbboxReply(agent, topic, data);
  const flat = reply.answer.replace(/\s+/g, ' ');
  return {
    mode: 'answer' as const,
    question,
    answer: reply.answer,
    details: reply.details,
    bubble: flat.length > 42 ? `${flat.slice(0, 42)}…` : flat,
  };
}

export function bbboxHref(role: string) {
  if (role === 'brand_ai') return '/bbbox/editor';
  if (role === 'content_strategist' || role === 'market_analyst' || role === 'site_survey') return '/bbbox/intelligence';
  if (role === 'video_editor') return '/bbbox/shorts';
  return '/bbbox/contents';
}
