import type { OfficeAgent, OfficeSnapshot, OfficeStatPeriod } from './types';

export type Ask = 'now' | 'next' | 'result';

const BRAND_NAME: Record<string, string> = { taskgo: 'TaskGo', homigo: 'Homigo', washgo: 'Washgo' };
const EDITOR: Record<string, string> = { taskgo: '阿豪', homigo: '小咪', washgo: '阿樂' };

export function compactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 10000) {
    const wan = value / 10000;
    return `${wan >= 10 ? Math.round(wan) : wan.toFixed(1)}萬`;
  }
  return Math.round(value).toLocaleString('zh-TW');
}

export function taipeiWhen(iso: string | null): string {
  if (!iso) return '時間還沒排';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '時間還沒排';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function nickname(agent: OfficeAgent) {
  return agent.persona.nickname || agent.displayName;
}

function themeOf(data: OfficeSnapshot, slug: string | null) {
  if (!slug) return '';
  return data.standup?.directive?.brands?.find((brand) => brand.slug === slug)?.theme ?? '';
}

const PERIOD_LABEL: Record<OfficeStatPeriod, string> = { '1': '今天', '7': '近 7 天', '28': '近 28 天' };

function statOf(data: OfficeSnapshot, slug: string | null, period: OfficeStatPeriod) {
  if (!slug) return null;
  return data.brandStats?.[period]?.find((row) => row.slug === slug) ?? null;
}

function rate(interactions: number, views: number) {
  if (views <= 0) return '還沒有瀏覽';
  return `${((interactions / views) * 100).toFixed(1)}%`;
}

function statSentence(data: OfficeSnapshot, slug: string, period: OfficeStatPeriod) {
  const stat = statOf(data, slug, period);
  const name = BRAND_NAME[slug] ?? slug;
  const label = PERIOD_LABEL[period];
  if (!stat || (stat.posts === 0 && stat.views === 0)) return `${name} ${label}還沒回收到瀏覽。`;
  const reach = stat.reach > 0 ? `觸及 ${compactNumber(stat.reach)}` : '觸及這段沒有分開記';
  return `${name} ${label}發了 ${stat.posts} 則，瀏覽 ${compactNumber(stat.views)}，${reach}，互動率 ${rate(stat.interactions, stat.views)}。`;
}

export function jobLine(slug: string, data: OfficeSnapshot | null): string {
  const who = EDITOR[slug] ?? slug;
  const job = data?.nextJobs?.find((item) => item.slug === slug);
  if (!job?.title) return `${who}　這段沒有排程`;
  return `${who}　${job.platform ?? ''} ${taipeiWhen(job.scheduledAt)}　${job.title}`;
}

export function nextBoard(data: OfficeSnapshot | null): { title: string; lines: string[] } {
  if (!data) return { title: '下一件要發', lines: ['等下一班晨會'] };
  return {
    title: '下一件要發',
    lines: ['taskgo', 'homigo', 'washgo'].map((slug) => jobLine(slug, data)),
  };
}

const DESK_WORK: Record<string, { title: string; line: string }[]> = {
  阿豪: [
    { title: '報價', line: '在對這一趟，金額先不寫出來' },
    { title: '派工', line: '在看誰先到場' },
  ],
  小咪: [
    { title: '管理', line: '在對這間的鑰匙和備註' },
    { title: '管理', line: '三處資料先收到一起' },
  ],
  阿樂: [
    { title: '洗滌', line: '在看客人問洗好了沒' },
    { title: '洗滌', line: '只看櫃檯進度，不教洗法' },
  ],
  發文小編: [
    { title: 'PO文', line: '在排下一則，三個品牌分開' },
    { title: 'PO文', line: '到點的那一則再送出去' },
  ],
  影片小編: [
    { title: '剪片', line: '在剪這支的節奏' },
    { title: '剪片', line: '素材不夠就不假裝剪完' },
  ],
  圖片小編: [
    { title: '配圖', line: '在對這一張的場面' },
    { title: '配圖', line: '這張不做成語錄卡' },
  ],
  行銷小編: [
    { title: '策略', line: '在把三個題收成結論' },
    { title: '策略', line: '硬跟熱門的那則先拿掉' },
  ],
  Podcast小編: [
    { title: '對稿', line: '在對這一集要講的場面' },
    { title: '對稿', line: '沒查到的數字這集不補' },
  ],
};

export function deskWork(name: string, beat: number): { title: string; line: string } | null {
  const rows = DESK_WORK[name];
  if (!rows?.length) return null;
  return rows[Math.abs(beat) % rows.length];
}

export interface OfficeMoment {
  who: string[];
  lines: { who: string; text: string }[];
  gather: boolean;
}

interface Exchange {
  a: string;
  b: string;
  lineA: string;
  lineB: string;
}

function conclusions(): Exchange[] {
  return [
    { a: '阿豪', b: '發文小編', lineA: '業主問這面牆多少，金額我先不寫', lineB: '結論：報價留在現場。貼文只寫收工前多看一眼' },
    { a: '小咪', b: '行銷小編', lineA: '鑰匙、合約、報修還是三個地方', lineB: '結論：先把物件管齊。文案不站房東也不站房客' },
    { a: '阿樂', b: '發文小編', lineA: '我在看洗滌詢問，客人又問洗好了沒', lineB: '結論：只PO櫃檯那一問，不教怎麼洗' },
    { a: '影片小編', b: '發文小編', lineA: '這支我在剪，還不能當今晚的檔', lineB: '結論：先放素材庫，不排進下一則' },
    { a: '圖片小編', b: '阿豪', lineA: '這張要海軍藍斜切，不要語錄卡', lineB: '結論：圖跟收工那個場面一起出' },
    { a: '行銷小編', b: '阿豪', lineA: 'Threads 前兩行要是一個場面，不是品牌介紹', lineB: '結論：我寫收工前多看一眼，不叫人私訊' },
    { a: '行銷小編', b: '小咪', lineA: '同一則熱門，三個帳號不能貼同一篇', lineB: '結論：我這篇寫事情散在三處，不寫法條' },
    { a: '發文小編', b: '阿樂', lineA: 'PO文第一句要讓人停住，不要先報品牌名', lineB: '結論：我寫客人問洗好了沒，不教怎麼洗' },
    { a: '影片小編', b: '圖片小編', lineA: '這支先剪節奏，字卡不要蓋臉', lineB: '結論：圖也留一個場面，不做成語錄卡' },
    { a: 'Podcast小編', b: '行銷小編', lineA: '這一集要有一個聽完想轉的點', lineB: '結論：講品牌自己的場面，不報沒查到的數字' },
  ];
}

function jokes(keyword: string): Exchange[] {
  const hot = `「${keyword}」`;
  return [
    { a: '新聞收集', b: '阿樂', lineA: `熱門是${hot}，我差點拿去寫衣服`, lineB: '哈哈先停。結論：接不上就不發，接得上只寫客人問洗好了沒' },
    { a: '新聞收集', b: '阿豪', lineA: `${hot}在轉，工地群組會笑`, lineB: '哈哈看過就好。結論：不寫金額、不編成故事，仍寫收工多看一眼' },
    { a: '新聞收集', b: '小咪', lineA: `${hot}很熱，租屋帳號要不要跟`, lineB: '哈哈先別。結論：不站邊，這則仍寫三處對不上' },
    { a: '行銷小編', b: '發文小編', lineA: `${hot}當笑話可以，當三篇稿不行`, lineB: '結論：笑完各寫各的場面，複製的那則不作' },
  ];
}

function soloLine(name: string, keyword: string | null, salt: number): string {
  if (name === '新聞收集') {
    return keyword ? `我在看熱門，現在是「${keyword}」` : '這一輪熱門還沒抓到，我先看著';
  }
  const work = deskWork(name, salt);
  if (work) return `我在${work.title}，${work.line.replace(/^在/, '')}`;
  return '我先把手上這件做完';
}

export function officeMoment(names: string[], data: OfficeSnapshot | null, salt: number): OfficeMoment {
  const pool = names.filter(Boolean);
  if (!pool.length) return { who: [], lines: [], gather: false };
  const keyword = data?.keywords?.find((item) => item.trim())?.trim() ?? null;
  const mode = Math.abs(salt) % 5;
  const solo = (shift = 0): OfficeMoment => {
    const who = pool[(Math.abs(salt) + shift) % pool.length];
    const text = soloLine(who, keyword, salt + shift);
    return { who: [who], lines: [{ who, text }], gather: false };
  };
  if (mode <= 1 || pool.length < 2) return solo();
  const source = mode === 4 && keyword ? jokes(keyword) : conclusions();
  const open = source.filter((item) => pool.includes(item.a) && pool.includes(item.b));
  const bag = open.length ? open : conclusions().filter((item) => pool.includes(item.a) && pool.includes(item.b));
  if (!bag.length) return solo();
  const round = Math.floor(Math.abs(salt) / 5);
  const pick = bag[(round + mode * 3) % bag.length];
  return {
    who: [pick.a, pick.b],
    lines: [
      { who: pick.a, text: pick.lineA },
      { who: pick.b, text: pick.lineB },
    ],
    gather: mode === 3,
  };
}

export function officeReply(
  agent: OfficeAgent,
  ask: Ask,
  data: OfficeSnapshot,
  period: OfficeStatPeriod = '28',
): { question: string; answer: string; details: string[] } {
  const name = nickname(agent);
  const theme = themeOf(data, agent.brandSlug);
  const finding = data.findings.find((item) => item.slug === agent.brandSlug)?.summary;
  const details: string[] = [];
  const label = PERIOD_LABEL[period];

  if (ask === 'result') {
    if (agent.brandSlug) {
      const row = statOf(data, agent.brandSlug, period);
      return {
        question: `${name}，成效怎麼樣？`,
        answer: statSentence(data, agent.brandSlug, period),
        details: row
          ? [`發文 ${row.posts} · 瀏覽 ${compactNumber(row.views)} · 觸及 ${row.reach > 0 ? compactNumber(row.reach) : '—'} · 互動 ${rate(row.interactions, row.views)}`]
          : [],
      };
    }
    const lines = ['taskgo', 'homigo', 'washgo'].map((slug) => statSentence(data, slug, period));
    return {
      question: `${name}，三個品牌成效怎麼樣？`,
      answer: lines.join('') || `${label}還沒有回收到數字。`,
      details: lines,
    };
  }

  if (ask === 'next') {
    const mine = data.nextJobs?.find((item) => item.slug === agent.brandSlug && item.title) ?? null;
    const bits = [];
    if (mine) bits.push(`下一則排程是 ${BRAND_NAME[mine.slug] ?? mine.slug} 的 ${mine.platform}，${taipeiWhen(mine.scheduledAt)}，${mine.title}。`);
    else if (agent.brandSlug) bits.push(jobLine(agent.brandSlug, data));
    else if (theme) bits.push(`晨會留給我的下一則方向是：${theme}。`);
    else if (data.standup?.directive?.podcastTopic && agent.roleCode === 'podcast_producer') bits.push(`下一集題目是：${data.standup.directive.podcastTopic}。`);
    else if (data.quiet) bits.push('現在是凌晨，這一班只把方向留下，八點才發。');
    else bits.push(nextBoard(data).lines.join('。'));
    if (theme && !bits[0]?.includes(theme)) details.push(`方向：${theme}`);
    ['taskgo', 'homigo', 'washgo'].forEach((slug) => details.push(jobLine(slug, data)));
    return { question: `${name}，下一件是什麼？`, answer: bits.join(''), details };
  }

  const bits = [`${agent.task}。`];
  if (agent.persona.focus) bits.push(agent.persona.focus);
  if (theme) bits.push(`這一班我沿著「${theme}」在準備。`);
  if (finding && agent.roleCode === 'brand_ai') bits.push(`我剛記下來的是：${finding}`);
  if (agent.preview?.body) bits.push(`手上這篇${agent.preview.title ? `《${agent.preview.title}》` : ''}：${agent.preview.body}`);
  if (agent.persona.catchphrase) bits.push(agent.persona.catchphrase);

  if (agent.roleCode === 'market_analyst') {
    const words = data.keywords ?? [];
    words.forEach((word) => details.push(word));
    if (words.length) bits.push(`現在熱的是：${words.slice(0, 8).join('、')}。`);
    else bits.push('這一輪熱門關鍵字還沒抓到。');
  }
  if (agent.roleCode === 'content_strategist') {
    (data.standup?.directive?.brands ?? []).forEach((brand) => {
      if (brand.theme) details.push(`${EDITOR[brand.slug] ?? brand.slug}：${brand.theme}`);
    });
  }
  if (agent.roleCode === 'podcast_producer') {
    data.podcasts.forEach((episode) => details.push(`${episode.title}（${episode.status}）`));
    if (data.standup?.directive?.podcastTopic) details.push(`下一題：${data.standup.directive.podcastTopic}`);
  }
  if (agent.roleCode === 'video_editor') {
    if (data.videos.length === 0) bits.push('片子還在等素材，這一班不剪新片。');
    data.videos.forEach((video) => details.push(`${video.title}（${video.status}）`));
  }
  if (agent.roleCode === 'publisher') {
    bits.push(nextBoard(data).lines.join('。'));
  }
  if (agent.roleCode === 'art_director' && data.standup?.directive?.imageBrief) {
    bits.push(`配圖要這樣：${data.standup.directive.imageBrief}`);
  }

  return { question: `${name}，你現在在做什麼？`, answer: bits.join(''), details };
}

export interface LiveReply {
  mode: 'answer' | 'note';
  question: string;
  answer: string;
  details: string[];
  bubble: string;
}

function wantsDirection(text: string) {
  return /不要|記得|記住|注意|下一班|交代|避開|改成|先別|以後|幫我記/.test(text) && !/[？?]/.test(text);
}

function topicOf(text: string): Ask | 'hot' | 'show' | 'film' | 'picture' | null {
  if (/成效|瀏覽|觸及|互動/.test(text)) return 'result';
  if (/下一|排程|幾點|今晚|什麼時候|何時|要發/.test(text)) return 'next';
  if (/熱門|新聞|關鍵字|時事|頭條/.test(text)) return 'hot';
  if (/podcast|播客|這一集|錄音/.test(text)) return 'show';
  if (/影片|短片|剪接|剪片/.test(text)) return 'film';
  if (/配圖|圖片|海報/.test(text)) return 'picture';
  if (/現在|在做|在忙|手上|誰/.test(text)) return 'now';
  return null;
}

function clip(text: string, max = 36) {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function liveAsk(
  agent: OfficeAgent,
  text: string,
  data: OfficeSnapshot,
  period: OfficeStatPeriod = '28',
): LiveReply {
  const name = nickname(agent);
  const question = text.trim();
  if (wantsDirection(question)) {
    return {
      mode: 'note',
      question,
      answer: `${name}記下了。下一班晨會只拿這句當方向，不會把它寫成已經發生的新聞或數字。`,
      details: [],
      bubble: '下一班我照這個方向',
    };
  }

  const topic = topicOf(question);
  if (topic === 'result' || topic === 'next' || topic === 'now') {
    const reply = officeReply(agent, topic, data, period);
    return { mode: 'answer', question, answer: reply.answer, details: reply.details, bubble: clip(reply.answer, 42) };
  }
  if (topic === 'hot') {
    const words = data.keywords ?? [];
    const answer = words.length
      ? `新聞收集這輪抓到的是：${words.slice(0, 8).join('、')}。`
      : '這一輪熱門關鍵字還沒抓到，我不會現編。';
    return { mode: 'answer', question, answer, details: words.slice(0, 8), bubble: clip(answer, 42) };
  }
  if (topic === 'show') {
    const lines = data.podcasts.map((episode) => `${episode.title}（${episode.status}）`);
    const next = data.standup?.directive?.podcastTopic;
    const answer = [
      lines.length ? `還沒上架的是：${lines.join('、')}。` : '現在沒有待上架的 Podcast。',
      next ? `下一題方向是：${next}。` : '',
    ].join('');
    return { mode: 'answer', question, answer, details: lines, bubble: clip(answer, 42) };
  }
  if (topic === 'film') {
    const lines = data.videos.map((video) => `${video.title}（${video.status}）`);
    const answer = lines.length ? `片子目前是：${lines.join('、')}。` : '片子還在等素材，這一班不剪新片。';
    return { mode: 'answer', question, answer, details: lines, bubble: clip(answer, 42) };
  }
  if (topic === 'picture') {
    const brief = data.standup?.directive?.imageBrief;
    const answer = brief ? `這一班配圖要這樣：${brief}` : '這一班還沒有留下配圖方向。';
    return { mode: 'answer', question, answer, details: brief ? [brief] : [], bubble: clip(answer, 42) };
  }

  const known = officeReply(agent, 'now', data, period);
  return {
    mode: 'answer',
    question,
    answer: `${known.answer}\n你這句我沒有另外一筆資料，不能現編。可以問現在在做什麼、下一件、成效，或這一輪熱門。`,
    details: known.details,
    bubble: '這句我沒有資料，不現編',
  };
}
