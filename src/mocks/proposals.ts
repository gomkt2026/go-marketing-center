import type { Proposal, Decision } from '@/types';
import { daysAgo } from './brands';

export const proposals: Proposal[] = [
  {
    id: 'proposal-homigo-1', brandId: 'b-homigo', meetingId: 'meeting-homigo-1',
    title: '中秋檔期行銷提案', status: 'approved', proposedByAgentId: 'agent-moderator', createdAt: daysAgo(9),
    options: [
      {
        id: 'option-a', proposalId: 'proposal-homigo-1', label: '方案 A',
        description: '連假報修攻略圖文', pros: ['實用性高', '延續品牌核心訊息'], cons: ['話題性較低'],
        riskLevel: 'low', estimatedCost: 3000, brandFitScore: 95, estimatedImpact: { reach: '中', engagement: '中高' },
      },
      {
        id: 'option-b', proposalId: 'proposal-homigo-1', label: '方案 B',
        description: '中秋互動抽獎活動', pros: ['互動率高', '帶新粉絲'], cons: ['需要抽獎成本', '與品牌調性稍偏娛樂'],
        riskLevel: 'medium', estimatedCost: 12000, brandFitScore: 82, estimatedImpact: { reach: '高', engagement: '高' },
      },
      {
        id: 'option-c', proposalId: 'proposal-homigo-1', label: '方案 C',
        description: '不蹭中秋,發常青報修知識文', pros: ['零風險', '可重複使用'], cons: ['話題性最低'],
        riskLevel: 'low', estimatedCost: 1500, brandFitScore: 90, estimatedImpact: { reach: '低', engagement: '低' },
      },
    ],
  },
  {
    id: 'proposal-taskgo-1', brandId: 'b-taskgo', meetingId: 'meeting-taskgo-1',
    title: '缺工國安議題貼文提案', status: 'approved', proposedByAgentId: 'agent-moderator', createdAt: daysAgo(13),
    options: [
      {
        id: 'option-taskgo-a', proposalId: 'proposal-taskgo-1', label: '方案 A',
        description: '缺工是國安問題,反轉為「點工Go」解方', pros: ['產業趨勢蹭熱度型', '導流點工Go'], cons: ['需精準拿捏立場,避免消費產業困境'],
        riskLevel: 'low', estimatedCost: 0, brandFitScore: 88, estimatedImpact: { reach: '高' },
      },
      {
        id: 'option-taskgo-b', proposalId: 'proposal-taskgo-1', label: '方案 B',
        description: '純數據型貼文(派工效率提升70%)', pros: ['零風險', '可信度高'], cons: ['互動率較低'],
        riskLevel: 'low', estimatedCost: 0, brandFitScore: 92, estimatedImpact: { reach: '中' },
      },
    ],
  },
  {
    id: 'proposal-collab-1', collaborationId: 'collab-1',
    title: 'Homigo × TaskGo 修繕串接週年回顧貼文', status: 'pending_decision', proposedByAgentId: 'agent-moderator', createdAt: daysAgo(1),
    options: [
      {
        id: 'option-collab-a', proposalId: 'proposal-collab-1', label: '方案 A',
        description: '雙品牌各自發布,分別以房東視角與廠商視角敘事', pros: ['雙邊導流', '強化生態系印象'], cons: ['需雙方各自審閱,時程需對齊'],
        riskLevel: 'low', brandFitScore: 91, estimatedImpact: { reach: '中高' },
      },
    ],
  },
  {
    id: 'proposal-washgo-1', brandId: 'b-washgo', meetingId: 'meeting-washgo-1',
    title: '換季收納常青內容提案', status: 'pending_decision', proposedByAgentId: 'agent-content', createdAt: daysAgo(0),
    options: [
      {
        id: 'option-washgo-a', proposalId: 'proposal-washgo-1', label: '方案 A',
        description: '「厚外套收之前先洗」圖文 + 智慧衣櫃導購', pros: ['可重複使用', '結合產品差異化功能'], cons: ['需搭配季節時機發布'],
        riskLevel: 'low', estimatedCost: 2000, brandFitScore: 89, estimatedImpact: { reach: '中', engagement: '中' },
      },
      {
        id: 'option-washgo-b', proposalId: 'proposal-washgo-1', label: '方案 B',
        description: '互動投票:「你家有幾件季節限定衣物躺在衣櫃?」', pros: ['低成本高互動'], cons: ['不直接導購'],
        riskLevel: 'low', estimatedCost: 0, brandFitScore: 80, estimatedImpact: { reach: '中', engagement: '高' },
      },
    ],
  },
];

export const decisions: Decision[] = [
  {
    id: 'decision-homigo-1', proposalId: 'proposal-homigo-1', chosenOptionId: 'option-a',
    action: 'approve', decidedBy: 'u-homigo-mgr', note: '採用方案A,聚焦報修場景,避免過度蹭節慶。', decidedAt: daysAgo(9),
  },
  {
    id: 'decision-taskgo-1', proposalId: 'proposal-taskgo-1', chosenOptionId: 'option-taskgo-a',
    action: 'approve', decidedBy: 'u-taskgo-mgr', note: '採用方案A,立場站在做工的人這邊,導流點工Go。', decidedAt: daysAgo(13),
  },
];

export function proposalById(id: string): Proposal | undefined {
  return proposals.find((p) => p.id === id);
}

export function decisionByProposal(proposalId: string): Decision | undefined {
  return decisions.find((d) => d.proposalId === proposalId);
}
