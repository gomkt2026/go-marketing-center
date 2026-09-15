import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { ContentStatus, PublishingJobStatus, ThreadsDeskSlot, ThreadsReplyTarget } from '@/types';

const contentStatusLabel: Partial<Record<ContentStatus, string>> = {
  draft: '草稿', pending_review: '待批准', approved: '已批准', needs_revision: '修改中',
  rejected: '已跳過', scheduled: '已排程', published: '已發布', archived: '已封存',
};
const contentStatusTone: Partial<Record<ContentStatus, BadgeTone>> = {
  draft: 'default', pending_review: 'accent', approved: 'primary', needs_revision: 'secondary',
  rejected: 'default', scheduled: 'accent', published: 'primary', archived: 'default',
};
const jobStatusLabel: Record<PublishingJobStatus, string> = {
  queued: '排隊中', scheduled: '已排程', publishing: '發布中', published: '已發布', failed: '失敗', cancelled: '已取消',
};
const jobStatusTone: Record<PublishingJobStatus, BadgeTone> = {
  queued: 'default', scheduled: 'accent', publishing: 'accent', published: 'primary', failed: 'danger', cancelled: 'default',
};

function padHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFailureReason(raw: string): string {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return raw;
  const prefix = raw.slice(0, jsonStart).trim();
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { error_user_msg?: string; message?: string };
    };
    const friendly = parsed.error?.error_user_msg ?? parsed.error?.message;
    if (friendly) return prefix ? `${prefix} ${friendly}` : friendly;
  } catch { /* 不是 JSON,原樣顯示 */ }
  return raw;
}

const textareaStyle: CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
};

export function ThreadsDesk() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { body: string; replyBody: string }>>({});
  const [replyEdits, setReplyEdits] = useState<Record<string, string>>({});
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => (slug ? api.threadsDesk(slug) : Promise.reject(new Error('no slug'))),
    [slug],
  );

  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const slot of data.slots) {
        if (slot.contentId && !next[slot.contentId]) {
          next[slot.contentId] = { body: slot.body ?? '', replyBody: slot.replyBody ?? '' };
        }
      }
      return next;
    });
  }, [data]);

  const pendingReplies = data?.replies ?? [];
  const todayLabel = useMemo(() => {
    const d = data?.date ? new Date(data.date) : new Date();
    return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }, [data?.date]);

  if (!slug || !brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusyKey(key);
    setMessage(null);
    try {
      const note = await fn();
      if (note) setMessage(note);
      reload();
    } catch (e) {
      setMessage(e instanceof ApiError || e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`${brand.name} Threads 工作台`}
        subtitle={`${todayLabel} · AI 提前寫好,小編在這一頁改字、批准、跳過或現在發。批准後依原時段發出。`}
        actions={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/settings/meta-threads" style={{ fontSize: 13 }}>
              申請手冊
            </Link>
            <Link to={`/${slug}/thread-replies`} style={{ fontSize: 13 }}>
              回覆歷史
            </Link>
          </div>
        }
      />

      <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: 14 }}>帳號狀態</strong>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              {data.hasThreadsAccount
                ? `已連 ${data.threadsUsername ? `@${data.threadsUsername}` : 'Threads'}`
                : '尚未連接 Threads'}
              {' · '}待批准 {data.pendingCount} · 已排程 {data.scheduledCount}
              {' · '}回覆 {data.replied1h}/{data.replyHourlyCap}（本小時） {data.replied24h}/{data.replyDailyCap}（近 24 時）
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
              每天 00/06/12/18 熱議跟風、09 生活哏文、21 愛情散文。勾選「到期安全網」後,沒人批准到點仍會發。
            </p>
            {data.blockReason && (
              <p style={{ fontSize: 12.5, color: '#B85454', marginTop: 6 }}>{data.blockReason}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant={data.autoPublish ? 'primary' : 'ghost'}
              disabled={busyKey === 'auto-publish' || !data.hasThreadsAccount}
              onClick={() => void run('auto-publish', async () => {
                const res = await api.actThreadsDesk(slug, { action: 'set_auto_publish', autoPublish: !data.autoPublish });
                return res.detail ?? (data.autoPublish ? '已關閉到期安全網' : '已開啟到期安全網');
              })}
            >
              {data.autoPublish ? '到期安全網：開' : '到期安全網：關'}
            </Button>
            <Button
              variant={data.autoReply ? 'primary' : 'ghost'}
              disabled={busyKey === 'auto-reply' || !data.hasThreadsAccount}
              onClick={() => void run('auto-reply', async () => {
                const res = await api.actThreadsDesk(slug, { action: 'set_auto_reply', autoReply: !data.autoReply });
                return res.detail ?? (data.autoReply ? '已關閉自動回覆' : '已開啟自動回覆');
              })}
            >
              {data.autoReply ? '自動回覆：開' : '自動回覆：關'}
            </Button>
            {!data.hasThreadsAccount && (
              <Link to={`/${slug}/social`}><Button variant="secondary">去連接 Threads</Button></Link>
            )}
          </div>
        </div>
      </Card>

      {message && (
        <Card style={{ marginBottom: 14, background: 'var(--color-bg-soft)' }}>
          <p style={{ fontSize: 13 }}>{message}</p>
        </Card>
      )}

      <h2 style={{ fontSize: 16, margin: '6px 0 10px' }}>今日自家發文</h2>
      <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
        {data.slots.map((slot) => (
          <SlotCard
            key={slot.hour}
            slot={slot}
            slug={slug}
            busyKey={busyKey}
            editing={editingId === slot.contentId}
            draft={slot.contentId ? drafts[slot.contentId] : undefined}
            onEdit={() => slot.contentId && setEditingId(slot.contentId)}
            onCancelEdit={() => setEditingId(null)}
            onDraftChange={(next) => {
              if (!slot.contentId) return;
              setDrafts((prev) => ({ ...prev, [slot.contentId!]: next }));
            }}
            onAction={(key, fn) => void run(key, fn)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>回覆別人</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="secondary"
            disabled={busyKey === 'scan' || !data.hasThreadsAccount}
            onClick={() => void run('scan', async () => {
              const res = await api.actThreadsDesk(slug, { action: 'scan' });
              const bits = [res.detail];
              if (res.queued) bits.push(`入庫 ${res.queued} 則`);
              if (res.published) bits.push(`已自動發布 ${res.published} 則`);
              return bits.filter(Boolean).join(' · ') || '掃描完成';
            })}
          >
            {busyKey === 'scan' ? '掃文中…' : '立即掃文'}
          </Button>
          <Link to={`/${slug}/thread-replies`} style={{ fontSize: 13 }}>看歷史佇列</Link>
        </div>
      </div>

      {pendingReplies.length === 0 && (
        <Card>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            目前沒有待回覆。按「立即掃文」抓熱門公開文;若關鍵字搜尋還沒過審,這裡會一直是空的。
          </p>
        </Card>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {pendingReplies.map((reply) => (
          <ReplyCard
            key={reply.id}
            reply={reply}
            slug={slug}
            busy={busyKey === `reply-${reply.id}`}
            editing={editingReplyId === reply.id}
            draft={replyEdits[reply.id] ?? reply.replyText ?? ''}
            onToggleEdit={() => {
              setEditingReplyId((cur) => cur === reply.id ? null : reply.id);
              setReplyEdits((prev) => ({ ...prev, [reply.id]: prev[reply.id] ?? reply.replyText ?? '' }));
            }}
            onDraftChange={(text) => setReplyEdits((prev) => ({ ...prev, [reply.id]: text }))}
            onAction={(key, fn) => void run(key, fn)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  slot, slug, busyKey, editing, draft, onEdit, onCancelEdit, onDraftChange, onAction,
}: {
  slot: ThreadsDeskSlot;
  slug: string;
  busyKey: string | null;
  editing: boolean;
  draft?: { body: string; replyBody: string };
  onEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (next: { body: string; replyBody: string }) => void;
  onAction: (key: string, fn: () => Promise<string | void>) => void;
}) {
  const key = slot.contentId ?? `empty-${slot.hour}`;
  const busy = busyKey === key || busyKey === `gen-${slot.hour}`;
  const empty = !slot.contentId;
  const published = slot.jobStatus === 'published' || slot.status === 'published';
  const failed = slot.jobStatus === 'failed';
  const scheduled = slot.jobStatus === 'scheduled' || slot.jobStatus === 'publishing';
  const pending = !empty && !slot.skipped && !published && !scheduled && !failed;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: 15 }}>{padHour(slot.hour)}</strong>
          <Badge tone="secondary">{slot.label}</Badge>
          {slot.categoryLabel && <Badge>{slot.categoryLabel}</Badge>}
          {slot.skipped && <Badge>已跳過</Badge>}
          {!slot.skipped && slot.status && (
            <Badge tone={contentStatusTone[slot.status] ?? 'default'}>
              {contentStatusLabel[slot.status] ?? slot.status}
            </Badge>
          )}
          {slot.jobStatus && !slot.skipped && (
            <Badge tone={jobStatusTone[slot.jobStatus]}>{jobStatusLabel[slot.jobStatus]}</Badge>
          )}
          {slot.predictedEngagementScore != null && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>互動 {Math.round(slot.predictedEngagementScore)}</span>
          )}
        </div>
        {slot.scheduledAt && scheduled && (
          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            預計 {formatWhen(slot.scheduledAt)}
          </span>
        )}
      </div>

      {empty && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>尚未生成這一檔</p>
      )}

      {slot.imageUrl && (
        <img
          src={slot.imageUrl}
          alt=""
          style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
        />
      )}

      {!empty && editing && draft && (
        <>
          <textarea
            rows={6}
            value={draft.body}
            onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
            style={{ ...textareaStyle, marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            串文 2/2（發在主帖下面,可留空）
          </label>
          <textarea
            rows={2}
            value={draft.replyBody}
            onChange={(e) => onDraftChange({ ...draft, replyBody: e.target.value })}
            style={{ ...textareaStyle, marginBottom: 10 }}
          />
        </>
      )}

      {!empty && !editing && slot.body && (
        <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: slot.replyBody ? 8 : 10 }}>
          {slot.body}
        </p>
      )}
      {!empty && !editing && slot.replyBody && (
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
          2/2 {slot.replyBody}
        </p>
      )}

      {failed && slot.lastLogDetail && (
        <p style={{ fontSize: 12.5, color: '#B85454', marginBottom: 8 }}>
          {formatFailureReason(slot.lastLogDetail)}
        </p>
      )}
      {published && slot.lastLogDetail?.startsWith('http') && (
        <p style={{ fontSize: 12.5, marginBottom: 8 }}>
          <a href={slot.lastLogDetail} target="_blank" rel="noreferrer">查看貼文 ↗</a>
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {empty && (
          <Button
            disabled={busy}
            onClick={() => onAction(`gen-${slot.hour}`, async () => {
              await api.actThreadsDesk(slug, { action: 'generate_slot', hour: slot.hour });
              return `${padHour(slot.hour)} 已產稿,請看內容後批准`;
            })}
          >
            {busy ? '產稿中…' : '現在產這一檔'}
          </Button>
        )}

        {pending && !editing && (
          <>
            <Button variant="ghost" disabled={busy} onClick={onEdit}>改字</Button>
            <Button
              disabled={busy}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, { action: 'approve', contentId: slot.contentId! });
                return '已批准,會依原時段發出(已過點則下一輪就發)';
              })}
            >
              批准排程
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, { action: 'publish_now', contentId: slot.contentId! });
                return '已排入立即發布,約 30 分鐘內會發出';
              })}
            >
              現在發
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, { action: 'skip', contentId: slot.contentId! });
                return `${padHour(slot.hour)} 已跳過,系統不會再補這檔`;
              })}
            >
              跳過
            </Button>
          </>
        )}

        {pending && editing && draft && (
          <>
            <Button
              disabled={busy}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, {
                  action: 'save',
                  contentId: slot.contentId!,
                  body: draft.body,
                  replyBody: draft.replyBody,
                });
                onCancelEdit();
                return '已存稿';
              })}
            >
              存檔
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancelEdit}>取消改字</Button>
          </>
        )}

        {scheduled && !editing && (
          <>
            <Button variant="ghost" disabled={busy || slot.jobStatus === 'publishing'} onClick={onEdit}>改字</Button>
            <Button
              variant="secondary"
              disabled={busy || slot.jobStatus === 'publishing'}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, { action: 'publish_now', contentId: slot.contentId! });
                return '已改為立即發布';
              })}
            >
              改現在發
            </Button>
            <Button
              variant="danger"
              disabled={busy || slot.jobStatus === 'publishing'}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, { action: 'cancel', contentId: slot.contentId! });
                return '已取消排程,文還在待批准';
              })}
            >
              取消排程
            </Button>
          </>
        )}

        {scheduled && editing && draft && (
          <>
            <Button
              disabled={busy}
              onClick={() => onAction(key, async () => {
                await api.actThreadsDesk(slug, {
                  action: 'save',
                  contentId: slot.contentId!,
                  body: draft.body,
                  replyBody: draft.replyBody,
                });
                onCancelEdit();
                return '已改稿,到點會發新版本';
              })}
            >
              存檔
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancelEdit}>取消改字</Button>
          </>
        )}

        {failed && slot.jobId && (
          <Button
            disabled={busy}
            onClick={() => onAction(key, async () => {
              await api.actThreadsDesk(slug, { action: 'retry', contentId: slot.contentId!, jobId: slot.jobId! });
              return '已重新排入發布';
            })}
          >
            重試
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReplyCard({
  reply, slug, busy, editing, draft, onToggleEdit, onDraftChange, onAction,
}: {
  reply: ThreadsReplyTarget;
  slug: string;
  busy: boolean;
  editing: boolean;
  draft: string;
  onToggleEdit: () => void;
  onDraftChange: (text: string) => void;
  onAction: (key: string, fn: () => Promise<string | void>) => void;
}) {
  const key = `reply-${reply.id}`;
  return (
    <Card>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <Badge tone="accent">待回覆</Badge>
        {reply.targetUsername && <Badge>@{reply.targetUsername}</Badge>}
        {reply.sourceKeyword && <Badge tone="secondary">{reply.sourceKeyword}</Badge>}
      </div>
      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: 8 }}>
        {reply.targetText || '（無原文）'}
      </p>
      {reply.targetPermalink && (
        <p style={{ fontSize: 12, marginBottom: 8 }}>
          <a href={reply.targetPermalink} target="_blank" rel="noreferrer">原文 ↗</a>
        </p>
      )}
      {editing ? (
        <textarea rows={3} value={draft} onChange={(e) => onDraftChange(e.target.value)} style={{ ...textareaStyle, marginBottom: 10 }} />
      ) : (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
          回覆草稿：{reply.replyText || '（尚無草稿,按「改」自己寫）'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          disabled={busy}
          onClick={() => onAction(key, async () => {
            const res = await api.actThreadsDesk(slug, {
              action: 'reply_approve',
              replyId: reply.id,
              replyText: draft || reply.replyText || undefined,
            });
            return res.permalink ? `已回覆:${res.permalink}` : '已發布回覆';
          })}
        >
          發
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onToggleEdit}>{editing ? '收起' : '改'}</Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => onAction(key, async () => {
            await api.actThreadsDesk(slug, { action: 'reply_skip', replyId: reply.id });
            return '已略過這則';
          })}
        >
          不發
        </Button>
      </div>
    </Card>
  );
}
