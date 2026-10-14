import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { briefingCatalog, slideImage } from '@/data/briefings';
import { LocalLink, useCopy, useLocale } from '@/pages/public/locale';

function clamp(value: number, max: number) {
  return Math.min(Math.max(value, 0), max);
}

export function BriefingPlay() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { locale } = useLocale();
  const copy = useCopy();
  const { ui, decks } = briefingCatalog(locale);
  const deck = decks.find((item) => item.slug === slug);

  useEffect(() => {
    const previous = document.title;
    document.title = `${deck?.title ?? ui.pageTitle}${copy.titleJoin}${copy.brandName}`;
    return () => {
      document.title = previous;
    };
  }, [copy.brandName, copy.titleJoin, deck?.title, ui.pageTitle]);
  const start = clamp((Number(params.get('at')) || 1) - 1, (deck?.slides.length ?? 1) - 1);
  const [index, setIndex] = useState(start);
  const [notesOn, setNotesOn] = useState(false);
  const [menuOn, setMenuOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [blank, setBlank] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const last = (deck?.slides.length ?? 1) - 1;
  const go = useCallback((next: number) => {
    setVideoOn(false);
    setBlank(false);
    setMenuOn(false);
    setIndex(clamp(next, last));
  }, [last]);

  useEffect(() => {
    if (!deck) return;
    for (const delta of [1, 2, -1]) {
      const i = index + delta;
      if (i < 0 || i > last) continue;
      const img = new Image();
      img.src = slideImage(deck.slug, i);
    }
  }, [deck, index, last]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!deck) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if ([' ', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp', 'Home', 'End'].includes(key)) {
        event.preventDefault();
      }
      if (blank) {
        if (key === 'Escape') return;
        setBlank(false);
        return;
      }
      if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') go(index + 1);
      else if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp' || key === 'Backspace') go(index - 1);
      else if (key === 'Home') go(0);
      else if (key === 'End') go(last);
      else if (key === 'n' || key === 'N') setNotesOn((open) => !open);
      else if (key === 'm' || key === 'M') setMenuOn((open) => !open);
      else if (key === 'b' || key === 'B') setBlank(true);
      else if (key === 'p' || key === 'P') setVideoOn(true);
      else if (key === 'f' || key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blank, deck, go, index, last]);

  if (!deck) {
    return (
      <div className="briefing-present">
        <p className="briefing-missing">{ui.missingDeck}<LocalLink to="/briefings">{ui.back}</LocalLink></p>
      </div>
    );
  }

  const slide = deck.slides[index];
  const section = [...deck.sections].reverse().find((item) => item.at <= index + 1);

  return (
    <div className="briefing-present">
      <header className="briefing-present-bar">
        <LocalLink to="/briefings">{ui.leave}</LocalLink>
        <div className="briefing-present-title">
          <span>{section?.label}</span>
          <strong>{index + 1} / {deck.slides.length}</strong>
          <em>{slide.title}</em>
        </div>
        <div className="briefing-present-tools">
          <button type="button" onClick={() => setMenuOn((open) => !open)}>{ui.menu}</button>
          <button type="button" onClick={() => setNotesOn((open) => !open)}>{notesOn ? ui.hideNotes : ui.showNotes}</button>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
          >
            {fullscreen ? ui.exitFullscreen : ui.fullscreen}
          </button>
        </div>
      </header>

      <div className={`briefing-present-body${notesOn ? ' has-notes' : ''}`}>
        <div
          className="briefing-stage"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button, a, video')) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            go(event.clientX - bounds.left < bounds.width * 0.22 ? index - 1 : index + 1);
          }}
        >
          {videoOn && slide.video ? (
            <video
              key={slide.video.src}
              src={slide.video.src}
              controls
              autoPlay
              playsInline
              className={slide.video.vertical ? 'is-vertical' : undefined}
            />
          ) : (
            <img src={slideImage(deck.slug, index)} alt={slide.title} />
          )}
          {slide.video && !videoOn && (
            <button type="button" className="briefing-play-video" onClick={() => setVideoOn(true)}>
              {slide.video.label}
            </button>
          )}
          <button type="button" className="briefing-arrow is-prev" aria-label={ui.prev} onClick={() => go(index - 1)}>‹</button>
          <button type="button" className="briefing-arrow is-next" aria-label={ui.next} onClick={() => go(index + 1)}>›</button>
        </div>
        {notesOn && (
          <aside className="briefing-notes">
            <div className="briefing-notes-label">{ui.notesLabel}</div>
            <h3>{slide.title}</h3>
            {slide.notes.split('\n').map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
          </aside>
        )}
      </div>

      {menuOn && (
        <div className="briefing-menu">
          {deck.sections.map((item) => (
            <div key={item.label}>
              <button type="button" onClick={() => go(item.at - 1)}>{item.label}</button>
              <ol>
                {deck.slides.map((itemSlide, itemIndex) => {
                  const nextAt = deck.sections.find((sectionItem) => sectionItem.at > item.at)?.at ?? deck.slides.length + 1;
                  if (itemIndex + 1 < item.at || itemIndex + 1 >= nextAt) return null;
                  return (
                    <li key={itemSlide.title}>
                      <button type="button" className={itemIndex === index ? 'is-current' : undefined} onClick={() => go(itemIndex)}>
                        {itemIndex + 1}. {itemSlide.title}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      {blank && <button type="button" className="briefing-blank" aria-label={ui.backToSlides} onClick={() => setBlank(false)} />}

      <footer className="briefing-present-foot">
        {ui.shortcuts}
      </footer>
    </div>
  );
}
