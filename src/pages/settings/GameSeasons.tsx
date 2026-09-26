import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import {
  ApiError, gameAdminApi, type GameBoardEntry, type GameSeason, type GameSeasonInput,
} from '@/lib/api';

const muted: CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 };
const input: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-bg-soft)', width: '100%', boxSizing: 'border-box',
};
const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--color-border)', whiteSpace: 'nowrap' };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

function emptyForm(): GameSeasonInput {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 14 * 86400_000);
  return { name: '', startsAt: start.toISOString(), endsAt: end.toISOString(), prize: '', topN: 10, isActive: true };
}

function seasonStatus(s: GameSeason): { label: string; tone: 'success' | 'default' | 'accent' } {
  const now = Date.now();
  if (!s.isActive) return { label: '停用', tone: 'default' };
  if (now < new Date(s.startsAt).getTime()) return { label: '尚未開始', tone: 'accent' };
  if (now >= new Date(s.endsAt).getTime()) return { label: '已結束', tone: 'default' };
  return { label: '進行中', tone: 'success' };
}

function downloadCsv(filename: string, rows: GameBoardEntry[]) {
  const header = ['名次', '暱稱', '手機', '最佳成績', '遊玩次數', '達成時間', '得獎', '得獎備註', '取消資格'];
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    r.rank, r.nickname, r.phone, r.score, r.plays, formatDateTime(r.achievedAt),
    r.isWinner ? '是' : '', r.winnerNote, r.isBlocked ? '是' : '',
  ].map(cell).join(','));
  const blob = new Blob([`\uFEFF${[header.map(cell).join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SeasonForm({
  initial, onSave, onCancel,
}: { initial: GameSeasonInput; onSave: (v: GameSeasonInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>賽季名稱</span>
        <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：2026 中秋匠城挑戰賽" required />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>開始時間</span>
          <input
            type="datetime-local"
            style={input}
            value={toLocalInput(form.startsAt)}
            onChange={(e) => e.target.value && setForm({ ...form, startsAt: new Date(e.target.value).toISOString() })}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>結束時間</span>
          <input
            type="datetime-local"
            style={input}
            value={toLocalInput(form.endsAt)}
            onChange={(e) => e.target.value && setForm({ ...form, endsAt: new Date(e.target.value).toISOString() })}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>得獎名額（前 N 名）</span>
          <input type="number" min={1} max={100} style={input} value={form.topN} onChange={(e) => setForm({ ...form, topN: Number(e.target.value) })} />
        </label>
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>獎品說明</span>
        <textarea
          style={{ ...input, minHeight: 80, resize: 'vertical' }}
          value={form.prize}
          onChange={(e) => setForm({ ...form, prize: e.target.value })}
          placeholder={'第一行會顯示在遊戲標題畫面，例如：第 1 名 Switch 一台、第 2–10 名 7-11 禮券 200 元'}
        />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        啟用（在活動期間內才會收成績）
      </label>
      {err && <div style={{ fontSize: 13, color: '#B85454' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" disabled={saving}>{saving ? '儲存中…' : '儲存賽季'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}

export function GameSeasons() {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<GameSeason[]>([]);
  const [selected, setSelected] = useState<string>('all');
  const [editing, setEditing] = useState<{ id: string | null; value: GameSeasonInput } | null>(null);
  const [entries, setEntries] = useState<GameBoardEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadSeasons = useCallback(async () => {
    try {
      const { seasons: list } = await gameAdminApi.seasons();
      setSeasons(list);
      setSelected((cur) => (cur === 'all' && list.length ? list[0].id : cur));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '賽季載入失敗');
    }
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    setBoardLoading(true);
    try {
      const { entries: list } = await gameAdminApi.leaderboard(id);
      setEntries(list);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '排行榜載入失敗');
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => { void loadSeasons(); }, [loadSeasons]);
  useEffect(() => { void loadBoard(selected); }, [selected, loadBoard]);

  if (user?.role !== 'super_admin') {
    return (
      <div>
        <PageHeader title="遊戲排行榜" />
        <Card><p style={muted}>只有集團管理者可以管理遊戲賽季與得獎名單。</p></Card>
      </div>
    );
  }

  const season = seasons.find((s) => s.id === selected) ?? null;

  async function saveSeason(v: GameSeasonInput) {
    if (editing?.id) await gameAdminApi.updateSeason(editing.id, v);
    else {
      const { id } = await gameAdminApi.createSeason(v);
      setSelected(id);
    }
    setEditing(null);
    await loadSeasons();
  }

  async function removeSeason(s: GameSeason) {
    if (!window.confirm(`確定刪除「${s.name}」？這個賽季的得獎標記會一起刪除，成績會移到總榜。`)) return;
    await gameAdminApi.deleteSeason(s.id);
    setSelected('all');
    await loadSeasons();
  }

  async function toggleWinner(e: GameBoardEntry) {
    if (!season) return;
    const note = e.isWinner ? '' : (window.prompt(`${e.nickname} 的得獎備註（例如獎項、寄送狀態），可留空`, '') ?? null);
    if (note === null) return;
    await gameAdminApi.setWinner(season.id, e.playerId, !e.isWinner, note);
    await loadBoard(selected);
  }

  async function markTopN() {
    if (!season) return;
    const top = entries.filter((e) => !e.isBlocked).slice(0, season.topN).filter((e) => !e.isWinner);
    if (!top.length) return;
    if (!window.confirm(`把前 ${season.topN} 名（排除已取消資格者）標記為得獎者？`)) return;
    for (const e of top) await gameAdminApi.setWinner(season.id, e.playerId, true, '');
    await loadBoard(selected);
  }

  async function toggleBlocked(e: GameBoardEntry) {
    const msg = e.isBlocked ? `恢復 ${e.nickname} 的參賽資格？` : `取消 ${e.nickname} 的參賽資格？他的成績會從公開排行榜移除。`;
    if (!window.confirm(msg)) return;
    await gameAdminApi.setBlocked(e.playerId, !e.isBlocked);
    await loadBoard(selected);
  }

  return (
    <div>
      <PageHeader
        title="遊戲排行榜"
        subtitle="管理「匠城出任務」賽季、獎品與得獎名單。公開排行榜只顯示暱稱與遮罩手機。"
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/game/" target="_blank" rel="noopener"><Button variant="ghost">開啟遊戲</Button></a>
            <Button onClick={() => setEditing({ id: null, value: emptyForm() })}>新增賽季</Button>
          </div>
        )}
      />

      {err && <Card style={{ marginBottom: 16 }}><div style={{ fontSize: 13, color: '#B85454' }}>{err}</div></Card>}

      {editing && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>{editing.id ? '編輯賽季' : '新增賽季'}</h3>
          <SeasonForm key={editing.id ?? 'new'} initial={editing.value} onSave={saveSeason} onCancel={() => setEditing(null)} />
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>賽季</h3>
        {!seasons.length && <p style={muted}>還沒有賽季。沒有進行中的賽季時，玩家成績會記在總榜。</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {seasons.map((s) => {
            const st = seasonStatus(s);
            const active = s.id === selected;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary-soft)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 200 }}
                >
                  <div style={{ fontWeight: 700 }}>{s.name} <Badge tone={st.tone}>{st.label}</Badge></div>
                  <div style={muted}>
                    {formatDateTime(s.startsAt)} – {formatDateTime(s.endsAt)}・前 {s.topN} 名得獎
                  </div>
                </button>
                <Button variant="ghost" onClick={() => setEditing({ id: s.id, value: { ...s } })}>編輯</Button>
                <Button variant="danger" onClick={() => void removeSeason(s)}>刪除</Button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setSelected('all')}
            style={{
              all: 'unset', cursor: 'pointer', padding: '10px 12px', borderRadius: 10, fontWeight: 700,
              border: `1px solid ${selected === 'all' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: selected === 'all' ? 'var(--color-primary-soft)' : 'transparent',
            }}
          >
            總榜（所有成績）
          </button>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, flex: 1 }}>{season ? `${season.name} 排名` : '總榜排名'}</h3>
          {season && <Button variant="secondary" onClick={() => void markTopN()}>標記前 {season.topN} 名得獎</Button>}
          <Button
            variant="ghost"
            onClick={() => downloadCsv(`${season ? season.name : '總榜'}-排行榜.csv`, entries)}
            disabled={!entries.length}
          >
            匯出 CSV
          </Button>
        </div>
        {season?.prize && <p style={{ ...muted, whiteSpace: 'pre-line', marginBottom: 8 }}>獎品：{season.prize}</p>}
        {boardLoading && <p style={muted}>載入中…</p>}
        {!boardLoading && !entries.length && <p style={muted}>這個榜還沒有成績。</p>}
        {!boardLoading && entries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>名次</th>
                  <th style={th}>暱稱</th>
                  <th style={th}>手機</th>
                  <th style={th}>最佳成績</th>
                  <th style={th}>次數</th>
                  <th style={th}>達成時間</th>
                  {season && <th style={th}>得獎</th>}
                  <th style={th}>資格</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.playerId} style={{ opacity: e.isBlocked ? 0.5 : 1 }}>
                    <td style={td}>{e.rank}</td>
                    <td style={td}>{e.nickname}</td>
                    <td style={td}>{e.phone || '（無法解密）'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>NT$ {e.score.toLocaleString('en-US')}</td>
                    <td style={td}>{e.plays}</td>
                    <td style={td}>{formatDateTime(e.achievedAt)}</td>
                    {season && (
                      <td style={td}>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" checked={e.isWinner} onChange={() => void toggleWinner(e)} />
                          {e.winnerNote && <span style={muted}>{e.winnerNote}</span>}
                        </label>
                      </td>
                    )}
                    <td style={td}>
                      <Button variant={e.isBlocked ? 'ghost' : 'danger'} onClick={() => void toggleBlocked(e)}>
                        {e.isBlocked ? '恢復資格' : '取消資格'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
