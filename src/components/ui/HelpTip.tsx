import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

export function HelpTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={label ?? '這個功能是做什麼'}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={iconBtn}
      >
        ?
      </button>
      {open && (
        <span id={id} role="tooltip" style={bubble}>
          {text}
        </span>
      )}
    </span>
  );
}

const iconBtn: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-soft)',
  color: 'var(--color-text-muted)',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const bubble: CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  top: 'calc(100% + 6px)',
  left: 0,
  width: 'min(280px, 70vw)',
  padding: '8px 10px',
  borderRadius: 8,
  background: '#1F2A24',
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.6,
  boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
};
