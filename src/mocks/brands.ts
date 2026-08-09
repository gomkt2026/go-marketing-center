import type {
  Brand, BrandVersion, BrandRule, BrandAudience, BrandPersona,
  BrandChannel, BrandKeyword, BrandVisual, BrandHistory, BrandExample, BrandDocument,
} from '@/types';

export const brands: Brand[] = [
  {
    id: 'b-homigo', slug: 'homigo', name: 'Homigo',
    tagline: '不是管理房子,而是讓房子自己運作。',
    primaryColor: '#A7C18D', logoInitial: 'H', logoUrl: null, currentVersionId: 'v-homigo-1',
  },
  {
    id: 'b-taskgo', slug: 'taskgo', name: 'TaskGo',
    tagline: '讓工程專案管理更簡單、更智能',
    primaryColor: '#ED9121', logoInitial: 'T', logoUrl: null, currentVersionId: 'v-taskgo-1',
  },
  {
    id: 'b-washgo', slug: 'washgo', name: 'Washgo',
    tagline: '衣物送洗,交給 Washgo',
    primaryColor: '#A87C64', logoInitial: 'W', logoUrl: null, currentVersionId: 'v-washgo-1',
  },
];

export const brandVersions: BrandVersion[] = [
  {
    id: 'v-homigo-1', brandId: 'b-homigo', versionNumber: 1, status: 'published',
    summaryOfChanges: '首版發布:依 HOMIGO_BRAND_PROFILE.md v1.0 拆解建立',
    confidenceScore: 0.93, publishedBy: 'u-homigo-mgr', publishedAt: daysAgo(20),
  },
  {
    id: 'v-taskgo-1', brandId: 'b-taskgo', versionNumber: 1, status: 'published',
    summaryOfChanges: '首版發布:依 TaskGo_品牌行銷資料.md 拆解建立',
    confidenceScore: 0.90, publishedBy: 'u-taskgo-mgr', publishedAt: daysAgo(18),
  },
  {
    id: 'v-washgo-1', brandId: 'b-washgo', versionNumber: 1, status: 'published',
    summaryOfChanges: '首版發布:依 WASHGO_BRAND_MARKETING.md 拆解建立',
    confidenceScore: 0.88, publishedBy: 'u-washgo-mgr', publishedAt: daysAgo(15),
  },
];

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const brandDocuments: BrandDocument[] = [
  { id: 'doc-homigo-1', brandId: 'b-homigo', sourceType: 'brand_manual', title: 'Homigo 品牌行銷資料檔 v1.0', fileUrl: 'data/brands/HOMIGO_BRAND_PROFILE.md' },
  { id: 'doc-taskgo-1', brandId: 'b-taskgo', sourceType: 'brand_manual', title: 'TaskGo 品牌行銷資料', fileUrl: 'data/brands/TASKGO_BRAND_MARKETING.md' },
  { id: 'doc-washgo-1', brandId: 'b-washgo', sourceType: 'brand_manual', title: 'Washgo 品牌行銷聖經', fileUrl: 'data/brands/WASHGO_BRAND_MARKETING.md' },
];

export const brandAudiences: BrandAudience[] = [
  { id: 'aud-1', brandId: 'b-homigo', name: '自管房東(1~10間)', painPoints: ['收租、報修、續約全靠自己記'], appealAngle: '每天只看一眼的自動化' },
  { id: 'aud-2', brandId: 'b-homigo', name: '包租代管業者', painPoints: ['多物件多房東,人力吃緊'], appealAngle: '三視角管理、指揮中心、規模化' },
  { id: 'aud-3', brandId: 'b-homigo', name: '房客(20~40歲租屋族)', painPoints: ['報修沒下文', '押金爭議', '信用無累積'], appealAngle: '透明進度、HomiScore 信用資產' },
  { id: 'aud-4', brandId: 'b-washgo', name: '忙碌上班族/雙薪家庭', painPoints: ['沒時間洗', '沒時間拿'], appealAngle: '到府收送、LINE 下單、時間還給自己' },
  { id: 'aud-5', brandId: 'b-washgo', name: '精緻衣物擁有者', painPoints: ['西裝、大衣、禮服、名牌怕洗壞'], appealAngle: '專業品管、電子簽名、AI 洗護' },
  { id: 'aud-6', brandId: 'b-washgo', name: '傳統洗衣店主(B2B)', painPoints: ['手寫單、電話聯絡、客源老化'], appealAngle: '數位轉型零門檻、年輕客群從 LINE 進來' },
];

export const brandPersonas: BrandPersona[] = [
  { id: 'per-1', brandId: 'b-taskgo', code: 'P1', name: '工程行老闆 / 工班頭(OWNER)', ageRange: '30-55', profile: '同時管 3-10 個工地,手機不離身,LINE 群組幾十個', painPoints: ['每天下午的今天做到哪奪命連環call', '排班燒腦', '月底才知道案子賠錢'], appealAngle: '省時間、看得到錢、掌控感' },
  { id: 'per-2', brandId: 'b-taskgo', code: 'P2', name: '工地主任 / 專案經理(PM)', painPoints: ['口頭交代大家都忘', '缺失追不完', '照片文件散在群組'], appealAngle: '留紀錄、追改善、進度自動彙整' },
  { id: 'per-3', brandId: 'b-taskgo', code: 'P3', name: '現場師傅 / 工班成員', ageRange: '50-60', profile: '含老師傅,「阮嘸會用APP啦」但LINE玩得很溜', painPoints: ['怕麻煩、怕學新東西', '請款單寫了沒下文'], appealAngle: '不用裝APP、會傳早安圖就會用' },
  { id: 'per-5', brandId: 'b-taskgo', code: 'P5', name: '房東 / 物管(Homigo 受眾)', painPoints: ['租客報修電話接不完', '找不到可靠廠商'], appealAngle: '報修線上填單、案件自動派給TaskGo廠商' },
];

export const brandRules: BrandRule[] = [
  { id: 'rule-1', brandId: 'b-homigo', ruleType: 'can_claim', statement: '依 Homigo 目前市場調查,為包租代管軟體首創的 TaskGo 串接', conditionNote: '必須帶「依 Homigo 目前市場調查」前提', verification: 'claimed' },
  { id: 'rule-2', brandId: 'b-homigo', ruleType: 'cannot_claim', statement: '市佔率第一、用戶數字(除非另行提供官方數據)、「保證」性承諾', verification: 'pending' },
  { id: 'rule-3', brandId: 'b-homigo', ruleType: 'negative_rule', statement: '不得生成任何暗示可規避法規(如逃漏稅、違建出租)的內容', verification: 'verified' },
  { id: 'rule-4', brandId: 'b-homigo', ruleType: 'marketing_rule', statement: 'TaskGo / Washgo 為合作生態夥伴,不可宣稱為 Homigo 自有品牌', verification: 'verified' },
  { id: 'rule-5', brandId: 'b-taskgo', ruleType: 'can_claim', statement: '500+ 團隊使用', conditionNote: '官網信任數據,可直接使用', verification: 'verified' },
  { id: 'rule-6', brandId: 'b-taskgo', ruleType: 'can_claim', statement: '派工時間減少 70%', conditionNote: '客戶案例數據,可用該句式', verification: 'verified' },
  { id: 'rule-7', brandId: 'b-taskgo', ruleType: 'can_claim', statement: '免費試用 14 天', conditionNote: '官網 CTA', verification: 'verified' },
  { id: 'rule-8', brandId: 'b-taskgo', ruleType: 'cannot_claim', statement: '自創百分比、「全台第一/市佔最高」等無法佐證的最高級用語', verification: 'verified' },
  { id: 'rule-9', brandId: 'b-taskgo', ruleType: 'negative_rule', statement: 'Washgo 未上線前,不得生成 Washgo 貼文、不得宣稱其已可使用', conditionNote: '已於 Collaboration Brief 中統一狀態說明', verification: 'verified' },
  { id: 'rule-10', brandId: 'b-washgo', ruleType: 'cannot_claim', statement: '5,000+ 服務客戶 / 98% 客戶滿意度', conditionNote: '官網宣稱數字,未經核實,需人工確認後才可使用', verification: 'pending' },
  { id: 'rule-11', brandId: 'b-washgo', ruleType: 'can_claim', statement: 'GoCoin 1 點 = NT$1,跨品牌通用,永久不過期', conditionNote: '產品事實', verification: 'verified' },
  { id: 'rule-12', brandId: 'b-washgo', ruleType: 'marketing_rule', statement: '新會員禮:加入 @washgo 領 100 GoCoin', conditionNote: '時效性內容,發文前需確認活動仍有效', verification: 'claimed', validUntil: daysFromNow(60) },
  { id: 'rule-13', brandId: 'b-washgo', ruleType: 'negative_rule', statement: 'Washgo 是衣物洗滌/乾洗平台,不是洗車,不得出現洗車聯想', verification: 'verified' },
];

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

export const brandChannels: BrandChannel[] = [
  { id: 'ch-1', brandId: 'b-homigo', platform: 'facebook', toneOfVoice: '完整敘事、專業可信', lengthGuideline: '長文', formatGuideline: '痛點 → 解法 → CTA,搭配輪播圖卡', hashtagCountMin: 2, hashtagCountMax: 3 },
  { id: 'ch-2', brandId: 'b-homigo', platform: 'instagram', toneOfVoice: '視覺優先、生活感', lengthGuideline: '短文', formatGuideline: '4:5 輪播(1080x1350)、限動、Reels 腳本', hashtagCountMin: 8, hashtagCountMax: 15 },
  { id: 'ch-3', brandId: 'b-homigo', platform: 'threads', toneOfVoice: '口語、短、敢聊時事', lengthGuideline: '1-3 段', formatGuideline: '可蹭租屋話題、開放留言互動', hashtagCountMin: 3, hashtagCountMax: 5 },
  { id: 'ch-4', brandId: 'b-taskgo', platform: 'threads', toneOfVoice: '台味短文、工地共鳴梗,可用台語詞', lengthGuideline: '前3行決定生死', formatGuideline: '結尾必留互動問句', hashtagCountMin: 3, hashtagCountMax: 5 },
  { id: 'ch-5', brandId: 'b-taskgo', platform: 'facebook', toneOfVoice: '誠懇前輩分享、故事完整有頭有尾', lengthGuideline: '300-800字', formatGuideline: '首兩行破題,搭配1-4張對比圖', hashtagCountMin: 2, hashtagCountMax: 3 },
  { id: 'ch-6', brandId: 'b-washgo', platform: 'threads', toneOfVoice: '口語、貼近生活、像朋友抱怨', lengthGuideline: '1-3句', formatGuideline: '先共鳴再置入,品牌名可放留言區', hashtagCountMin: 0, hashtagCountMax: 2 },
  { id: 'ch-7', brandId: 'b-washgo', platform: 'instagram', toneOfVoice: '視覺優先短hook', lengthGuideline: '100-200字', formatGuideline: '第一張強hook,輪播教學', hashtagCountMin: 8, hashtagCountMax: 15 },
];

export const brandKeywords: BrandKeyword[] = [
  { id: 'kw-1', brandId: 'b-homigo', category: 'hashtag', value: '#Homigo' },
  { id: 'kw-2', brandId: 'b-homigo', category: 'hashtag', value: '#包租代管' },
  { id: 'kw-3', brandId: 'b-homigo', category: 'hashtag', value: '#租屋族' },
  { id: 'kw-4', brandId: 'b-homigo', category: 'hashtag', value: '#報修' },
  { id: 'kw-5', brandId: 'b-homigo', category: 'cta', value: '加 LINE 免費開始' },
  { id: 'kw-6', brandId: 'b-homigo', category: 'cta', value: '左滑看更多' },
  { id: 'kw-7', brandId: 'b-homigo', category: 'key_message', value: '不是管理房子,而是讓房子自己運作。' },
  { id: 'kw-8', brandId: 'b-homigo', category: 'key_message', value: '每天只需要看一眼。' },
  { id: 'kw-9', brandId: 'b-taskgo', category: 'hashtag', value: '#做工的人' },
  { id: 'kw-10', brandId: 'b-taskgo', category: 'hashtag', value: '#工地日常' },
  { id: 'kw-11', brandId: 'b-taskgo', category: 'hashtag', value: '#派工' },
  { id: 'kw-12', brandId: 'b-taskgo', category: 'cta', value: '免費試用 14 天,先用再說。' },
  { id: 'kw-13', brandId: 'b-taskgo', category: 'cta', value: '傳給你那個還在用白板排班的頭仔。' },
  { id: 'kw-14', brandId: 'b-taskgo', category: 'key_message', value: '工地人不是不懂科技,是以前的科技不懂工地。' },
  { id: 'kw-15', brandId: 'b-washgo', category: 'hashtag', value: '#Washgo' },
  { id: 'kw-16', brandId: 'b-washgo', category: 'hashtag', value: '#衣物送洗' },
  { id: 'kw-17', brandId: 'b-washgo', category: 'hashtag', value: '#到府收送' },
  { id: 'kw-18', brandId: 'b-washgo', category: 'hashtag', value: '#GoCoin' },
  { id: 'kw-19', brandId: 'b-washgo', category: 'cta', value: '加入 @washgo 領取 100 GoCoin' },
  { id: 'kw-20', brandId: 'b-washgo', category: 'key_message', value: '洗滌產業的智慧管理平台' },
];

export const brandVisuals: BrandVisual[] = [
  { id: 'vis-1', brandId: 'b-homigo', label: 'IG輪播尺寸', value: '1080x1350 (4:5)', category: 'layout' },
  { id: 'vis-2', brandId: 'b-washgo', label: '主色-深藍', value: '#1D4F8C', category: 'color' },
  { id: 'vis-3', brandId: 'b-washgo', label: '主色-品牌藍', value: '#3A8DDE', category: 'color' },
  { id: 'vis-4', brandId: 'b-washgo', label: '輔助色-天藍', value: '#6CC3F5', category: 'color' },
  { id: 'vis-5', brandId: 'b-washgo', label: '強調色-金橘', value: '#FFB84D', category: 'color' },
];

export const brandHistories: BrandHistory[] = [
  { id: 'hist-1', brandId: 'b-homigo', happenedOn: daysAgo(90), title: 'Homigo × TaskGo 修繕串接正式上線', description: '包租代管軟體首創的修繕串接功能' },
  { id: 'hist-2', brandId: 'b-taskgo', happenedOn: daysAgo(120), title: '點工Go 上線', description: '全台點工媒合平台正式推出' },
  { id: 'hist-3', brandId: 'b-washgo', happenedOn: daysAgo(60), title: 'GoCoin 跨品牌點數上線', description: '消費者可跨品牌通用點數折抵' },
];

export const brandExamples: BrandExample[] = [
  { id: 'ex-1', brandId: 'b-homigo', category: 'content_pillar', title: '痛點共鳴', body: '房東/房客日常慘況:LINE群追修繕、手抄對帳、押金爭議、報修沒下文', weightPercent: 30 },
  { id: 'ex-2', brandId: 'b-homigo', category: 'content_pillar', title: '產品亮點', body: '功能單點深入:一鍵找師傅、AI換裝、每日摘要、HomiScore', weightPercent: 25 },
  { id: 'ex-3', brandId: 'b-homigo', category: 'content_pillar', title: '時事借勢', body: '租金補貼政策、囤房稅、社宅新聞、颱風後修繕潮', weightPercent: 20 },
  { id: 'ex-4', brandId: 'b-taskgo', category: 'content_pillar', title: '痛點共鳴型', body: '工地日常場景引發「這就是我」的共鳴,如代打卡、群組考古', weightPercent: 40 },
  { id: 'ex-5', brandId: 'b-taskgo', category: 'content_pillar', title: '產業趨勢蹭熱度型', body: '缺工國安問題、ESG/碳費上路、AI取代工作', weightPercent: 20 },
  { id: 'ex-6', brandId: 'b-washgo', category: 'hot_topic_bank', title: '換季收納', body: '厚外套收之前沒洗,明年拿出來就是霉味 → 到府收送+專業洗護+智慧衣櫃建檔' },
  { id: 'ex-7', brandId: 'b-washgo', category: 'hot_topic_bank', title: '梅雨/潮濕發霉', body: '衣服晾三天還是濕的,房間都是味道 → 專業洗滌烘乾、48小時內交件' },
];

export function brandById(id: string): Brand | undefined {
  return brands.find((b) => b.id === id);
}

export function brandBySlug(slug: string): Brand | undefined {
  return brands.find((b) => b.slug === slug);
}

export function versionByBrand(brandId: string): BrandVersion | undefined {
  return brandVersions.find((v) => v.brandId === brandId);
}
