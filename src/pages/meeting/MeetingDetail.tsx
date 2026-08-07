import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  meetings, messagesByMeeting, agentById, roleLabels, meetingSummaries, userName,
  proposals,
} from '@/mocks';

export function MeetingDetail({ meetingId }: { meetingId: string }) {
  const meeting = meetings.find((m) => m.id === meetingId);
  const [note, setNote] = useState('');
  if (!meeting) return null;

  const messages = messagesByMeeting(meetingId);
  const summary = meetingSummaries.find((s) => s.meetingId === meetingId);
  const relatedProposal = proposals.find((p) => p.meetingId === meetingId);

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
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{roleLabels[agent.roleCode]}</span>
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
                    {agent && <span style={{ marginLeft: 6 }}>· {roleLabels[agent.roleCode]}</span>}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="管理者插話…(V1 示意,尚未串接發送)"
            style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
          />
          <Button variant="secondary">送出</Button>
        </div>
      </Card>

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
