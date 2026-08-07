import type { Collaboration, CollaborationBrief } from '@/types';

export const collaborations: Collaboration[] = [
  {
    id: 'collab-1',
    title: 'Homigo × TaskGo 修繕生態合作',
    description: '房客報修需求(Homigo)直通修繕供給(TaskGo)派工,雙方共用單一事實來源避免品牌描述矛盾',
    status: 'active',
    brandIds: ['b-homigo', 'b-taskgo'],
  },
];

export const collaborationBriefs: CollaborationBrief[] = [
  {
    id: 'brief-1',
    collaborationId: 'collab-1',
    title: 'Homigo × TaskGo 修繕串接 Brief',
    versionNumber: 1,
    contentMarkdown: `# Homigo × TaskGo 修繕串接

## 事實(唯一版本,取代雙方文件中互相矛盾的描述)

- 依 Homigo 目前市場調查,為包租代管軟體首創的 TaskGo 串接(已上線)
- 流程:房客報修 → Homigo 建立案件 → 自動流向 TaskGo 修繕廠商(指定派工或市集競價)→ 廠商施工回報 → 進度自動回流 Homigo
- Washgo 現況:狀態由各品牌自行維護,不在此 Brief 中背書,亦不得作為本合作案的內容素材

## 貼文角度授權

- 房東視角(Homigo 發布)、廠商視角(TaskGo 發布)皆可各自使用,但雙方發布前仍需各自品牌負責人核准`,
  },
];
