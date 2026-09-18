import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/context/BrandContext';
import { api, ApiError } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type {
  BrandEditorPersona, EditorChatMessage, EditorDeskContext, EditorDraftCard, EditorToolResult,
} from '@/types';

type Pin = { type: string; id: string; label: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value?: string): string | undefined {
  return value && UUID_RE.test(value.trim()) ? value.trim() : undefined;
}

function formatWhen(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function applyToolResult(
  result: EditorToolResult,
  setContext: (ctx: EditorDeskContext) => void,
  setDrafts: (fn: (prev: EditorDraftCard[]) => EditorDraftCard[]) => void,
) {
  if (result.context) setContext(result.context);
  const cards = result.drafts ?? (result.draft ? [result.draft] : []);
  if (cards.length) setDrafts((prev) => [...cards, ...prev.filter((d) => !cards.some((c) => c.contentId === d.contentId))]);
}

function EditorAvatar({ editor, size = 56 }: { editor: BrandEditorPersona; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (editor.avatarUrl && !broken) {
    return (
      <img
        src={editor.avatarUrl}
        alt={editor.nickname}
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${editor.color}` }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: editor.color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.36,
    }}
    >
      {editor.nickname.slice(0, 1)}
    </div>
  );
}

function DeskInner({
  slug, brandName, editor, firstMessage, voiceEnabled, digest,
}: {
  slug: string;
  brandName: string;
  editor: BrandEditorPersona;
  firstMessage: string;
  voiceEnabled: boolean;
  digest: string;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EditorChatMessage[]>([]);
  const [context, setContext] = useState<EditorDeskContext | null>(null);
  const [drafts, setDrafts] = useState<EditorDraftCard[]>([]);
  const [pin, setPin] = useState<Pin | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [tab, setTab] = useState<'press' | 'assets' | 'schedule'>('press');
  const threadRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const pinRef = useRef<Pin | null>(null);
  const draftsRef = useRef<EditorDraftCard[]>([]);
  sessionRef.current = sessionId;
  pinRef.current = pin;
  draftsRef.current = drafts;

  const conversation = useConversation({
    onMessage: (msg) => {
      const source = String((msg as { source?: string; role?: string }).source ?? (msg as { role?: string }).role ?? '');
      const role = source === 'user' ? 'user' : 'assistant';
      const text = String((msg as { message?: string }).message ?? '').trim();
      if (!text) return;
      const sid = sessionRef.current;
      if (!sid) return;
      setMessages((prev) => {
        if (prev.some((m) => m.role === role && m.content === text)) return prev;
        return [...prev, {
          id: `live-${role}-${Date.now()}`,
          role,
          content: text,
          toolName: null,
          createdAt: new Date().toISOString(),
        }];
      });
      void api.editorMessage(slug, { sessionId: sid, role, content: text }).catch(() => undefined);
    },
    onError: (err) => {
      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
      setVoiceError(message || '語音連線失敗,改用文字也可以');
    },
    clientTools: {
      list_context: async () => {
        const sid = sessionRef.current;
        const result = await api.editorTool(slug, { name: 'list_context', sessionId: sid });
        applyToolResult(result, setContext, setDrafts);
        return result.summary;
      },
      list_schedule: async () => {
        const sid = sessionRef.current;
        const result = await api.editorTool(slug, { name: 'list_schedule', sessionId: sid });
        applyToolResult(result, setContext, setDrafts);
        setTab('schedule');
        return result.summary;
      },
      draft_post: async (parameters: { platform?: string; topic?: string; coverageId?: string; instruction?: string }) => {
        const sid = sessionRef.current;
        const result = await api.editorTool(slug, {
          name: 'draft_post',
          sessionId: sid,
          ...parameters,
          coverageId: asUuid(parameters.coverageId),
        });
        applyToolResult(result, setContext, setDrafts);
        return result.summary;
      },
      schedule_post: async (parameters: {
        platform?: string; topic?: string; coverageId?: string; contentId?: string;
        contentVersionId?: string; scheduledAt?: string; mode?: string;
      }) => {
        const sid = sessionRef.current;
        const last = draftsRef.current[0];
        const result = await api.editorTool(slug, {
          name: 'schedule_post',
          sessionId: sid,
          ...parameters,
          coverageId: asUuid(parameters.coverageId),
          contentId: asUuid(parameters.contentId) ?? last?.contentId,
          contentVersionId: asUuid(parameters.contentVersionId) ?? last?.contentVersionId,
          platform: parameters.platform || last?.platform,
        });
        applyToolResult(result, setContext, setDrafts);
        setTab('schedule');
        return result.summary;
      },
      pin_context: async (parameters: { type?: string; id?: string; label?: string }) => {
        if (parameters.id && parameters.label) {
          setPin({ type: parameters.type ?? 'item', id: parameters.id, label: parameters.label });
        }
        return '已釘選';
      },
    },
  });
  const { status, isSpeaking, isListening, startSession, endSession, sendUserMessage, sendContextualUpdate, getId } = conversation;
  const voiceOn = status === 'connected';

  useEffect(() => {
    if (status !== 'connected') return;
    const sid = sessionRef.current;
    const convId = getId?.();
    if (sid && convId) {
      void api.editorPatchSession(slug, { sessionId: sid, elevenlabsConversationId: convId }).catch(() => undefined);
    }
  }, [status, getId, slug]);

  const deskQuery = useAsyncData(() => api.editorDesk(slug), [slug]);
  useEffect(() => {
    if (deskQuery.data?.context) setContext(deskQuery.data.context);
  }, [deskQuery.data]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, drafts]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    const created = await api.editorStartSession(slug);
    setSessionId(created.sessionId);
    sessionRef.current = created.sessionId;
    setMessages((prev) => prev.length ? prev : [{
      id: 'hello',
      role: 'assistant',
      content: created.firstMessage,
      toolName: null,
      createdAt: new Date().toISOString(),
    }]);
    return created.sessionId;
  }, [slug]);

  useEffect(() => {
    void ensureSession().catch((e) => setError(e instanceof Error ? e.message : '無法建立對話'));
  }, [ensureSession]);

  async function refreshContext() {
    try {
      const result = await api.editorTool(slug, { name: 'list_context', sessionId: sessionRef.current });
      applyToolResult(result, setContext, setDrafts);
    } catch { /* ignore */ }
  }

  async function startVoice() {
    setVoiceError(null);
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const created = await api.editorStartSession(slug);
      setSessionId(created.sessionId);
      sessionRef.current = created.sessionId;
      if (!created.conversationToken && !created.signedUrl) {
        setVoiceError('尚未設定阿樂語音 Agent。請執行 scripts/setup-washgo-ale-agent.mjs，或先用文字對話。');
        return;
      }
      startSession({
        ...(created.conversationToken
          ? { conversationToken: created.conversationToken }
          : { signedUrl: created.signedUrl ?? undefined }),
        userId: created.sessionId,
        dynamicVariables: created.dynamicVariables,
      });
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : '麥克風或語音連線失敗,改打字也可以');
    }
  }

  async function stopVoice() {
    try { await endSession(); } catch { /* ignore */ }
  }

  async function sendText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const sid = await ensureSession();
      if (voiceOn) {
        if (pinRef.current) sendContextualUpdate(`對方點選:${pinRef.current.label}`);
        sendUserMessage(text);
        setMessages((prev) => [...prev, {
          id: `typed-${Date.now()}`, role: 'user', content: text, toolName: null, createdAt: new Date().toISOString(),
        }]);
        return;
      }
      setMessages((prev) => [...prev, {
        id: `local-${Date.now()}`, role: 'user', content: text, toolName: null, createdAt: new Date().toISOString(),
      }]);
      const result = await api.editorChat(slug, { sessionId: sid, message: text, pinned: pinRef.current });
      setMessages(result.messages);
      if (result.toolResult) applyToolResult(result.toolResult, setContext, setDrafts);
      if (result.toolResult?.tool === 'list_context' || result.toolResult?.tool === 'list_schedule') {
        await refreshContext();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '送出失敗');
    } finally {
      setBusy(false);
    }
  }

  function pinItem(next: Pin) {
    setPin(next);
    if (voiceOn) sendContextualUpdate(`對方點選:${next.label}。下一句請針對這則回答。`);
  }

  const voiceLabel = voiceOn
    ? (isSpeaking ? `${editor.nickname}正在說…` : isListening ? '正在聽你說' : '語音連線中')
    : status === 'connecting' ? '連線中…' : '語音未開';

  return (
    <div className="editor-desk" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 16, alignItems: 'start' }}>
      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 560 }}>
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
        >
          <EditorAvatar editor={editor} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>{editor.nickname} · {brandName} 小編</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {editor.characterTitle || '品牌小編'}{editor.catchphrase ? ` · ${editor.catchphrase}` : ''}
            </div>
          </div>
          <Badge tone={voiceOn ? 'primary' : 'default'}>{voiceLabel}</Badge>
          {voiceOn ? (
            <Button variant="ghost" onClick={() => void stopVoice()}>結束語音</Button>
          ) : (
            <Button variant="accent" onClick={() => void startVoice()}>
              開始語音
            </Button>
          )}
        </div>

        <div ref={threadRef} style={{ height: 420, overflowY: 'auto', padding: 16, display: 'grid', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{firstMessage}</div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                justifySelf: m.role === 'user' ? 'end' : 'start',
                maxWidth: '86%',
                background: m.role === 'user' ? 'var(--color-primary-soft)' : 'var(--color-bg-soft, #F7F4EF)',
                border: '1px solid var(--color-border)',
                borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '10px 12px',
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                {m.role === 'user' ? '公司行銷' : m.role === 'tool' ? '系統' : editor.nickname}
              </div>
              {m.content}
            </div>
          ))}
          {drafts.map((d) => (
            <Card key={d.contentId} style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Badge tone="accent">{d.platform}</Badge>
                <Badge>{d.status === 'scheduled' ? `排程 ${formatWhen(d.scheduledAt)}` : '待審'}</Badge>
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{d.title || '草稿'}</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>{d.body}</div>
              {d.hashtags?.length ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{d.hashtags.join(' ')}</div>
              ) : null}
            </Card>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
          {pin && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              已釘選：{pin.label}
              <button type="button" onClick={() => setPin(null)} style={{ marginLeft: 8, border: 0, background: 'none', cursor: 'pointer', color: 'var(--color-accent)' }}>取消</button>
            </div>
          )}
          {voiceError && <div style={{ fontSize: 12, color: '#B85454', marginBottom: 8 }}>{voiceError}</div>}
          {error && <div style={{ fontSize: 12, color: '#B85454', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              placeholder={voiceOn ? `跟${editor.nickname}說，或打字…` : `跟${editor.nickname}打字，例如：昨天媒體能不能拿來發文？`}
              rows={2}
              style={{
                flex: 1, resize: 'none', borderRadius: 10, border: '1px solid var(--color-border)',
                padding: '8px 10px', fontSize: 14, fontFamily: 'inherit',
              }}
            />
            <Button variant="primary" disabled={busy || !input.trim()} onClick={() => void sendText()}>
              {busy ? '…' : '送出'}
            </Button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            Enter 送出 · Shift+Enter 換行 · 語音與文字可並用
            {!voiceEnabled ? ' · 尚未設定 Conversational Agent，先走文字；語音請跑 scripts/setup-washgo-ale-agent.mjs' : ''}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['press', '新聞露出'],
            ['assets', '素材'],
            ['schedule', '行程'],
          ] as const).map(([id, label]) => (
            <Button key={id} variant={tab === id ? 'primary' : 'ghost'} onClick={() => setTab(id)}>{label}</Button>
          ))}
          <Button variant="ghost" onClick={() => void refreshContext()}>刷新</Button>
        </div>

        {tab === 'press' && (
          <Card style={{ padding: 14, maxHeight: 620, overflow: 'auto' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>媒體與新聞稿</div>
            {(context?.pressCoverages ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pinItem({ type: 'coverage', id: c.id, label: `${c.outlet}「${c.headline}」` })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: pin?.id === c.id ? 'var(--color-primary-soft)' : 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.publishedOn ?? ''} · {c.outlet} · {c.status}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.headline}</div>
                {c.summary && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{c.summary}</div>}
              </button>
            ))}
            {(context?.pressReleases ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pinItem({ type: 'release', id: r.id, label: `新聞稿「${r.title}」` })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: pin?.id === r.id ? 'var(--color-primary-soft)' : 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 10, padding: 10, marginBottom: 8, cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>新聞稿 · {r.status}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
              </button>
            ))}
            {!context?.pressCoverages.length && !context?.pressReleases.length && (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>還沒有露出。去品牌智慧補一則就能跟{editor.nickname}聊。</div>
            )}
          </Card>
        )}

        {tab === 'assets' && (
          <Card style={{ padding: 14, maxHeight: 620, overflow: 'auto' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>文件與圖片</div>
            {(context?.documents ?? []).map((d) => (
              <div key={d.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                {d.title} <span style={{ color: 'var(--color-text-muted)' }}>({d.sourceType})</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              {(context?.assets ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pinItem({ type: 'asset', id: a.id, label: a.caption || '一張素材' })}
                  style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', padding: 0, background: '#fff', cursor: 'pointer' }}
                >
                  {a.fileUrl ? <img src={a.fileUrl} alt="" style={{ width: '100%', height: 90, objectFit: 'cover' }} /> : null}
                  <div style={{ fontSize: 11, padding: 6 }}>{a.caption || '素材'}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {tab === 'schedule' && (
          <Card style={{ padding: 14, maxHeight: 620, overflow: 'auto' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>行程與待審</div>
            {(context?.schedule ?? []).map((s) => (
              <div key={s.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 700 }}>{s.title || '未命名'} · {s.platform}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{s.status} · {formatWhen(s.scheduledAt)}</div>
              </div>
            ))}
            <div style={{ fontWeight: 700, margin: '12px 0 6px' }}>待審稿</div>
            {(context?.queue ?? []).map((q) => (
              <div key={q.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                {q.title} · {q.targetPlatform} · {q.status}
              </div>
            ))}
          </Card>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{digest}</div>
      </div>
    </div>
  );
}

export function BrandEditorDesk() {
  const { brand: slug } = useParams();
  const { brandBySlug, brandsLoading } = useBrand();
  const brand = slug ? brandBySlug(slug) : undefined;
  const deskQuery = useAsyncData(() => slug ? api.editorDesk(slug) : Promise.reject(new Error('no slug')), [slug]);

  if (!brand) return brandsLoading ? <LoadingState /> : <Navigate to="/" replace />;
  if (deskQuery.loading) return <LoadingState />;
  if (deskQuery.error || !deskQuery.data) {
    return <ErrorState message={deskQuery.error ?? '載入失敗'} onRetry={deskQuery.reload} />;
  }

  const { editor, firstMessage, voiceEnabled, digest } = deskQuery.data;

  return (
    <div>
      <PageHeader
        title={`跟${editor.nickname}聊`}
        subtitle={`${brand.name} 小編工作台：語音或打字，右側是新聞、素材與行程。`}
      />
      <ConversationProvider>
        <DeskInner
          slug={brand.slug}
          brandName={brand.name}
          editor={editor}
          firstMessage={firstMessage}
          voiceEnabled={voiceEnabled}
          digest={digest}
        />
      </ConversationProvider>
    </div>
  );
}
