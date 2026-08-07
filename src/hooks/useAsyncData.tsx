import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (!cancelledRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelledRef.current) {
          if (e instanceof ApiError && e.status === 401) {
            window.location.href = '/login';
            return;
          }
          setError(e instanceof Error ? e.message : '載入失敗');
          setLoading(false);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload };
}

export function LoadingState({ label = '載入中…' }: { label?: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{label}</div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#B85454', marginBottom: 12 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
            background: 'var(--color-bg-soft)', cursor: 'pointer', fontWeight: 600,
          }}
        >
          重試
        </button>
      )}
    </div>
  );
}
