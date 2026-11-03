import { useEffect, useState } from 'react';
import { EDITOR_INTROS, editorIntroSlug, type EditorIntroSlug } from '@/lib/editor-intros';

type Listener = (slug: EditorIntroSlug | null) => void;

const listeners = new Set<Listener>();
let audio: HTMLAudioElement | null = null;
let active: EditorIntroSlug | null = null;

function emit(slug: EditorIntroSlug | null) {
  active = slug;
  listeners.forEach((listener) => listener(slug));
}

function toggleIntro(slug: EditorIntroSlug) {
  const intro = EDITOR_INTROS[slug];
  if (active === slug && audio && !audio.paused) {
    audio.pause();
    emit(null);
    return;
  }
  if (audio) {
    audio.pause();
    audio = null;
  }
  const next = new Audio(intro.src);
  audio = next;
  emit(slug);
  next.onended = () => {
    if (audio === next) emit(null);
  };
  next.onerror = () => {
    if (audio === next) emit(null);
  };
  void next.play().catch(() => {
    if (audio === next) emit(null);
  });
}

export function useEditorIntro(slug: string | null | undefined): { playing: boolean; line: string; toggle: () => void } | null {
  const key = editorIntroSlug(slug);
  const [playing, setPlaying] = useState(active === key);
  useEffect(() => {
    if (!key) return;
    const listener: Listener = (current) => setPlaying(current === key);
    listeners.add(listener);
    listener(active);
    return () => { listeners.delete(listener); };
  }, [key]);
  if (!key) return null;
  return {
    playing,
    line: EDITOR_INTROS[key].line,
    toggle: () => toggleIntro(key),
  };
}

export function EditorIntroButton({
  slug,
  hearLabel,
  stopLabel,
}: {
  slug: string | null | undefined;
  hearLabel: string;
  stopLabel: string;
}) {
  const key = editorIntroSlug(slug);
  const intro = useEditorIntro(slug);
  if (!intro || !key) return null;
  const color = EDITOR_INTROS[key].color;
  return (
    <button
      type="button"
      className="editor-intro-btn"
      aria-pressed={intro.playing}
      aria-label={intro.playing ? stopLabel : hearLabel}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        intro.toggle();
      }}
      style={{
        marginLeft: 'auto',
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: 0,
        background: intro.playing ? color : '#1f2a1a',
        color: '#fff',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: intro.playing ? `0 0 0 6px ${color}33` : 'none',
      }}
    >
      <span aria-hidden style={{ fontSize: 14, marginLeft: intro.playing ? 0 : 2 }}>
        {intro.playing ? '❚❚' : '▶'}
      </span>
    </button>
  );
}
