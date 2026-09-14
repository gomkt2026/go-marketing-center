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

function checkTone(ok: boolean | null): BadgeTone {
  if (ok === true) return 'primary';
  if (ok === false) return 'danger';
  return 'default';
}

export function ThreadsReplies() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [tab, setTab] = useState('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => slug ? api.threadReplies(slug, tab) : Promise.reject(new Error('no slug')),
    [slug, tab],
  );

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;

  const capReached = !!data && (data.replied1h >= data.replyHourlyCap || data.replied24h >= data.replyDailyCap);

  async function scanNow() {
    if (!slug) return;
    setScanning(true);
    setMessage(null);
    try {
      const res = await api.actThreadReply(slug, { action: 'scan' });
      const bits = [res.detail];
      if (res.queued) bits.push(`入庫 ${res.queued} 則`);
      if (res.published) bits.push(`已自動發布 ${res.published} 則`);
      setMessage(bits.filter(Boolean).join(' · ') || '掃描完成');
      reload();
    } catch (e) {
      setMessage(`掃描失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setScanning(false);
    }
  }

  async function setAutoReply(on: boolean) {
    if (!slug) return;
    setToggling(true);
    setMessage(null);
    try {
      const res = await api.actThreadReply(slug, { action: 'set-auto-reply', autoReply: on });
      setMessage(res.detail ?? (on ? '已開啟自動回覆' : '已關閉自動回覆'));
      reload();
    } catch (e) {
      setMessage(`開關失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setToggling(false);
    }
  }

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
        subtitle="掃熱門公開貼文、以品牌第一線語氣生成回覆;可人工核准,或開啟自動回覆在額度內直接發布"
      />

      {data && (
        <Card style={{ marginBottom: 14, borderLeft: `4px solid ${data.autoReplyReady && data.autoReply ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: 14 }}>自動回覆狀態</strong>
              <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text)' }}>
                {data.autoReply && data.autoReplyReady
                  ? `${brand.name} 可以自動回覆:半點排程會搜文入庫,並在額度內直接發布。`
                  : data.autoReply && !data.autoReplyReady
                    ? `開關已開,但現在還不能真的自動發。${data.blockReason ?? ''}`
                    : data.autoReplyReady
                      ? '搜尋權限已通。開啟自動回覆後,待審稿會在額度內直接發布;關閉則全部等人審。'
                      : data.blockReason ?? '請先掃一輪,確認能不能搜到別人的公開文。'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant={data.autoReply ? 'danger' : 'primary'}
                disabled={toggling || !data.hasThreadsAccount}
                onClick={() => void setAutoReply(!data.autoReply)}
              >
                {toggling ? '儲存中...' : data.autoReply ? '關閉自動回覆' : '開啟自動回覆'}
              </Button>
              {!data.hasThreadsAccount && (
                <Link to={`/${slug}/social`}>
                  <Button variant="secondary">去連接 Threads</Button>
                </Link>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Badge tone={checkTone(data.hasThreadsAccount)}>
              {data.hasThreadsAccount
                ? `Threads 已連接${data.threadsUsername ? ` @${data.threadsUsername}` : ''}`
                : '尚未連接 Threads'}
            </Badge>
            <Badge tone={checkTone(data.canSearchPublic)}>
              {data.canSearchPublic === true
                ? '可搜到別人的公開文'
                : data.canSearchPublic === false
                  ? '只能搜到自己的文(App Review 未過)'
                  : '尚未確認搜尋權限'}
            </Badge>
            <Badge tone={data.autoReply ? 'primary' : 'default'}>
              {data.autoReply ? '自動回覆已開啟' : '自動回覆關閉(僅人工核准)'}
            </Badge>
            <Badge tone={data.autoReplyReady ? 'primary' : 'default'}>
              {data.autoReplyReady ? '技術上可自動發' : '尚未就緒'}
            </Badge>
          </div>
        </Card>
      )}

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
            本小時 {data.replied1h}/{data.replyHourlyCap} · 近 24 小時 {data.replied24h}/{data.replyDailyCap}
          </span>
        )}
        <Button variant="secondary" disabled={scanning} onClick={() => void scanNow()}>
          {scanning ? '掃文中...' : data?.autoReply ? '立即掃文並自動發' : '立即掃文入庫'}
        </Button>
      </div>

      {data && (data.replied1h >= data.replyHourlyCap || data.replied24h >= data.replyDailyCap) && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid var(--color-danger, #b42318)' }}>
          <p style={{ fontSize: 13 }}>
            {data.replied1h >= data.replyHourlyCap
              ? `本小時已達上限 ${data.replyHourlyCap} 則,請等下一個時段再核准或等待自動回覆。`
              : `近 24 小時已達每日上限 ${data.replyDailyCap} 則。`}
          </p>
        </Card>
      )}

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
                  ? (data.canSearchPublic === false
                    ? '目前沒有待審核的回覆。關鍵字搜尋還只能看到自己的文,系統會略過自家帳號,佇列就會是空的。請到 Meta 送審 threads_keyword_search,過審後再按「立即掃文入庫」。'
                    : data.hasThreadsAccount
                      ? '目前沒有待審核的回覆。按「立即掃文入庫」立刻跑一輪搜尋與 AI 生成,不必等半點排程。'
                      : '目前沒有待審核的回覆。請先到社群帳號連接 Threads,再回來掃文。')
                  : '這個分類目前沒有項目'}
              </p>
              {data.lastScan?.detail && (
                <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-text)' }}>
                  最近一次掃描({new Date(data.lastScan.at).toLocaleString('zh-TW')}):{data.lastScan.detail}
                </p>
              )}
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

                {(t.status === 'pending' || t.status === 'failed') && t.replyText != null && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isEditing ? (
                      <>
                        <Button variant="primary" disabled={busy || capReached} onClick={() => void act(t, 'approve', editText)}>
                          {busy ? '發布中...' : '發布修改後的回覆'}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>取消編輯</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="primary" disabled={busy || capReached} onClick={() => void act(t, 'approve')}>
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
        <strong style={{ fontSize: 13 }}>Washgo 自動回覆怎麼開</strong>
        <ul style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.9, paddingLeft: 18, marginTop: 6 }}>
          <li>先確認 Threads 已連線,再按「立即掃文入庫」。這一輪會真的搜尋、AI 寫稿、入待審;自動回覆開著才會直接發。</li>
          <li>若掃描結果是「只能搜到自己的文」,代表 <code>threads_keyword_search</code> 還沒過 App Review,開開關也不會有佇列。</li>
          <li>權限通了之後再開自動回覆。小時上限預設 5、每日上限預設 12,可在「<Link to={`/${slug}/social`}>社群帳號</Link>」調整。</li>
          <li>回覆走品牌第一線人設、不放連結、不促銷;發布失敗會暫停該品牌 12 小時。</li>
          <li>排程每 30 分鐘掃一輪(台灣凌晨 2–6 點靜默);不想等就按這一頁的立即掃文。</li>
        </ul>
      </Card>
    </div>
  );
}
