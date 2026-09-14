import { useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { ThreadsKeywordHit, ThreadsReplyDraft, ThreadsReplyStatus, ThreadsReplyTarget } from '@/types';

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
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<Record<string, { logic: string; drafts: ThreadsReplyDraft[] }>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);

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
      if (res.searchHits?.length) bits.push(`畫面顯示 ${res.searchHits.length} 則搜尋結果`);
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

  async function generateReply(params: {
    key: string;
    text: string;
    username?: string | null;
    keyword?: string;
    applyToEdit?: boolean;
  }) {
    if (!slug) return;
    setGeneratingId(params.key);
    setMessage(null);
    try {
      const res = await api.actThreadReply(slug, {
        action: 'generate-reply',
        text: params.text,
        username: params.username,
        keyword: params.keyword,
      });
      const drafts = res.drafts ?? [];
      if (!drafts.length) throw new Error('沒有可用的草稿');
      setGenerated((prev) => ({ ...prev, [params.key]: { logic: res.logic ?? '', drafts } }));
      const kuso = drafts.find((d) => d.label.includes('KUSO')) ?? drafts[drafts.length - 1];
      setDraftReplies((prev) => ({ ...prev, [params.key]: kuso.text }));
      if (params.applyToEdit) {
        setEditingId(params.key);
        setEditText(kuso.text);
      }
      setMessage(`已產 ${drafts.map((d) => d.label).join('／')}，預設帶入 ${kuso.label}，可改完再發`);
    } catch (e) {
      setMessage(`產回覆失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setGeneratingId(null);
    }
  }

  async function demoReply(hit: ThreadsKeywordHit) {
    if (!slug) return;
    const replyText = (draftReplies[hit.id] ?? hit.replyText ?? '').trim();
    if (!replyText) {
      setMessage('請先按「AI 產回覆」，或自己寫一則再發');
      return;
    }
    setBusyId(hit.id);
    setMessage(null);
    try {
      const res = await api.actThreadReply(slug, {
        action: 'demo-reply',
        postId: hit.id,
        permalink: hit.permalink,
        username: hit.username,
        text: hit.text,
        keyword: hit.sourceKeyword,
        replyText,
      });
      setMessage(res.permalink
        ? `已在本頁記下回覆，Threads 連結：${res.permalink}`
        : '已發出示範回覆，回覆內容顯示在這則卡片裡');
      reload();
    } catch (e) {
      setMessage(`示範回覆失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setBusyId(null);
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
        title={`${brand.name} Threads 回覆歷史`}
        subtitle="進階佇列:看已回覆 / 已略過 / 失敗。日常審稿請回 Threads 工作台。"
        actions={
          <Link to={`/${slug}/threads`}>
            <Button variant="secondary">回工作台</Button>
          </Link>
        }
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

      {data?.replyGuide && (
        <Card style={{ marginBottom: 14, background: 'var(--color-bg-soft)' }}>
          <strong style={{ fontSize: 14 }}>回覆時的品牌邏輯</strong>
          <p style={{ fontSize: 13, marginTop: 6 }}>{data.replyGuide.persona}</p>
          <ul style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.8, paddingLeft: 18, marginTop: 6 }}>
            {data.replyGuide.logic.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {data.replyGuide.kusoExamples.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>KUSO 語氣參考（學感覺，不要整句貼）</div>
              {data.replyGuide.kusoExamples.map((ex) => (
                <p key={ex} style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '0 0 4px' }}>「{ex}」</p>
              ))}
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
            不要：{data.replyGuide.donts.join('、')}
          </p>
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

      {!loading && data && (data.searchHits?.length || data.lastScan?.hits?.length) ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>本輪關鍵字搜尋結果</strong>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              {(data.scanKeywords?.length ? data.scanKeywords : data.lastScan?.keywords ?? []).join('、') || '關鍵字搜尋'}
              {' · '}
              顯示 {(data.searchHits?.length ? data.searchHits : data.lastScan?.hits ?? []).length} 則
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>
            先按「AI 產回覆」會依品牌邏輯生親切／KUSO 兩則，預設帶 KUSO。改完再發，內容會留在這張卡片。
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(data.searchHits ?? []).map((hit) => {
              const busy = busyId === hit.id;
              const alreadyReplied = hit.replyStatus === 'replied';
              const gen = generated[hit.id];
              const draft = draftReplies[hit.id] ?? hit.replyText ?? '';
              return (
                <Card key={hit.id}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge tone={hit.isOwn ? 'default' : 'primary'}>
                      {hit.isOwn ? '自家帳號（不入自動回覆佇列）' : '別人的公開文'}
                    </Badge>
                    {hit.sourceKeyword && <Badge tone="secondary">關鍵字:{hit.sourceKeyword}</Badge>}
                    {hit.replyStatus && (
                      <Badge tone={statusTone[(hit.replyStatus as ThreadsReplyStatus)] ?? 'default'}>
                        {statusLabel[hit.replyStatus as ThreadsReplyStatus] ?? hit.replyStatus}
                      </Badge>
                    )}
                    <span style={{ fontSize: 12.5, fontWeight: 700, marginLeft: 4 }}>
                      @{hit.username ?? '匿名'}
                    </span>
                  </div>

                  <div style={{
                    background: 'var(--color-bg-soft)', borderRadius: 10, padding: '10px 12px', marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                      原文
                      {hit.permalink && (
                        <a href={hit.permalink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontWeight: 500 }}>
                          查看原文 ↗
                        </a>
                      )}
                    </div>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                      {hit.text || '（無文字）'}
                    </p>
                  </div>

                  {gen?.logic && (
                    <p style={{
                      fontSize: 12.5, color: 'var(--color-text)', marginBottom: 10,
                      padding: '8px 10px', background: 'var(--color-bg-soft)', borderRadius: 8,
                    }}>
                      <strong>這則為什麼這樣回：</strong>{gen.logic}
                    </p>
                  )}

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                      {alreadyReplied ? '已發布的回覆' : '將發布的回覆'}
                      {hit.replyPermalink && (
                        <a href={hit.replyPermalink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontWeight: 500 }}>
                          查看回覆 ↗
                        </a>
                      )}
                    </div>
                    {alreadyReplied ? (
                      <p style={{
                        fontSize: 13.5, whiteSpace: 'pre-wrap', padding: '10px 12px',
                        border: '1px solid var(--color-border)', borderRadius: 10,
                      }}>
                        {hit.replyText || '（無回覆文字）'}
                      </p>
                    ) : (
                      <>
                        {gen?.drafts?.length ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                            {gen.drafts.map((d) => (
                              <Button
                                key={d.label}
                                variant={draft === d.text ? 'primary' : 'ghost'}
                                onClick={() => setDraftReplies((prev) => ({ ...prev, [hit.id]: d.text }))}
                              >
                                {d.label}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        {gen?.drafts?.find((d) => d.text === draft)?.why && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                            {gen.drafts.find((d) => d.text === draft)?.why}
                          </p>
                        )}
                        <textarea
                          value={draft}
                          onChange={(e) => setDraftReplies((prev) => ({ ...prev, [hit.id]: e.target.value }))}
                          placeholder="按「AI 產回覆」會依品牌邏輯生草稿；也可以自己寫。"
                          rows={4}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
                            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                            fontFamily: 'inherit', resize: 'vertical',
                          }}
                        />
                      </>
                    )}
                  </div>

                  <dl style={{
                    display: 'grid', gridTemplateColumns: '88px 1fr', gap: '4px 10px',
                    fontSize: 12.5, margin: '0 0 10px', color: 'var(--color-text)',
                  }}>
                    <dt style={{ color: 'var(--color-text-muted)' }}>回覆狀態</dt>
                    <dd style={{ margin: 0 }}>{hit.replyStatus ? (statusLabel[hit.replyStatus as ThreadsReplyStatus] ?? hit.replyStatus) : '尚未發布'}</dd>
                    <dt style={{ color: 'var(--color-text-muted)' }}>回覆連結</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-all' }}>
                      {hit.replyPermalink
                        ? <a href={hit.replyPermalink} target="_blank" rel="noreferrer">{hit.replyPermalink}</a>
                        : '發布後會顯示在這裡'}
                    </dd>
                    <dt style={{ color: 'var(--color-text-muted)' }}>回覆貼文 ID</dt>
                    <dd style={{ margin: 0 }}>{hit.replyPostId || '尚未發布'}</dd>
                    <dt style={{ color: 'var(--color-text-muted)' }}>發布時間</dt>
                    <dd style={{ margin: 0 }}>
                      {hit.repliedAt ? new Date(hit.repliedAt).toLocaleString('zh-TW') : '尚未發布'}
                    </dd>
                  </dl>

                  {hit.errorMessage && (
                    <p style={{ fontSize: 12, color: '#B85454', marginBottom: 8 }}>錯誤:{hit.errorMessage}</p>
                  )}

                  {!alreadyReplied && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        variant="secondary"
                        disabled={generatingId === hit.id || !hit.text}
                        onClick={() => void generateReply({
                          key: hit.id,
                          text: hit.text ?? '',
                          username: hit.username,
                          keyword: hit.sourceKeyword,
                        })}
                      >
                        {generatingId === hit.id ? 'AI 產稿中...' : gen ? '再產一輪' : 'AI 產回覆'}
                      </Button>
                      <Button variant="primary" disabled={busy || capReached || !draft.trim()} onClick={() => void demoReply(hit)}>
                        {busy ? '發布中...' : '發這則回覆'}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {loading && <LoadingState />}
      {!loading && (error || !data) && <ErrorState message={error ?? '載入失敗'} onRetry={reload} />}

      {!loading && data && (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.targets.length === 0 && (
            <Card>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {tab === 'pending'
                  ? (data.canSearchPublic === false
                    ? '待審核是空的，因為過審前只能搜到自己的文，系統不會拿自家帳號去自動回。請先看上方「本輪關鍵字搜尋結果」。'
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
                      {t.status === 'replied' ? '已發布的回覆' : '將發布的回覆'}
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

                <dl style={{
                  display: 'grid', gridTemplateColumns: '88px 1fr', gap: '4px 10px',
                  fontSize: 12.5, margin: '0 0 10px', color: 'var(--color-text)',
                }}>
                  <dt style={{ color: 'var(--color-text-muted)' }}>回覆狀態</dt>
                  <dd style={{ margin: 0 }}>{statusLabel[t.status]}</dd>
                  <dt style={{ color: 'var(--color-text-muted)' }}>回覆連結</dt>
                  <dd style={{ margin: 0, wordBreak: 'break-all' }}>
                    {t.replyPermalink
                      ? <a href={t.replyPermalink} target="_blank" rel="noreferrer">{t.replyPermalink}</a>
                      : '發布後會顯示在這裡'}
                  </dd>
                  <dt style={{ color: 'var(--color-text-muted)' }}>回覆貼文 ID</dt>
                  <dd style={{ margin: 0 }}>{t.replyPostId || '尚未發布'}</dd>
                  <dt style={{ color: 'var(--color-text-muted)' }}>發布時間</dt>
                  <dd style={{ margin: 0 }}>
                    {t.repliedAt ? new Date(t.repliedAt).toLocaleString('zh-TW') : '尚未發布'}
                  </dd>
                </dl>

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
                        <Button
                          variant="secondary"
                          disabled={generatingId === t.id || !t.targetText}
                          onClick={() => void generateReply({
                            key: t.id,
                            text: t.targetText ?? '',
                            username: t.targetUsername,
                            keyword: t.sourceKeyword,
                            applyToEdit: true,
                          })}
                        >
                          {generatingId === t.id ? 'AI 產稿中...' : 'AI 重產'}
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
          <li>若掃描結果是「只能搜到自己的文」,代表 <code>threads_keyword_search</code> 還沒過 App Review。上方仍會列出搜到的貼文；待審核不會有別人的文。</li>
          <li>回覆前看上方「品牌邏輯」。按「AI 產回覆」會生親切／KUSO 兩則，預設帶 KUSO，小編改完再發。</li>
          <li>回覆走品牌第一線人設、不放連結、不促銷;發布失敗會暫停該品牌 12 小時。</li>
          <li>排程每 30 分鐘掃一輪(台灣凌晨 2–6 點靜默);不想等就按這一頁的立即掃文。</li>
        </ul>
      </Card>
    </div>
  );
}
