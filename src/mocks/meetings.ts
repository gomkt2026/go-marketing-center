import type { Meeting, MeetingMessage, MeetingSummary } from '@/types';
import { daysAgo } from './brands';

function minutesAfter(iso: string, min: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + min);
  return d.toISOString();
}

const homigo1Created = daysAgo(10);
const taskgo1Created = daysAgo(14);

export const meetings: Meeting[] = [
  {
    id: 'meeting-homigo-1', brandId: 'b-homigo', title: '中秋檔期怎麼打?',
    topic: '結合租屋搬遷潮與報修需求規劃中秋內容', status: 'concluded',
    participantAgentIds: ['agent-homigo', 'agent-market', 'agent-risk', 'agent-devil', 'agent-moderator'],
    participantUserIds: ['u-homigo-mgr'],
    createdAt: homigo1Created,
  },
  {
    id: 'meeting-taskgo-1', brandId: 'b-taskgo', title: '缺工國安議題借勢',
    topic: '產業缺工話題延燒,討論TaskGo借勢角度', status: 'concluded',
    participantAgentIds: ['agent-taskgo', 'agent-market', 'agent-moderator'],
    participantUserIds: [],
    createdAt: taskgo1Created,
  },
  {
    id: 'meeting-washgo-1', brandId: 'b-washgo', title: '換季收納內容規劃',
    topic: '無明確時事,轉為常青互動內容討論', status: 'in_progress',
    participantAgentIds: ['agent-washgo', 'agent-market', 'agent-content'],
    participantUserIds: [],
    createdAt: daysAgo(1),
  },
];

export const meetingMessages: MeetingMessage[] = [
  { id: 'msg-1', meetingId: 'meeting-homigo-1', senderType: 'ai_agent', senderAgentId: 'agent-market', content: '中秋前租屋搬遷需求上升,搭配租金補貼新聞,適合借勢。', createdAt: minutesAfter(homigo1Created, 1) },
  { id: 'msg-2', meetingId: 'meeting-homigo-1', senderType: 'ai_agent', senderAgentId: 'agent-homigo', content: '建議主打「連假前把報修處理完」,呼應每天只看一眼的核心訊息。', createdAt: minutesAfter(homigo1Created, 3) },
  { id: 'msg-3', meetingId: 'meeting-homigo-1', senderType: 'ai_agent', senderAgentId: 'agent-devil', content: '中秋話題市場太擁擠,單純蹭節慶恐怕沒有記憶點,建議聚焦報修場景本身。', createdAt: minutesAfter(homigo1Created, 5) },
  { id: 'msg-4', meetingId: 'meeting-homigo-1', senderType: 'ai_agent', senderAgentId: 'agent-risk', content: '注意不可使用保證性字眼,若提及TaskGo串接需帶「依市場調查」前提。', createdAt: minutesAfter(homigo1Created, 6) },
  { id: 'msg-5', meetingId: 'meeting-homigo-1', senderType: 'ai_agent', senderAgentId: 'agent-moderator', content: '彙整三個方向為方案A/B/C,提交決策中心。', createdAt: minutesAfter(homigo1Created, 8) },
  { id: 'msg-6', meetingId: 'meeting-taskgo-1', senderType: 'ai_agent', senderAgentId: 'agent-market', content: '缺工議題持續延燒,建議借勢導流點工Go。', createdAt: minutesAfter(taskgo1Created, 1) },
  { id: 'msg-7', meetingId: 'meeting-taskgo-1', senderType: 'ai_agent', senderAgentId: 'agent-taskgo', content: '立場要站在做工的人這邊,不能消費產業困境。', createdAt: minutesAfter(taskgo1Created, 3) },
  { id: 'msg-8', meetingId: 'meeting-taskgo-1', senderType: 'ai_agent', senderAgentId: 'agent-moderator', content: '彙整為方案A/B,提交決策中心。', createdAt: minutesAfter(taskgo1Created, 5) },
  { id: 'msg-9', meetingId: 'meeting-washgo-1', senderType: 'ai_agent', senderAgentId: 'agent-market', content: '近期無相關時事新聞,依規則轉為 Evergreen 互動內容。', createdAt: minutesAfter(daysAgo(1), 1) },
  { id: 'msg-10', meetingId: 'meeting-washgo-1', senderType: 'ai_agent', senderAgentId: 'agent-content', content: '換季收納是可重複使用的常青主題,建議搭配智慧衣櫃功能。', createdAt: minutesAfter(daysAgo(1), 3) },
];

export const meetingSummaries: MeetingSummary[] = [
  { meetingId: 'meeting-homigo-1', generatedByAgentId: 'agent-moderator', summaryMarkdown: '共識:中秋檔期以「連假前報修」為核心場景,搭配三個方向產出提案。風險提醒已納入內容規則檢查。' },
  { meetingId: 'meeting-taskgo-1', generatedByAgentId: 'agent-moderator', summaryMarkdown: '共識:採用「缺工是國安問題」角度,立場站在做工的人這邊,導流點工Go。' },
];

export function messagesByMeeting(meetingId: string): MeetingMessage[] {
  return meetingMessages.filter((m) => m.meetingId === meetingId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
