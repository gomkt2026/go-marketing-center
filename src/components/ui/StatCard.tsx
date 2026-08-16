import { useEffect, useState } from 'react';
import { Card } from './Card';

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function StatCard({
  label, value, suffix, tone, delay,
}: { label: string; value: number; suffix?: string; tone?: string; delay?: number }) {
  const animated = useCountUp(value);
  return (
    <Card delay={delay} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: tone ?? 'var(--color-text)' }}>
        {animated.toLocaleString()}{suffix}
      </div>
    </Card>
  );
}
