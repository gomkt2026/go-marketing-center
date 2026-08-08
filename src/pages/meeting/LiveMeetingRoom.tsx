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
/** 打字機效果:每 tick 顯示的字數與間隔 */
const TYPE_CHARS_PER_TICK = 2;
const TYPE_TICK_MS = 45;

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😄', excited: '🤩', annoyed: '😒', angry: '😤',
  worried: '😟', laughing: '🤣', proud: '😎', neutral: '💬',
  sad: '😢', confident: '💪', determined: '✊', surprised: '😲', moved: '🥹',
};

const FALLBACK_AVATAR: Record<string, string> = {
  '工班師傅': '👷', '包租管家': '🏠', '洗衣店店員': '🧺',
};

/** RPG 場景:每場會議依 id 亂數固定一個場景 */
const SCENES = [
  { key: 'laundry', label: '阿樂的洗衣店', img: '/api/media/assets/scenes/laundry.png' },
  { key: 'office', label: '小咪的包租代管辦公室', img: '/api/media/assets/scenes/office.png' },
  { key: 'site', label: '阿豪的工地', img: '/api/media/assets/scenes/site.png' },
] as const;

function pickScene(meetingId: string) {
  let h = 0;
  for (const ch of meetingId) h = (h + ch.charCodeAt(0)) % 997;
  return SCENES[h % SCENES.length];
}

interface SuggestedRule {
  brandSlug: string;
  ruleType: string;
  statement: string;
  conditionNote?: string;
}

interface BrandLearning {
  brandSlug: string;
  insight: string;
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
  const [typedChars, setTypedChars] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [conclusion, setConclusion] = useState<{ summary: string; rules: SuggestedRule[]; postPlan: MeetingPostPlanItem[]; learnings: BrandLearning[] } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState<{ brandSlug: string; platform: string; title: string }[] | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [adoptedIdx, setAdoptedIdx] = useState<Set<number>>(new Set());

  const runningRef = useRef(false);
  const concludedRef = useRef(meeting.status === 'concluded');

  const scene = pickScene(meeting.id);
  const agentMap = new Map<string, AgentWithPersona>((agentsQuery.data?.agents ?? []).map((a) => [a.id, a]));
  const editors = (agentsQuery.data?.agents ?? []).filter((a) => a.roleCode === 'brand_ai' && a.brandId);
  const isConcluded = meeting.status === 'concluded' || conclusion !== null || concludedRef.current;
  const planFromMeta = meeting.metadata?.postPlan ?? [];
  const planExecutedInMeta = !!meeting.metadata?.planExecuted;

  const currentMsg = messages.length ? messages[messages.length - 1] : null;
  const currentAgent = currentMsg?.senderAgentId ? agentMap.get(currentMsg.senderAgentId) : undefined;
  const currentIsUser = currentMsg?.senderType === 'user';

  // 打字機效果:新訊息逐字顯示
  useEffect(() => {
    if (!currentMsg) return;
    setTypedChars(0);
    const total = currentMsg.content.length;
    const timer = setInterval(() => {
      setTypedChars((n) => {
        if (n + TYPE_CHARS_PER_TICK >= total) {
          clearInterval(timer);
          return total;
        }
        return n + TYPE_CHARS_PER_TICK;
      });
    }, TYPE_TICK_MS);
    return () => clearInterval(timer);
  }, [currentMsg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setConclusion({ summary: res.summary, rules: res.suggestedRules, postPlan: res.postPlan ?? [], learnings: res.learnings ?? [] });
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
  const displayText = currentMsg ? currentMsg.content.slice(0, typedChars) : '';
  const typingDone = currentMsg ? typedChars >= currentMsg.content.length : true;

  return (
    <div>
      {/* 標題列 */}
      <Card style={{ marginBottom: 12, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 16 }}>⚡ {meeting.title}</strong>
            <Badge tone={isConcluded ? 'primary' : running ? 'accent' : 'default'}>
              {isConcluded ? '已結束' : running ? '直播中' : '待開始'}
            </Badge>
            <Badge tone="secondary">📍 {scene.label}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: remaining <= 60 && running ? '#B85454' : 'var(--color-text)' }}>
              ⏱ {mm}:{ss}
            </span>
            {!isConcluded && !running && (
              <Button variant="primary" onClick={start}>▶ 開始 5 分鐘小編會議</Button>
            )}
            {!isConcluded && messages.length > 0 && (
              <Button variant="secondary" disabled={concluding} onClick={() => void conclude()}>
                {concluding ? '整理中...' : '⏹ 結束並總結'}
              </Button>
            )}
          </div>
        </div>
        {meeting.topic && <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-text-muted)' }}>{meeting.topic}</p>}
      </Card>

      {/* RPG 舞台:場景背景 + 角色站位 + 對話框 */}
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--color-border)', marginBottom: 14, background: '#1a1626' }}>
        <div style={{
          position: 'relative', height: 300,
          backgroundImage: `url(${scene.img})`, backgroundSize: 'cover', backgroundPosition: 'center 70%',
        }}>
          {/* 角色站位 */}
          <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 48, alignItems: 'flex-end' }}>
            {editors.map((a) => {
              const p = a.persona;
              const isSpeaking = !currentIsUser && currentAgent?.id === a.id && (running || !typingDone);
              const lastMsg = [...messages].reverse().find((m) => m.senderAgentId === a.id);
              const emotion = lastMsg?.metadata?.emotion;
              return (
                <motion.div
                  key={a.id}
                  animate={isSpeaking ? { y: [0, -12, 0] } : { y: 0 }}
                  transition={isSpeaking ? { repeat: Infinity, duration: 0.7 } : {}}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    opacity: !running || isSpeaking || currentIsUser ? 1 : 0.4,
                    filter: isSpeaking ? 'none' : running ? 'saturate(0.6) brightness(0.85)' : 'none',
                    transition: 'opacity 0.3s, filter 0.3s',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={p.nickname} style={{
                        width: isSpeaking ? 132 : 72, height: isSpeaking ? 132 : 72,
                        borderRadius: '50%', objectFit: 'cover',
                        border: isSpeaking ? '4px solid #FFD86B' : '3px solid rgba(255,255,255,0.85)',
                        boxShadow: isSpeaking ? '0 0 24px rgba(255,216,107,0.75), 0 6px 18px rgba(0,0,0,0.4)' : '0 4px 14px rgba(0,0,0,0.35)',
                        transition: 'width 0.25s, height 0.25s, border 0.25s, box-shadow 0.25s',
                      }} />
                    ) : (
                      <div style={{
                        width: isSpeaking ? 132 : 72, height: isSpeaking ? 132 : 72, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isSpeaking ? 56 : 34,
                        background: 'rgba(255,255,255,0.9)',
                        border: isSpeaking ? '4px solid #FFD86B' : '3px solid rgba(255,255,255,0.85)',
                        boxShadow: isSpeaking ? '0 0 24px rgba(255,216,107,0.75)' : 'none',
                        transition: 'width 0.25s, height 0.25s, border 0.25s, box-shadow 0.25s',
                      }}>
                        {FALLBACK_AVATAR[p.characterTitle ?? ''] ?? '🙂'}
                      </div>
                    )}
                    {emotion && running && (
                      <motion.span
                        key={`${lastMsg?.id}-emo`}
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        style={{ position: 'absolute', top: -6, right: -8, fontSize: 24, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                      >
                        {EMOTION_EMOJI[emotion] ?? ''}
                      </motion.span>
                    )}
                  </div>
                  <span style={{
                    fontSize: isSpeaking ? 14 : 12.5, fontWeight: 700,
                    color: isSpeaking ? '#3a2d00' : '#fff',
                    background: isSpeaking ? '#FFD86B' : 'rgba(0,0,0,0.55)',
                    padding: '2px 10px', borderRadius: 999, transition: 'all 0.25s',
                  }}>
                    {isSpeaking ? '🗣 ' : ''}{p.nickname ?? a.displayName}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* RPG 對話框 */}
        <div style={{ background: 'rgba(20, 16, 34, 0.96)', padding: '14px 18px 16px', minHeight: 118, position: 'relative' }}>
          {currentMsg ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{
                  background: currentIsUser ? '#6B8AFD' : '#FFD86B', color: currentIsUser ? '#fff' : '#3a2d00',
                  fontWeight: 700, fontSize: 13, padding: '3px 14px', borderRadius: 8,
                }}>
                  {currentIsUser
                    ? `👤 ${userName(currentMsg.senderUserId)}`
                    : `${currentAgent?.persona.nickname ?? '小編'}(${currentAgent?.brandName ?? ''})`}
                </span>
                {currentMsg.metadata?.interrupted && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ color: '#FF8A8A', fontSize: 12.5, fontWeight: 700 }}>
                    ⚡ 插話!
                  </motion.span>
                )}
                {currentMsg.metadata?.emotion && !currentIsUser && (
                  <span style={{ fontSize: 16 }}>{EMOTION_EMOJI[currentMsg.metadata.emotion] ?? ''}</span>
                )}
              </div>
              <p style={{ color: '#F3EFE4', fontSize: 15, lineHeight: 1.8, minHeight: 54, margin: 0 }}>
                {displayText}
                {!typingDone && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.6 }}>▌</motion.span>}
                {typingDone && running && <motion.span animate={{ opacity: [1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} style={{ marginLeft: 6, fontSize: 13 }}>▼</motion.span>}
              </p>
            </>
          ) : (
            <p style={{ color: 'rgba(243,239,228,0.65)', fontSize: 14, lineHeight: 1.8, margin: 0, paddingTop: 14, textAlign: 'center' }}>
              {isConcluded ? '會議已結束。' : '按「▶ 開始 5 分鐘小編會議」,三位小編就會在這裡開聊;你隨時可以插話。'}
            </p>
          )}
          {typing && (
            <span style={{ position: 'absolute', right: 16, bottom: 10, color: 'rgba(243,239,228,0.5)', fontSize: 12 }}>
              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                💭 下一位小編正在想…
              </motion.span>
            </span>
          )}
        </div>

        {/* 插話列 */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(20,16,34,0.96)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={running ? '插話…小編們會回應你的意見' : '插話…'}
            disabled={isConcluded}
            style={{
              flex: 1, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 12px',
              fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#F3EFE4',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void interject(); }}
          />
          <Button variant="secondary" disabled={sending || isConcluded} onClick={() => void interject()}>
            {sending ? '送出中...' : '💬 插話'}
          </Button>
        </div>
      </div>

      {actionMsg && (
        <Card style={{ marginBottom: 12, borderLeft: '4px solid #B85454' }}>
          <p style={{ fontSize: 12.5, color: '#B85454' }}>{actionMsg}</p>
        </Card>
      )}
      {concluding && (
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>🧾 AI 正在整理結論、發文計畫與品牌學習(約 20 秒)…</p>
        </Card>
      )}

      {/* 對話紀錄(可折疊) */}
      {messages.length > 1 && (
        <Card style={{ marginBottom: 14 }}>
          <button
            onClick={() => setShowLog((s) => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', padding: 0 }}
          >
            {showLog ? '▾' : '▸'} 完整對話紀錄({messages.length} 則,全部已存入資料庫供小編學習)
          </button>
          {showLog && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginTop: 12, paddingRight: 4 }}>
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const agent = msg.senderAgentId ? agentMap.get(msg.senderAgentId) : undefined;
                  const isUser = msg.senderType === 'user';
                  const p = agent?.persona;
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row' }}>
                      {isUser ? (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-soft)', fontSize: 13, flexShrink: 0 }}>👤</div>
                      ) : p?.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🤖</div>
                      )}
                      <div style={{ maxWidth: '80%' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {isUser ? userName(msg.senderUserId) : (p?.nickname ?? agent?.displayName ?? '小編')}
                          {msg.metadata?.interrupted && <span style={{ color: '#B85454', marginLeft: 4 }}>⚡插話</span>}
                          {msg.metadata?.emotion && !isUser && <span style={{ marginLeft: 4 }}>{EMOTION_EMOJI[msg.metadata.emotion] ?? ''}</span>}
                        </span>
                        <div style={{ background: isUser ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)', borderRadius: 10, padding: '6px 10px', fontSize: 12.5, lineHeight: 1.6, marginTop: 2 }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </Card>
      )}

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

      {/* 結論:品牌學習(已寫入資料庫) */}
      {conclusion && conclusion.learnings.length > 0 && (
        <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--color-secondary)' }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>🧠 本次品牌學習(已存入資料庫,小編下次會記得)</strong>
          <div style={{ display: 'grid', gap: 6 }}>
            {conclusion.learnings.map((l, idx) => {
              const brand = brands.find((b) => b.slug === l.brandSlug);
              return (
                <div key={idx} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <Badge tone="secondary">{brand?.name ?? l.brandSlug}</Badge>
                  <span style={{ lineHeight: 1.6 }}>{l.insight}</span>
                </div>
              );
            })}
          </div>
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
