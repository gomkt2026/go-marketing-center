import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useMeta } from '@/context/MetaContext';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import type { Meeting, MeetingMessage, AgentWithPersona, MeetingPostPlanItem } from '@/types';

const MEETING_SECONDS = 5 * 60;
/** 兩則發言之間的間隔(毫秒),加上生成時間約 12-18 秒一則 */
const GAP_MS_MIN = 7000;
const GAP_MS_MAX = 12000;

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😄', excited: '🤩', annoyed: '😒', angry: '😤',
  worried: '😟', laughing: '🤣', proud: '😎', neutral: '💬',
};

const FALLBACK_AVATAR: Record<string, string> = {
  '工班師傅': '👷', '包租管家': '🏠', '洗衣店店員': '🧺',
};

interface SuggestedRule {
  brandSlug: string;
  ruleType: string;
  statement: string;
  conditionNote?: string;
}

export function LiveMeetingRoom({ meeting, initialMessages, onReload }: {
  meeting: Meeting;
  initialMessages: MeetingMessage[];
  onReload: () => void;
}) {
  const { userName } = useMeta();
  const { brands } = useBrand();
  const agentsQuery = useAsyncData(() => api.agents(), []);

  const [messages, setMessages] = useState<MeetingMessage[]>(initialMessages);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(MEETING_SECONDS);
  const [typing, setTyping] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [conclusion, setConclusion] = useState<{ summary: string; rules: SuggestedRule[]; postPlan: MeetingPostPlanItem[] } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState<{ brandSlug: string; platform: string; title: string }[] | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [adoptedIdx, setAdoptedIdx] = useState<Set<number>>(new Set());

  const runningRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const concludedRef = useRef(meeting.status === 'concluded');

  const agentMap = new Map<string, AgentWithPersona>((agentsQuery.data?.agents ?? []).map((a) => [a.id, a]));
  const editors = (agentsQuery.data?.agents ?? []).filter((a) => a.roleCode === 'brand_ai' && a.brandId);
  const isConcluded = meeting.status === 'concluded' || conclusion !== null || concludedRef.current;
  const planFromMeta = meeting.metadata?.postPlan ?? [];
  const planExecutedInMeta = !!meeting.metadata?.planExecuted;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typing]);

  // 倒數計時
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const conclude = useCallback(async () => {
    if (concludedRef.current || concluding) return;
    concludedRef.current = true;
    runningRef.current = false;
    setRunning(false);
    setTyping(false);
    setConcluding(true);
    setActionMsg(null);
    try {
      const res = await api.concludeMeeting(meeting.id);
      setConclusion({ summary: res.summary, rules: res.suggestedRules, postPlan: res.postPlan ?? [] });
      onReload();
    } catch (e) {
      concludedRef.current = false;
      setActionMsg(`產生結論失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setConcluding(false);
    }
  }, [meeting.id, concluding, onReload]);

  // 時間到自動總結
  useEffect(() => {
    if (running && remaining === 0) void conclude();
  }, [remaining, running, conclude]);

  // 發言迴圈:advance → 顯示 → 間隔 → 再 advance
  async function speakLoop() {
    while (runningRef.current) {
      setTyping(true);
      try {
        const res = await api.advanceMeeting(meeting.id);
        if (!runningRef.current) break;
        setTyping(false);
        if (res.done || !res.message) break;
        setMessages((prev) => [...prev, res.message!]);
      } catch {
        setTyping(false);
        // 單則失敗不中斷會議,等下一輪
      }
      if (!runningRef.current) break;
      const gap = GAP_MS_MIN + Math.random() * (GAP_MS_MAX - GAP_MS_MIN);
      await new Promise((r) => setTimeout(r, gap));
    }
    setTyping(false);
  }

  function start() {
    if (runningRef.current || isConcluded) return;
    runningRef.current = true;
    setRunning(true);
    setRemaining(MEETING_SECONDS);
    void speakLoop();
  }

  useEffect(() => () => { runningRef.current = false; }, []);

  async function interject() {
    if (!note.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.postMeetingMessage(meeting.id, note.trim());
      setMessages((prev) => [...prev, res.message]);
      setNote('');
    } catch (e) {
      setActionMsg(`插話失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setSending(false);
    }
  }

  async function executePlan() {
    if (executing) return;
    setExecuting(true);
    setActionMsg(null);
    try {
      const res = await api.executeMeetingPlan(meeting.id);
      setExecuted(res.created);
      if (res.failures.length) {
        setActionMsg(`部分項目失敗:${res.failures.map((f) => `${f.brandSlug}/${f.platform}`).join('、')}`);
      }
      onReload();
    } catch (e) {
      setActionMsg(`執行發文計畫失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setExecuting(false);
    }
  }

  async function adoptRule(rule: SuggestedRule, idx: number) {
    const brand = brands.find((b) => b.slug === rule.brandSlug);
    if (!brand) { setActionMsg(`找不到品牌 ${rule.brandSlug}`); return; }
    try {
      await api.createBrandRule({
        brandId: brand.id, ruleType: rule.ruleType,
        statement: rule.statement, conditionNote: rule.conditionNote,
      });
      setAdoptedIdx((prev) => new Set(prev).add(idx));
    } catch (e) {
      setActionMsg(`採納失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    }
  }

  if (agentsQuery.loading) return <LoadingState />;
  if (agentsQuery.error) return <ErrorState message={agentsQuery.error} onRetry={agentsQuery.reload} />;

  const mm = String(Math.floor(remaining / 60)).padStart(1, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const showPlan = conclusion?.postPlan?.length ? conclusion.postPlan : planFromMeta;
  const planDone = executed !== null || planExecutedInMeta;

  return (
    <div>
      {/* 三位小編頭像列 + 倒數 */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 17 }}>⚡ {meeting.title}</strong>
              <Badge tone={isConcluded ? 'primary' : running ? 'accent' : 'default'}>
                {isConcluded ? '已結束' : running ? '直播中' : '待開始'}
              </Badge>
            </div>
            {meeting.topic && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-muted)' }}>{meeting.topic}</p>}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: remaining <= 60 && running ? '#B85454' : 'var(--color-text)' }}>
            ⏱ {mm}:{ss}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
          {editors.map((a) => {
            const p = a.persona;
            const lastMsg = [...messages].reverse().find((m) => m.senderAgentId === a.id);
            const emotion = lastMsg?.metadata?.emotion;
            return (
              <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 76 }}>
                <div style={{ position: 'relative' }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.nickname} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-border)' }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, background: 'var(--color-bg-soft)', border: '2px solid var(--color-border)' }}>
                      {FALLBACK_AVATAR[p.characterTitle ?? ''] ?? '🙂'}
                    </div>
                  )}
                  {emotion && running && (
                    <span style={{ position: 'absolute', bottom: -4, right: -6, fontSize: 18 }}>{EMOTION_EMOJI[emotion] ?? ''}</span>
                  )}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.nickname ?? a.displayName}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{a.brandName}</span>
              </div>
            );
          })}
          {!isConcluded && !running && (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              <Button variant="primary" onClick={start}>▶ 開始 5 分鐘小編會議</Button>
            </div>
          )}
        </div>
      </Card>

      {/* 對話區 */}
      <Card style={{ marginBottom: 14 }}>
        <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 && !typing && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>
              按「開始 5 分鐘小編會議」,三位小編就會開始輪流討論;過程中你隨時可以插話。
            </p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const agent = msg.senderAgentId ? agentMap.get(msg.senderAgentId) : undefined;
              const isUser = msg.senderType === 'user';
              const p = agent?.persona;
              const emotion = msg.metadata?.emotion;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}
                >
                  {isUser ? (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-soft)', fontSize: 16, flexShrink: 0 }}>👤</div>
                  ) : p?.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', fontSize: 16, flexShrink: 0 }}>
                      {FALLBACK_AVATAR[p?.characterTitle ?? ''] ?? '🤖'}
                    </div>
                  )}
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 3, textAlign: isUser ? 'right' : 'left' }}>
                      {isUser ? userName(msg.senderUserId) : (p?.nickname ?? agent?.displayName ?? '小編')}
                      {!isUser && agent?.brandName && <span style={{ marginLeft: 6 }}>· {agent.brandName}</span>}
                      {emotion && !isUser && <span style={{ marginLeft: 6 }}>{EMOTION_EMOJI[emotion] ?? ''}</span>}
                    </div>
                    <div style={{ background: isUser ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)', borderRadius: 12, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.6 }}>
                      {msg.content}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {typing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', fontSize: 16 }}>💭</div>
              <div style={{ background: 'var(--color-bg-soft)', borderRadius: 12, padding: '10px 16px', fontSize: 13.5 }}>
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                  小編正在輸入…
                </motion.span>
              </div>
            </motion.div>
          )}
        </div>

        {actionMsg && <p style={{ fontSize: 12.5, color: '#B85454', marginTop: 10 }}>{actionMsg}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={running ? '插話…小編們會回應你的意見' : '插話…'}
            disabled={isConcluded}
            style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === 'Enter') void interject(); }}
          />
          <Button variant="secondary" disabled={sending || isConcluded} onClick={() => void interject()}>
            {sending ? '送出中...' : '插話'}
          </Button>
          {!isConcluded && messages.length > 0 && (
            <Button variant="primary" disabled={concluding} onClick={() => void conclude()}>
              {concluding ? '整理結論中...' : '⏹ 提前結束並總結'}
            </Button>
          )}
        </div>
        {concluding && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 10 }}>🧾 會議時間到,AI 正在整理結論與發文計畫(約 20 秒)…</p>
        )}
      </Card>

      {/* 結論:發文計畫 */}
      {showPlan.length > 0 && (
        <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>📋 發文計畫(會議結論)</strong>
            {!planDone ? (
              <Button variant="primary" disabled={executing} onClick={() => void executePlan()}>
                {executing ? '⏳ 生成貼文中(約1-2分鐘)...' : '🚀 執行發文計畫'}
              </Button>
            ) : (
              <Badge tone="primary">✓ 已執行</Badge>
            )}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {showPlan.map((item, idx) => {
              const brand = brands.find((b) => b.slug === item.brandSlug);
              return (
                <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <Badge tone="secondary">{brand?.name ?? item.brandSlug}</Badge>
                    <Badge tone="default">{item.platform}</Badge>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.topic}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.angle}</div>
                </div>
              );
            })}
          </div>
          {executed && executed.length > 0 && (
            <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-primary)' }}>
              ✓ 已生成 {executed.length} 篇貼文草稿,請到各品牌「內容中心」審核後發布。
            </p>
          )}
        </Card>
      )}

      {/* 結論:建議規則 */}
      {conclusion && conclusion.rules.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <strong style={{ display: 'block', marginBottom: 10 }}>會議建議的發文規則(點採納即寫入品牌智慧)</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {conclusion.rules.map((r, idx) => {
              const brand = brands.find((b) => b.slug === r.brandSlug);
              const adopted = adoptedIdx.has(idx);
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <Badge tone="secondary">{brand?.name ?? r.brandSlug}</Badge>
                      <Badge tone="default">{r.ruleType}</Badge>
                    </div>
                    <div style={{ fontSize: 13.5 }}>{r.statement}</div>
                    {r.conditionNote && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>條件:{r.conditionNote}</div>}
                  </div>
                  <Button
                    variant={adopted ? 'ghost' : 'primary'}
                    disabled={adopted}
                    style={{ flexShrink: 0, fontSize: 12, padding: '5px 12px' }}
                    onClick={() => void adoptRule(r, idx)}
                  >
                    {adopted ? '✓ 已採納' : '採納'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 結論摘要 */}
      {conclusion && (
        <Card>
          <strong style={{ display: 'block', marginBottom: 8 }}>會議摘要</strong>
          <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{conclusion.summary}</p>
        </Card>
      )}
    </div>
  );
}
