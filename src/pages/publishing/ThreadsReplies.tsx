import { useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { ThreadsReplyStatus, ThreadsReplyTarget } from '@/types';

const TABS: { id: string; label: string }[] = [
  { id: 'pending', label: '待審核' },
  { id: 'replied', label: '已回覆' },
  { id: 'skipped', label: '已略過' },
  { id: 'failed', label: '失敗' },
];

const statusTone: Record<ThreadsReplyStatus, BadgeTone> = {
  pending: 'accent', approved: 'accent', replied: 'primary', skipped: 'default', failed: 'danger',
};
const statusLabel: Record<ThreadsReplyStatus, string> = {
  pending: '待審核', approved: '已核准', replied: '已回覆', skipped: '已略過', failed: '發布失敗',
};

export function ThreadsReplies() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.threadReplies(slug, tab) : Promise.reject(new Error('no slug')),
    [slug, tab],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;

  async function act(target: ThreadsReplyTarget, action: 'approve' | 'skip', replyText?: string) {
    if (!slug) return;
    setBusyId(target.id);
    setMessage(null);
    try {
      const res = await api.actThreadReply(slug, { id: target.id, action, replyText });
      setMessage(action === 'approve'
        ? `已發布回覆${res.permalink ? `:${res.permalink}` : ''}`
        : '已略過這則貼文');
      setEditingId(null);
      reload();
    } catch (e) {
      setMessage(`操作失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} Threads 互動引流`}
        subtitle="系統定時搜尋 Threads 熱門公開貼文,由 AI 以品牌第一線人設生成回覆;審核通過即發布,透過高品質互動提升帳號曝光"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'primary' : 'ghost'}
            onClick={() => { setTab(t.id); setEditingId(null); setMessage(null); }}
          >
            {t.label}
          </Button>
        ))}
        {data && (
          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            近 24 小時已回覆 {data.replied24h} 則
          </span>
        )}
      </div>

      {message && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      {loading && <LoadingState />}
      {!loading && (error || !data) && <ErrorState message={error ?? '載入失敗'} onRetry={reload} />}

      {!loading && data && (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.targets.length === 0 && (
            <Card>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {tab === 'pending'
                  ? '目前沒有待審核的回覆。排程每小時會搜尋一輪熱門貼文;若一直沒有項目,請確認 Threads token 已具備 threads_keyword_search 權限,並在「社群帳號」完成設定。'
                  : '這個分類目前沒有項目'}
              </p>
            </Card>
          )}
          {data.targets.map((t) => {
            const isEditing = editingId === t.id;
            const busy = busyId === t.id;
            return (
              <Card key={t.id}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                  <Badge tone="secondary">關鍵字:{t.sourceKeyword}</Badge>
                  {t.relevanceScore != null && (
                    <Badge tone={Number(t.relevanceScore) >= 0.8 ? 'primary' : 'default'}>
                      相關性 {Math.round(Number(t.relevanceScore) * 100)}%
                    </Badge>
                  )}
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                    {new Date(t.createdAt).toLocaleString('zh-TW')}
                  </span>
                </div>

                {/* 目標貼文 */}
                <div style={{
                  background: 'var(--color-bg-soft)', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                    @{t.targetUsername ?? '匿名'} 的貼文
                    {t.targetPermalink && (
                      <a href={t.targetPermalink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontWeight: 500 }}>
                        查看原文 ↗
                      </a>
                    )}
                  </div>
                  <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                    {t.targetText}
                  </p>
                </div>

                {t.relevanceReason && (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                    AI 評估:{t.relevanceReason}
                  </p>
                )}

                {/* 回覆內容 */}
                {t.replyText != null && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                      {t.status === 'replied' ? '已發布的回覆' : 'AI 生成的回覆'}
                      {t.replyPermalink && (
                        <a href={t.replyPermalink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontWeight: 500 }}>
                          查看回覆 ↗
                        </a>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={4}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
                          border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                          fontFamily: 'inherit', resize: 'vertical',
                        }}
                      />
                    ) : (
                      <p style={{
                        fontSize: 13.5, whiteSpace: 'pre-wrap', padding: '10px 12px',
                        border: '1px solid var(--color-border)', borderRadius: 10,
                      }}>
                        {t.replyText}
                      </p>
                    )}
                  </div>
                )}

                {t.errorMessage && (
                  <p style={{ fontSize: 12, color: '#B85454', marginBottom: 8 }}>錯誤:{t.errorMessage}</p>
                )}

                {/* 操作 */}
                {(t.status === 'pending' || t.status === 'failed') && t.replyText != null && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isEditing ? (
                      <>
                        <Button variant="primary" disabled={busy} onClick={() => void act(t, 'approve', editText)}>
                          {busy ? '發布中...' : '發布修改後的回覆'}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>取消編輯</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="primary" disabled={busy} onClick={() => void act(t, 'approve')}>
                          {busy ? '發布中...' : '核准並發布'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => { setEditingId(t.id); setEditText(t.replyText ?? ''); }}
                        >
                          編輯
                        </Button>
                        <Button variant="danger" disabled={busy} onClick={() => void act(t, 'skip')}>略過</Button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: 'var(--color-bg-soft)' }}>
        <strong style={{ fontSize: 13 }}>運作方式與防封號機制</strong>
        <ul style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.9, paddingLeft: 18, marginTop: 6 }}>
          <li>排程每小時輪一個品牌:以行業關鍵字搜尋 Threads 熱門公開貼文,AI 只挑真正相關的(相關性 ≥ 70%)生成回覆</li>
          <li>回覆走品牌第一線人設、不放連結、不促銷;每日上限與發布間隔可在「<Link to={`/${slug}/social`}>社群帳號</Link>」設定</li>
          <li>開啟「自動回覆」後高分回覆會直接發布;關閉則全部進入此頁待審核</li>
          <li>發布失敗(如被限流)會自動暫停該品牌當日後續回覆,避免觸發平台風控</li>
        </ul>
      </Card>
    </div>
  );
}
