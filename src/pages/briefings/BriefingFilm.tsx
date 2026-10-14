import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { briefingCatalog } from '@/data/briefings';
import { LocalLink, useCopy, useLocale } from '@/pages/public/locale';

export function BriefingFilm() {
  const { slug } = useParams();
  const { locale } = useLocale();
  const copy = useCopy();
  const { ui, films } = briefingCatalog(locale);
  const film = films.find((item) => item.slug === slug);

  useEffect(() => {
    const previous = document.title;
    document.title = `${film?.title ?? ui.pageTitle}${copy.titleJoin}${copy.brandName}`;
    return () => {
      document.title = previous;
    };
  }, [copy.brandName, copy.titleJoin, film?.title, ui.pageTitle]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'f' || event.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!film) {
    return (
      <div className="briefing-present">
        <p className="briefing-missing">{ui.missingFilm}<LocalLink to="/briefings">{ui.back}</LocalLink></p>
      </div>
    );
  }

  return (
    <div className="briefing-present">
      <header className="briefing-present-bar">
        <LocalLink to="/briefings">{ui.leave}</LocalLink>
        <div className="briefing-present-title">
          <strong>{film.title}</strong>
          <em>{film.duration} · {film.cue}</em>
        </div>
        <div className="briefing-present-tools">
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
      <div className="briefing-present-body">
        <div className="briefing-stage">
          <video src={film.src} poster={film.poster} controls autoPlay playsInline />
        </div>
      </div>
    </div>
  );
}
