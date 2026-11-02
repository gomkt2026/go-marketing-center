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

function clip(text: string, max = 36) {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function pairLines(left: string, right: string, data: OfficeSnapshot | null): { left: string; right: string } {
  const keyword = data?.keywords?.[0];
  const jobs = ['taskgo', 'homigo', 'washgo'].map((slug) => jobLine(slug, data)).join('。');
  if (left === '新聞收集' || right === '新聞收集') {
    return {
      left: clip(keyword ? `熱門現在是「${keyword}」` : '這輪熱門關鍵字還沒抓到'),
      right: clip(keyword ? '三個品牌分開用，不硬湊成同一篇' : '等關鍵字進來再排方向'),
    };
  }
  if (left === '發文小編' || right === '發文小編') {
    return {
      left: '三個品牌的下一則我對過了',
      right: clip(jobs, 42),
    };
  }
  if ((left === '小咪' && right === '阿樂') || (left === '阿樂' && right === '小咪')) {
    return {
      left: clip(jobLine('homigo', data)),
      right: clip(jobLine('washgo', data)),
    };
  }
  return {
    left: clip(keyword ? `可以碰的熱門是「${keyword}」` : '這班先對下一則排程'),
    right: '對到了再寫，沒有的數字不補',
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
