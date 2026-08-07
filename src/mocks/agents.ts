import type { AIAgent } from '@/types';

export const aiAgents: AIAgent[] = [
  { id: 'agent-homigo', brandId: 'b-homigo', roleCode: 'brand_ai', displayName: 'Homigo AI', avatarColor: '#A7C18D' },
  { id: 'agent-taskgo', brandId: 'b-taskgo', roleCode: 'brand_ai', displayName: 'TaskGo AI', avatarColor: '#ED9121' },
  { id: 'agent-washgo', brandId: 'b-washgo', roleCode: 'brand_ai', displayName: 'Washgo AI', avatarColor: '#A87C64' },
  { id: 'agent-market', brandId: null, roleCode: 'market_analyst', displayName: 'Market Analyst', avatarColor: '#6C6C6C' },
  { id: 'agent-content', brandId: null, roleCode: 'content_strategist', displayName: 'Content Strategist', avatarColor: '#8AA6C2' },
  { id: 'agent-risk', brandId: null, roleCode: 'risk_advisor', displayName: 'Risk Advisor', avatarColor: '#D97B7B' },
  { id: 'agent-devil', brandId: null, roleCode: 'devils_advocate', displayName: "Devil's Advocate", avatarColor: '#B26FB2' },
  { id: 'agent-moderator', brandId: null, roleCode: 'moderator', displayName: 'Moderator', avatarColor: '#7C9C7C' },
];

export const roleLabels: Record<string, string> = {
  brand_ai: '品牌 AI',
  market_analyst: '市場分析',
  content_strategist: '內容策略',
  risk_advisor: '風險評估',
  devils_advocate: '反方觀點',
  moderator: '會議主持',
};

export function agentById(id?: string): AIAgent | undefined {
  return aiAgents.find((a) => a.id === id);
}
