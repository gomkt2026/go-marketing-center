import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useMeta } from '@/context/MetaContext';
import { useBrand } from '@/context/BrandContext';
import { api } from '@/lib/api';
import { useAsyncData, LoadingState, ErrorState } from '@/hooks/useAsyncData';
import { ROLE_LABELS } from '@/lib/constants';
import { LiveMeetingRoom } from './LiveMeetingRoom';

interface SuggestedRule {
  brandSlug: string;
  ruleType: string;
  statement: string;
  conditionNote?: string;
}

export function MeetingDetail({ meetingId }: { meetingId: string }) {
  const { agentById, userName } = useMeta();
  const { brands } = useBrand();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [suggestedRules, setSuggestedRules] = useState<SuggestedRule[]>([]);
  const [adoptedIdx, setAdoptedIdx] = useState<Set<number>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => api.meeting(meetingId), [meetingId]);
  const proposalsQuery = useAsyncData(() => api.proposals(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? '載入失敗'} onRetry={reload} />;

  // 小編快閃會議走直播式介面
  if (data.meeting.mode === 'live_editors') {
    return <LiveMeetingRoom key={meetingId} meeting={data.meeting} initialMessages={data.messages} onReload={reload} />;
  }

  const meeting = data.meeting;
  const messages = data.messages;
  const summary = data.summary;
  const relatedProposal = proposalsQuery.data?.proposals.find((p) => p.meetingId === meetingId);

  async function sendMessage() {
    if (!note.trim() || sending) return;
    setSending(true);
    setActionMsg(null);
    try {
      const res = await api.postMeetingMessage(meetingId, note.trim());
      setNote('');
      if (res.aiError) setActionMsg(`AI 回覆失敗:${res.aiError}`);
      reload();
    } finally {
      setSending(false);
    }
  }

  async function conclude() {
    if (concluding) return;
    setConcluding(true);
    setActionMsg(null);
    try {
      const res = await api.concludeMeeting(meetingId);
      setSuggestedRules(res.suggestedRules);
      setAdoptedIdx(new Set());
      reload();
    } catch (e) {
      setActionMsg(`產生結論失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    } finally {
      setConcluding(false);
    }
  }

  async function adoptRule(rule: SuggestedRule, idx: number) {
    const brand = brands.find((b) => b.slug === rule.brandSlug);
    if (!brand) {
      setActionMsg(`找不到品牌 ${rule.brandSlug}`);
      return;
    }
    try {
      await api.createBrandRule({
        brandId: brand.id,
        ruleType: rule.ruleType,
        statement: rule.statement,
        conditionNote: rule.conditionNote,
      });
      setAdoptedIdx((prev) => new Set(prev).add(idx));
    } catch (e) {
      setActionMsg(`採納失敗:${e instanceof Error ? e.message : '未知錯誤'}`);
    }
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: 17 }}>{meeting.title}</strong>
            <p style={{ fontSize: 13, marginTop: 4 }}>{meeting.topic}</p>
          </div>
          <Badge tone={meeting.status === 'concluded' ? 'primary' : 'accent'}>
            {meeting.status === 'concluded' ? '已結束' : meeting.status === 'in_progress' ? '進行中' : '已排程'}
          </Badge>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {meeting.participantAgentIds.map((id) => {
            const agent = agentById(id);
            if (!agent) return null;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-soft)', borderRadius: 999, padding: '4px 10px 4px 4px' }}>
                <Avatar label={agent.displayName} color={agent.avatarColor} size={22} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{agent.displayName}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{ROLE_LABELS[agent.roleCode]}</span>
              </div>
            );
          })}
          {meeting.participantUserIds.map((id) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary-soft)', borderRadius: 999, padding: '4px 10px 4px 4px' }}>
              <Avatar label={userName(id)} color="var(--color-secondary)" size={22} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{userName(id)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>👤 管理者</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {messages.map((msg, i) => {
            const agent = msg.senderAgentId ? agentById(msg.senderAgentId) : undefined;
            const isUser = msg.senderType === 'user';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: isUser ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}
              >
                <Avatar label={agent?.displayName ?? userName(msg.senderUserId)} color={agent?.avatarColor ?? 'var(--color-secondary)'} size={30} />
                <div style={{ maxWidth: '75%' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 3, textAlign: isUser ? 'right' : 'left' }}>
                    {agent ? agent.displayName : userName(msg.senderUserId)}
                    {agent && <span style={{ marginLeft: 6 }}>· {ROLE_LABELS[agent.roleCode]}</span>}
                  </div>
                  <div
                    style={{
                      background: isUser ? 'var(--color-primary-soft)' : 'var(--color-bg-soft)',
                      borderRadius: 12, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.6,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        {sending && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 10 }}>⏳ AI 代理人正在回覆討論中,可能需要 30 秒左右...</p>
        )}
        {actionMsg && (
          <p style={{ fontSize: 12.5, color: '#B85454', marginTop: 10 }}>{actionMsg}</p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="管理者插話…"
            style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage(); }}
          />
          <Button variant="secondary" disabled={sending} onClick={() => void sendMessage()}>{sending ? '回覆中...' : '送出'}</Button>
          {meeting.status !== 'concluded' && (
            <Button variant="primary" disabled={concluding} onClick={() => void conclude()}>
              {concluding ? '整理中...' : '🧾 產生結論'}
            </Button>
          )}
        </div>
      </Card>

      {suggestedRules.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <strong style={{ display: 'block', marginBottom: 10 }}>會議建議的發文規則(點採納即寫入品牌智慧)</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {suggestedRules.map((r, idx) => {
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

      {summary && (
        <Card style={{ marginBottom: 14 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>會議摘要</strong>
          <p style={{ fontSize: 13.5 }}>{summary.summaryMarkdown}</p>
        </Card>
      )}

      {relatedProposal && (
        <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Badge tone="accent">📋 提案已生成</Badge>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{relatedProposal.title}</div>
          </div>
          <Link to="/decisions"><Button variant="primary">前往決策中心 →</Button></Link>
        </Card>
      )}
    </div>
  );
}
