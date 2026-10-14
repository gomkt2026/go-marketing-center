import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { briefingFilm } from '@/data/briefings';

export function BriefingFilm() {
  const { slug } = useParams();
  const film = briefingFilm(slug);
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
        <p className="briefing-missing">找不到這支影片。<Link to="/briefings">回簡報專區</Link></p>
      </div>
    );
  }

  return (
    <div className="briefing-present">
      <header className="briefing-present-bar">
        <Link to="/briefings">離開</Link>
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
            {fullscreen ? '結束全螢幕' : '全螢幕'}
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
