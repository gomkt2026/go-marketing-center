/** 外地簡報用的簡報庫。投影片圖檔是中文原稿，標題與說明依語系切換。 */

import { BRIEFING_COPY } from '@/data/briefing-copy';
import type { DeckCopy } from '@/data/briefing-copy/types';
import type { Locale } from '@/pages/public/copy';

export type BriefingBrand = 'taskgo' | 'homigo' | 'washgo';

export interface BriefingVideo {
  src: string;
  label: string;
  /** 直式畫面，播放時左右留空 */
  vertical?: boolean;
}

export interface BriefingSlide {
  title: string;
  notes: string;
  video?: BriefingVideo;
}

export interface BriefingSection {
  label: string;
  /** 1-based 起始頁 */
  at: number;
}

export interface BriefingDeck {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  audience: string;
  updated: string;
  brands: BriefingBrand[];
  sections: BriefingSection[];
  slides: BriefingSlide[];
}

export interface BriefingFilm {
  slug: string;
  title: string;
  summary: string;
  src: string;
  poster: string;
  duration: string;
  brands: BriefingBrand[];
  /** 什麼時候播 */
  cue: string;
}

export interface BriefingCatalog {
  ui: (typeof BRIEFING_COPY)['zh']['ui'];
  decks: BriefingDeck[];
  films: BriefingFilm[];
}

export const BRAND_LABEL: Record<BriefingBrand, string> = {
  taskgo: 'TaskGo',
  homigo: 'Homigo',
  washgo: 'Washgo',
};

const ALLIANCE_AT = [1, 4, 15, 19, 27];
const FIXER_AT = [1, 3, 8, 18, 56];
const ALLIANCE_VIDEO: Record<number, { src: string; vertical?: boolean }> = {
  8: { src: '/briefings/alliance-1012/washgo.mp4' },
  21: { src: '/briefings/alliance-1012/jiangcheng.mp4', vertical: true },
};

const FILM_MEDIA: { slug: string; src: string; poster: string; brands: BriefingBrand[] }[] = [
  {
    slug: 'taskgo-washgo',
    src: '/briefings/alliance-1012/washgo.mp4',
    poster: '/briefings/alliance-1012/washgo-poster.jpg',
    brands: ['taskgo', 'washgo'],
  },
  {
    slug: 'jiangcheng-report',
    src: '/briefings/alliance-1012/jiangcheng.mp4',
    poster: '/briefings/alliance-1012/jiangcheng-poster.jpg',
    brands: ['taskgo', 'homigo', 'washgo'],
  },
  {
    slug: 'online-repair',
    src: '/briefings/films/online-repair.mp4',
    poster: '/briefings/films/online-repair.jpg',
    brands: ['taskgo'],
  },
  {
    slug: 'mobile-survey',
    src: '/briefings/films/mobile-survey.mp4',
    poster: '/briefings/films/mobile-survey.jpg',
    brands: ['taskgo'],
  },
  {
    slug: 'survey-quote',
    src: '/briefings/films/survey-quote.mp4',
    poster: '/briefings/films/survey-quote.jpg',
    brands: ['taskgo'],
  },
];

export function slideImage(slug: string, index: number): string {
  return `/briefings/${slug}/slides/s-${String(index + 1).padStart(2, '0')}.jpg`;
}

function buildDeck(
  slug: string,
  brands: BriefingBrand[],
  updated: string,
  at: number[],
  videos: Record<number, { src: string; vertical?: boolean }>,
  text: DeckCopy,
  expectedSlides: number,
): BriefingDeck {
  if (text.sections.length !== at.length || text.slides.length !== expectedSlides) {
    throw new Error(`${slug} copy is ${text.sections.length} sections / ${text.slides.length} slides`);
  }
  return {
    slug,
    brands,
    updated,
    title: text.title,
    kicker: text.kicker,
    summary: text.summary,
    audience: text.audience,
    sections: text.sections.map((label, index) => ({ label, at: at[index] })),
    slides: text.slides.map((slide, index) => {
      const media = videos[index];
      if (Boolean(media) !== Boolean(slide.videoLabel)) {
        throw new Error(`${slug} slide ${index + 1} video label does not match the file`);
      }
      return {
        title: slide.title,
        notes: slide.notes,
        video: media && slide.videoLabel ? { ...media, label: slide.videoLabel } : undefined,
      };
    }),
  };
}

export function briefingCatalog(locale: Locale): BriefingCatalog {
  const copy = BRIEFING_COPY[locale];
  if (copy.films.length !== FILM_MEDIA.length) {
    throw new Error('briefing film copy length does not match');
  }
  return {
    ui: copy.ui,
    decks: [
      buildDeck('alliance-1012', ['taskgo', 'homigo', 'washgo'], '2026/10/12', ALLIANCE_AT, ALLIANCE_VIDEO, copy.alliance, 30),
      buildDeck('fixercowork', [], '2026/10/14', FIXER_AT, {}, copy.fixer, 61),
    ],
    films: FILM_MEDIA.map((media, index) => ({ ...media, ...copy.films[index] })),
  };
}

export function sectionSlides(deck: BriefingDeck, sectionIndex: number): { slide: BriefingSlide; at: number }[] {
  const start = deck.sections[sectionIndex].at;
  const end = deck.sections[sectionIndex + 1]?.at ?? deck.slides.length + 1;
  return deck.slides.slice(start - 1, end - 1).map((slide, offset) => ({
    slide,
    at: start + offset,
  }));
}
