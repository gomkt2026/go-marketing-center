import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApiError, gameAdminApi, type GameWish } from '@/lib/api';

const muted: CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 };

const KIND_LABEL: Record<GameWish['kind'], string> = {
  feature: '想要的功能',
  bug: '遇到的問題',
  cheer: '給師傅的話',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

export function GameWishes() {
  const [rows, setRows] = useState<GameWish[]>([]);
  const [filter, setFilter] = useState<'visible' | 'hidden' | 'all'>('visible');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await gameAdminApi.wishes();
      setRows(data.wishes);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '留言板載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = rows.filter((r) => filter === 'all' || r.status === filter);

  async function toggle(row: GameWish) {
    const next = row.status === 'visible' ? 'hidden' : 'visible';
    try {
      await gameAdminApi.setWishStatus(row.id, next);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '更新失敗');
    }
  }

  return (
    <Card>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>留言板</h3>
      <p style={{ ...muted, marginTop: 0 }}>公開頁「匠城出任務」玩家留下的功能想法。不適合公開的內容可以先隱藏。</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant={filter === 'visible' ? 'primary' : 'ghost'} onClick={() => setFilter('visible')}>
          公開中 {rows.filter((r) => r.status === 'visible').length}
        </Button>
        <Button variant={filter === 'hidden' ? 'primary' : 'ghost'} onClick={() => setFilter('hidden')}>
          已隱藏 {rows.filter((r) => r.status === 'hidden').length}
        </Button>
        <Button variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')}>全部</Button>
      </div>
      {err && <p style={{ ...muted, color: '#9a3412' }}>{err}</p>}
      {loading && <p style={muted}>載入中…</p>}
      {!loading && !shown.length && <p style={muted}>目前沒有這一類留言。</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((row) => (
          <div key={row.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <b>{row.nickname}</b>
                <span style={{ marginLeft: 8 }}>
                  <Badge tone={row.status === 'visible' ? 'success' : 'default'}>
                    {row.status === 'visible' ? '公開' : '已隱藏'}
                  </Badge>
                </span>
                <div style={muted}>{KIND_LABEL[row.kind]}・{row.supports} 人想要・{formatDateTime(row.createdAt)}</div>
              </div>
              <Button variant={row.status === 'visible' ? 'danger' : 'ghost'} onClick={() => void toggle(row)}>
                {row.status === 'visible' ? '隱藏' : '重新公開'}
              </Button>
            </div>
            <p style={{ ...muted, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{row.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
