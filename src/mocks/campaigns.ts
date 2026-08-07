import type { Campaign } from '@/types';
import { daysAgo } from './brands';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  return daysAgo(n).slice(0, 10);
}

export const campaigns: Campaign[] = [
  {
    id: 'campaign-homigo-1', primaryBrandId: 'b-homigo', brandIds: ['b-homigo'],
    decisionId: 'decision-homigo-1', title: 'Homigo 中秋報修攻略檔期',
    objective: '延續「每天只看一眼」核心訊息,提升連假前報修轉換', status: 'active',
    startDate: isoDaysAgo(8), endDate: daysFromNow(5),
  },
  {
    id: 'campaign-taskgo-1', primaryBrandId: 'b-taskgo', brandIds: ['b-taskgo'],
    decisionId: 'decision-taskgo-1', title: 'TaskGo 缺工議題借勢檔期', status: 'completed',
    startDate: isoDaysAgo(12), endDate: isoDaysAgo(3),
  },
  {
    id: 'campaign-washgo-1', primaryBrandId: 'b-washgo', brandIds: ['b-washgo'],
    title: 'Washgo 換季收納檔期', status: 'planning',
    startDate: isoDaysAgo(0), endDate: daysFromNow(14),
  },
];

export function campaignsByBrand(brandId: string): Campaign[] {
  return campaigns.filter((c) => c.brandIds.includes(brandId));
}

export function campaignById(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id);
}
