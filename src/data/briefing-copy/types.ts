export interface SlideCopy {
  title: string;
  notes: string;
  videoLabel?: string;
}

export interface DeckCopy {
  title: string;
  kicker: string;
  summary: string;
  audience: string;
  sections: string[];
  slides: SlideCopy[];
}

export interface FilmCopy {
  title: string;
  summary: string;
  duration: string;
  cue: string;
}

export interface BriefingUi {
  pageTitle: string;
  eyebrow: string;
  lead: string;
  /** 投影片圖檔仍是中文原稿時，給英文與日文頁的一句說明。中文留空。 */
  artNote: string;
  pages: (count: number) => string;
  audiencePrefix: string;
  updatedPrefix: string;
  open: string;
  hasVideo: string;
  filmsTitle: string;
  filmsLead: string;
  shortsTitle: string;
  shortsLead: string;
  /** 短影片依品牌分組時，組名下面的一句話 */
  shortsBrandLead: { taskgo: string; washgo: string };
  missingDeck: string;
  missingFilm: string;
  back: string;
  leave: string;
  menu: string;
  showNotes: string;
  hideNotes: string;
  notesLabel: string;
  fullscreen: string;
  exitFullscreen: string;
  prev: string;
  next: string;
  backToSlides: string;
  shortcuts: string;
}

export interface BriefingCopy {
  ui: BriefingUi;
  alliance: DeckCopy;
  fixer: DeckCopy;
  films: FilmCopy[];
}

export function expandFixerSlides(
  head: SlideCopy[],
  named: Partial<Record<number, SlideCopy>>,
  fallback: SlideCopy,
  tail: SlideCopy[],
): SlideCopy[] {
  const slides = [...head];
  for (let page = 18; page <= 55; page += 1) {
    slides.push(named[page] ?? fallback);
  }
  return slides.concat(tail);
}
