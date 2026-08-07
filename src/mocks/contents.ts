import type { Content } from '@/types';
import { daysAgo } from './brands';

export const contents: Content[] = [
  {
    id: 'content-homigo-1', campaignId: 'campaign-homigo-1', brandId: 'b-homigo', brandVersionId: 'v-homigo-1',
    contentType: 'image', targetPlatform: 'instagram', title: '連假前,把報修處理完',
    status: 'approved', generatedByAgentId: 'agent-content',
    versions: [
      { id: 'cv-homigo-1-1', contentId: 'content-homigo-1', versionNumber: 1, body: '中秋連假想放空,卻還在等師傅回電?報修交給Homigo,一鍵找師傅、進度同步不用問。', hashtags: ['#Homigo', '#租屋', '#報修'], cta: '加 LINE 免費開始', createdAt: daysAgo(7) },
      { id: 'cv-homigo-1-2', contentId: 'content-homigo-1', versionNumber: 2, body: '連假前,把報修處理完。房客報修不用再靠LINE找工班,一鍵媒合、進度同步查看。', hashtags: ['#Homigo', '#包租代管', '#租屋族'], cta: '加 LINE 免費開始', createdAt: daysAgo(6) },
    ],
    reviews: [
      { id: 'review-1', contentId: 'content-homigo-1', contentVersionId: 'cv-homigo-1-1', reviewerId: 'u-homigo-mgr', action: 'modify', comment: '請把「中秋連假想放空」語氣改得更貼近品牌一貫的務實調性。', reviewedAt: daysAgo(6) },
      { id: 'review-2', contentId: 'content-homigo-1', contentVersionId: 'cv-homigo-1-2', reviewerId: 'u-homigo-mgr', action: 'approve', comment: '調整後符合品牌語調,核准發布。', reviewedAt: daysAgo(5) },
    ],
  },
  {
    id: 'content-taskgo-1', campaignId: 'campaign-taskgo-1', brandId: 'b-taskgo', brandVersionId: 'v-taskgo-1',
    contentType: 'article', targetPlatform: 'threads', title: '缺工是國安問題,工地人自己想辦法',
    status: 'published', generatedByAgentId: 'agent-content',
    versions: [
      { id: 'cv-taskgo-1-1', contentId: 'content-taskgo-1', versionNumber: 1, body: '缺工是國安問題沒人否認,但工地人不能等政策。點工Go上架接案,案子自己找上門。', hashtags: ['#做工的人', '#缺工', '#點工'], cta: '留言 +1,教你怎麼設定。', createdAt: daysAgo(12) },
    ],
    reviews: [
      { id: 'review-3', contentId: 'content-taskgo-1', contentVersionId: 'cv-taskgo-1-1', reviewerId: 'u-taskgo-mgr', action: 'approve', comment: '立場精準,核准發布。', reviewedAt: daysAgo(11) },
    ],
  },
  {
    id: 'content-washgo-1', campaignId: 'campaign-washgo-1', brandId: 'b-washgo', brandVersionId: 'v-washgo-1',
    contentType: 'image', targetPlatform: 'instagram', title: '厚外套收之前,先讓它乾乾淨淨過冬眠',
    status: 'pending_review', generatedByAgentId: 'agent-content',
    versions: [
      { id: 'cv-washgo-1-1', contentId: 'content-washgo-1', versionNumber: 1, body: '換季收納前,先讓外套洗好曬乾再收起來。到府收送+專業洗護,明年拿出來不再有霉味。', hashtags: ['#Washgo', '#衣物送洗', '#換季'], cta: '加入 @washgo 領取 100 GoCoin', createdAt: daysAgo(1) },
    ],
    reviews: [],
  },
  {
    id: 'content-homigo-2', campaignId: 'campaign-homigo-1', brandId: 'b-homigo', brandVersionId: 'v-homigo-1',
    contentType: 'article', targetPlatform: 'facebook', title: 'HomiScore 信用資產長文',
    status: 'draft', generatedByAgentId: 'agent-content',
    versions: [
      { id: 'cv-homigo-2-1', contentId: 'content-homigo-2', versionNumber: 1, body: '好房客值得被看見。HomiScore 累積你的租屋信用資產,看房不再被刁難。', hashtags: ['#Homigo', '#HomiScore'], cta: '加 LINE 免費開始', createdAt: daysAgo(0) },
    ],
    reviews: [],
  },
];

export function contentsByBrand(brandId: string): Content[] {
  return contents.filter((c) => c.brandId === brandId);
}

export function contentById(id: string): Content | undefined {
  return contents.find((c) => c.id === id);
}

export function latestVersion(content: Content) {
  return content.versions[content.versions.length - 1];
}
