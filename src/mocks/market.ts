import type { MarketSignal } from '@/types';
import { daysAgo } from './brands';

export const marketSignals: MarketSignal[] = [
  {
    id: 'ms-rent-policy', brandId: 'b-homigo', signalType: 'policy',
    title: '租金補貼加碼政策新聞', summary: '政府擴大租金補貼申請資格,租屋族詢問度上升',
    relevanceScore: 0.87, status: 'discussed', discoveredByAgentId: 'agent-market', discoveredAt: daysAgo(2),
  },
  {
    id: 'ms-typhoon', brandId: 'b-homigo', signalType: 'current_event',
    title: '颱風後修繕潮', summary: '近期颱風過境,社群大量討論住家修繕需求',
    relevanceScore: 0.81, status: 'new', discoveredByAgentId: 'agent-market', discoveredAt: daysAgo(1),
  },
  {
    id: 'ms-labor', brandId: 'b-taskgo', signalType: 'industry_trend',
    title: '缺工國安問題延燒', summary: '產業缺工話題持續佔據新聞版面',
    relevanceScore: 0.76, status: 'used', discoveredByAgentId: 'agent-market', discoveredAt: daysAgo(5),
  },
  {
    id: 'ms-season', brandId: 'b-washgo', signalType: 'evergreen',
    title: '換季收納常青話題', summary: '無適合時事,轉為 Evergreen 換季收納互動內容',
    relevanceScore: 0.68, status: 'used', discoveredByAgentId: 'agent-market', discoveredAt: daysAgo(1),
  },
];

export function signalsByBrand(brandId: string): MarketSignal[] {
  return marketSignals.filter((s) => s.brandId === brandId);
}
