import type { User } from '@/types';

export const users: User[] = [
  { id: 'u-admin', displayName: '張大高', email: 'admin@go-mkt.tw', role: 'super_admin' },
  { id: 'u-homigo-mgr', displayName: 'Homigo 品牌負責人', email: 'manager@homigo.tw', role: 'brand_manager' },
  { id: 'u-taskgo-mgr', displayName: 'TaskGo 品牌負責人', email: 'manager@taskgo.tw', role: 'brand_manager' },
  { id: 'u-washgo-mgr', displayName: 'Washgo 品牌負責人', email: 'manager@washgo.tw', role: 'brand_manager' },
];

export const currentUser = users[0];

export function userName(id?: string): string {
  if (!id) return '未知使用者';
  return users.find((u) => u.id === id)?.displayName ?? '未知使用者';
}
