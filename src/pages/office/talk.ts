import type { OfficeAgent, OfficeSnapshot } from './types';

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

function statOf(data: OfficeSnapshot, slug: string | null) {
  if (!slug) return null;
  return data.brandStats?.find((row) => row.slug === slug) ?? null;
}

function rate(interactions: number, views: number) {
  if (views <= 0) return '還沒有瀏覽';
  return `${((interactions / views) * 100).toFixed(1)}%`;
}

function statSentence(data: OfficeSnapshot, slug: string) {
  const stat = statOf(data, slug);
  const name = BRAND_NAME[slug] ?? slug;
  if (!stat || (stat.posts === 0 && stat.views === 0)) return `${name} 近 28 天還沒回收到瀏覽。`;
  const reach = stat.reach > 0 ? `觸及 ${compactNumber(stat.reach)}` : '觸及這段沒有分開記';
  return `${name} 近 28 天發了 ${stat.posts} 則，瀏覽 ${compactNumber(stat.views)}，${reach}，互動率 ${rate(stat.interactions, stat.views)}。`;
}

export function nextLine(data: OfficeSnapshot | null): { title: string; detail: string } {
  if (!data) return { title: '下一件', detail: '等下一班晨會' };
  if (data.nextJob) {
    const who = EDITOR[data.nextJob.slug] ?? data.nextJob.slug;
    return {
      title: '下一件要發',
      detail: `${who} · ${data.nextJob.platform} · ${taipeiWhen(data.nextJob.scheduledAt)} · ${data.nextJob.title}`,
    };
  }
  const brand = data.standup?.directive?.brands?.find((item) => item.theme);
  if (brand) {
    const who = EDITOR[brand.slug] ?? brand.slug;
    return { title: '下一件', detail: `${who}：${brand.theme}` };
  }
  if (data.quiet) return { title: '下一件', detail: '凌晨這一班只留方向，八點才發' };
  return { title: '下一件', detail: '等下一班晨會。八點、下午兩點、晚上八點、凌晨兩點。' };
}

export function officeReply(agent: OfficeAgent, ask: Ask, data: OfficeSnapshot): { question: string; answer: string; details: string[] } {
  const name = nickname(agent);
  const theme = themeOf(data, agent.brandSlug);
  const finding = data.findings.find((item) => item.slug === agent.brandSlug)?.summary;
  const details: string[] = [];

  if (ask === 'result') {
    if (agent.brandSlug) {
      return {
        question: `${name}，成效怎麼樣？`,
        answer: statSentence(data, agent.brandSlug),
        details: (data.brandStats ?? [])
          .filter((row) => row.slug === agent.brandSlug)
          .map((row) => `發文 ${row.posts} · 瀏覽 ${compactNumber(row.views)} · 觸及 ${row.reach > 0 ? compactNumber(row.reach) : '—'} · 互動 ${rate(row.interactions, row.views)}`),
      };
    }
    const lines = (data.brandStats ?? []).map((row) => statSentence(data, row.slug));
    return {
      question: `${name}，三個品牌成效怎麼樣？`,
      answer: lines.join('') || '近 28 天還沒有回收到數字。',
      details: lines,
    };
  }

  if (ask === 'next') {
    const job = data.nextJob;
    const mine = job && agent.brandSlug && job.slug === agent.brandSlug ? job : null;
    const target = mine ?? (agent.roleCode === 'publisher' || agent.roleCode === 'content_strategist' ? job : null);
    const bits = [];
    if (target) bits.push(`下一則排程是 ${BRAND_NAME[target.slug] ?? target.slug} 的 ${target.platform}，${taipeiWhen(target.scheduledAt)}，${target.title}。`);
    else if (theme) bits.push(`晨會留給我的下一則方向是：${theme}。`);
    else if (data.standup?.directive?.podcastTopic && agent.roleCode === 'podcast_producer') bits.push(`下一集題目是：${data.standup.directive.podcastTopic}。`);
    else if (data.quiet) bits.push('現在是凌晨，這一班只把方向留下，八點才發。');
    else bits.push(nextLine(data).detail);
    if (theme && !bits[0]?.includes(theme)) details.push(`方向：${theme}`);
    (data.standup?.directive?.brands ?? []).forEach((brand) => {
      if (brand.theme) details.push(`${EDITOR[brand.slug] ?? brand.slug}：${brand.theme}`);
    });
    return { question: `${name}，下一件是什麼？`, answer: bits.join(''), details };
  }

  const bits = [`${agent.task}。`];
  if (agent.persona.focus) bits.push(agent.persona.focus);
  if (theme) bits.push(`這一班我沿著「${theme}」在準備。`);
  if (finding && agent.roleCode === 'brand_ai') bits.push(`我剛記下來的是：${finding}`);
  if (agent.preview?.body) bits.push(`手上這篇${agent.preview.title ? `《${agent.preview.title}》` : ''}：${agent.preview.body}`);
  if (agent.persona.catchphrase) bits.push(agent.persona.catchphrase);

  if (agent.roleCode === 'market_analyst') {
    data.signals.slice(0, 4).forEach((signal) => details.push(signal.title));
    if (data.signals[0]) bits.push(`最新一則是：${data.signals[0].title}。`);
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
  if (agent.roleCode === 'publisher' && data.nextJob) {
    bits.push(`佇列最前面是 ${EDITOR[data.nextJob.slug] ?? data.nextJob.slug} 的 ${data.nextJob.platform}，${taipeiWhen(data.nextJob.scheduledAt)}。`);
  }
  if (agent.roleCode === 'art_director' && data.standup?.directive?.imageBrief) {
    bits.push(`配圖要這樣：${data.standup.directive.imageBrief}`);
  }

  return { question: `${name}，你現在在做什麼？`, answer: bits.join(''), details };
}
