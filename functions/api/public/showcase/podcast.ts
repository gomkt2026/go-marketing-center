import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { scrubPersonal } from './posts';

const FEED_URL = 'https://feeds.soundon.fm/podcasts/e70c6ec4-699d-4972-a735-88447eaa2d09.xml';

export interface ShowcaseEpisode {
  title: string;
  publishedAt: string | null;
  summary: string;
  url: string | null;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

/** 取前兩句，去掉 SoundOn 頁尾與 HTML。 */
function summarize(desc: string, title: string): string {
  const bare = title.replace(/^EP\.?\s*\d+[\s|｜:：-]*/i, '').trim();
  let text = desc
    .replace(/--\s*Hosting provided by[\s\S]*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (bare && text.startsWith(bare)) text = text.slice(bare.length).trim();
  const sentences = text.match(/[^。！？!?]+[。！？!?]/g) ?? [text];
  return scrubPersonal(sentences.slice(0, 2).join('').slice(0, 140));
}

let memo: { exp: number; value: ShowcaseEpisode | null } | null = null;

export const onRequestGet: PagesFunction<Env> = async () => {
  const headers = { 'Cache-Control': 'public, max-age=1800' };
  if (memo && memo.exp > Date.now()) return json({ episode: memo.value }, 200, headers);
  try {
    const res = await fetch(FEED_URL, { cf: { cacheTtl: 1800 } } as RequestInit);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const xml = await res.text();
    const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
    if (!item) throw new Error('feed has no item');
    const pub = tag(item, 'pubDate');
    const link = tag(item, 'link');
    const title = tag(item, 'title');
    const episode: ShowcaseEpisode = {
      title: scrubPersonal(title),
      publishedAt: pub ? new Date(pub).toISOString() : null,
      summary: summarize(tag(item, 'description'), title),
      url: /^https:\/\//i.test(link) ? link : null,
    };
    memo = { exp: Date.now() + 30 * 60_000, value: episode };
    return json({ episode }, 200, headers);
  } catch (e) {
    console.error('[showcase/podcast]', e);
    return json({ episode: null }, 200);
  }
};
