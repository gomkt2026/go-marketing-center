/** 群組口語／症狀 → 標準工種，讓「修馬桶」對到水電、「壁癌」對到防水。 */

export interface TradeDef {
  category: string;
  aliases: string[];
  symptoms: string[];
}

export interface InferredTrades {
  category: string | null;
  aliases: string[];
  region: string | null;
  summary: string | null;
  trades: string[];
}

export const NETWORK_TRADES: TradeDef[] = [
  {
    category: '水電',
    aliases: ['水電', '水電工', '水電工程', '配管', '電路', '水電師傅'],
    symptoms: [
      '修馬桶', '馬桶', '馬桶不通', '馬桶堵塞', '馬桶漏',
      '水管', '水管漏', '水龍頭', '水龍頭漏', '熱水器',
      '跳電', '插座', '漏電', '電線走火', '配電',
      '洗手台', '排水孔', '馬達', '水壓不夠',
      '水電',
    ],
  },
  {
    category: '防水',
    aliases: ['防水', '抓漏', '漏水', '壁癌', '防水工程', '防水漆'],
    symptoms: [
      '壁癌', '牆壁壁癌', '牆壁滲水', '滲水', '漏水',
      '屋頂漏', '陽台漏', '浴室漏', '天花板漏', '窗邊漏',
      '防水', '抓漏', '防水漆',
    ],
  },
  {
    category: '冷氣',
    aliases: ['冷氣', '空調', '冷氣清洗', '冷氣安裝'],
    symptoms: ['冷氣', '冷氣不冷', '冷氣臭', '清洗冷氣', '洗冷氣', '空調', '冷氣漏水'],
  },
  {
    category: '搬家',
    aliases: ['搬家', '搬運', '搬家公司', '清運'],
    symptoms: ['搬家', '搬家公司', '搬運', '搬家具', '搬傢俱'],
  },
  {
    category: '傢俱',
    aliases: ['傢俱', '家具', '二手傢俱', '中古家具'],
    symptoms: ['二手傢俱', '二手家具', '中古傢俱', '中古家具', '傢俱', '家具'],
  },
  {
    category: '油漆',
    aliases: ['油漆', '粉刷', '油漆工程'],
    symptoms: ['油漆', '粉刷', '刷漆', '壁癌油漆'],
  },
  {
    category: '泥作',
    aliases: ['泥作', '泥工', '水泥', '磁磚'],
    symptoms: ['泥作', '泥工', '貼磁磚', '磁磚', '水泥'],
  },
  {
    category: '木作',
    aliases: ['木作', '木工', '系統櫃', '櫥櫃'],
    symptoms: ['木作', '木工', '系統櫃', '櫥櫃', '做櫃子'],
  },
  {
    category: '鐵工',
    aliases: ['鐵工', '鐵件', '焊接'],
    symptoms: ['鐵工', '鐵件', '做鐵門', '焊接'],
  },
  {
    category: '鋁門窗',
    aliases: ['鋁門窗', '窗戶', '紗窗'],
    symptoms: ['鋁門窗', '換窗戶', '紗窗', '窗框'],
  },
  {
    category: '拆除',
    aliases: ['拆除', '打除', '清運', '廢棄物'],
    symptoms: ['拆除', '打除', '打掉', '清運'],
  },
  {
    category: '電梯',
    aliases: ['電梯', '升降機'],
    symptoms: ['電梯', '升降機'],
  },
  {
    category: '排煙管',
    aliases: ['排煙管', '排煙', '煙管'],
    symptoms: ['排煙管', '排煙', '煙管'],
  },
  {
    category: '貼膜',
    aliases: ['貼膜', '隔熱紙', '建築膜'],
    symptoms: ['貼膜', '隔熱紙'],
  },
  {
    category: '清潔',
    aliases: ['清潔', '打掃', '居家清潔'],
    symptoms: ['清潔', '打掃', '居家清潔', '空屋清潔'],
  },
  {
    category: '園藝',
    aliases: ['園藝', '除草', '景觀'],
    symptoms: ['園藝', '除草', '剪樹', '景觀'],
  },
  {
    category: '消防',
    aliases: ['消防', '消防設備'],
    symptoms: ['消防', '滅火器', '灑水'],
  },
];

const CITIES = [
  '台北', '臺北', '新北', '桃園', '台中', '臺中', '台南', '臺南', '高雄',
  '基隆', '新竹', '嘉義', '宜蘭', '花蓮', '台東', '臺東', '澎湖', '金門',
  '苗栗', '彰化', '南投', '雲林', '屏東',
];

const DISTRICTS = [
  '前金', '左營', '三民', '苓雅', '新興', '前鎮', '小港', '鼓山', '鹽埕',
  '楠梓', '鳳山', '仁武', '大寮', '林園', '岡山', '橋頭', '燕巢', '路竹',
  '旗山', '美濃', '中壢', '桃園區', '板橋', '信義', '大安', '中山', '松山',
  '西屯', '北屯', '南屯', '東區', '西區', '北區', '南區',
];

const ASK_HINT = /有人|認識|推薦|廠商|師傅|誰會|想做|可以問|有沒有人|求推薦|介紹一下|會做|能做|包商|施工|拍謝問|請問|我想找|找一個|幫我找|拜託|求一個/;

const NUDGE = /已讀(要回|不回|沒回|啊|喔)?|回一下|有在嗎|機器人(回|呢)|快回|回我一下|有回嗎/;

export function cleanAskField(value: string | null | undefined): string | null {
  const t = value?.trim() ?? '';
  if (!t) return null;
  if (/^(null|undefined|none|n\/a|無|沒有|未知)$/i.test(t)) return null;
  return t;
}

/** Scribe 常把國語聽成簡體。比對前先轉回台灣用字。 */
const SIMP_TO_TRAD: Record<string, string> = {
  电: '電', 没: '沒', 帮: '幫', 谢: '謝', 马: '馬', 墙: '牆', 荐: '薦',
  这: '這', 个: '個', 吗: '嗎', 请: '請', 问: '問', 东: '東', 湾: '灣',
  门: '門', 气: '氣', 脏: '髒', 迁: '遷', 柜: '櫃', 厂: '廠', 业: '業',
  师: '師', 会: '會', 说: '說', 来: '來', 时: '時', 间: '間', 后: '後',
  里: '裡', 边: '邊', 为: '為', 与: '與', 从: '從', 开: '開', 关: '關',
  头: '頭', 长: '長', 车: '車', 钱: '錢', 话: '話', 语: '語', 听: '聽',
  见: '見', 让: '讓', 给: '給', 买: '買', 卖: '賣', 热: '熱', 风: '風',
  扫: '掃', 干: '乾', 湿: '濕', 渗: '滲', 装: '裝', 处: '處', 过: '過',
  对: '對', 还: '還', 现: '現', 发: '發', 传: '傳', 闻: '聞', 铁: '鐵',
  铝: '鋁', 砖: '磚', 涂: '塗', 栋: '棟', 楼: '樓', 卫: '衛',
  厕: '廁', 厨: '廚', 阳: '陽', 区: '區', 县: '縣', 广: '廣',
  谁: '誰', 么: '麼', 们: '們', 号: '號', 点: '點', 钟: '鐘',
  块: '塊', 报: '報', 价: '價', 户: '戶', 实: '實', 际: '際',
  认: '認', 识: '識', 绍: '紹',
};

export function toTaiwanText(text: string): string {
  return [...text].map((ch) => SIMP_TO_TRAD[ch] ?? ch).join('');
}

export function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function extractRegion(text: string): string | null {
  const t = toTaiwanText(text).replace(/\s+/g, '');
  const named = [...DISTRICTS, ...CITIES]
    .sort((a, b) => b.length - a.length)
    .find((name) => t.includes(name));
  if (!named) return null;
  if (CITIES.includes(named)) return named.replace('臺', '台');
  if (t.includes('高雄')) return `高雄${named}`;
  return named;
}

export function looksLikeNudge(text: string): boolean {
  return NUDGE.test(toTaiwanText(text).replace(/\s+/g, ''));
}

export function inferTradesFromText(text: string): InferredTrades {
  const t = toTaiwanText(text).replace(/\s+/g, '');
  const region = extractRegion(t);
  const matched: TradeDef[] = [];
  for (const trade of NETWORK_TRADES) {
    const hits = [...trade.symptoms, ...trade.aliases]
      .sort((a, b) => b.length - a.length)
      .some((token) => token.length >= 2 && t.includes(token));
    if (hits) matched.push(trade);
  }
  if (!matched.length) {
    return { category: null, aliases: [], region, summary: null, trades: [] };
  }
  const trades = uniqueStrings(matched.map((item) => item.category));
  const category = trades.join('／');
  const aliases = uniqueStrings(matched.flatMap((item) => [item.category, ...item.aliases]));
  const summary = region ? `${region}${category}` : category;
  return { category, aliases, region, summary, trades };
}

export function hasTradeSymptom(text: string): boolean {
  return inferTradesFromText(text).trades.length > 0;
}

export function looksLikeVendorAsk(text: string): boolean {
  const t = toTaiwanText(text).replace(/\s+/g, '');
  if (t.length < 2 || t.length > 400) return false;
  if (looksLikeNudge(t)) return false;
  if (hasTradeSymptom(t)) return true;
  if (t.length < 3) return false;
  if (ASK_HINT.test(t)) return true;
  if (/(的人|誰會|找人|有人做|幫我找|拜託推薦)/.test(t)) return true;
  return /[嗎呢？?]/.test(t) && /(做|修|裝|清|抓漏|防水|冷氣|電梯|排煙|貼膜|搬)/.test(t);
}

export function expandSearchTerms(category: string | null | undefined, extra: string[] = []): string[] {
  const parts = (category ?? '').split(/[／/\s、,，]+/).map((item) => item.trim()).filter(Boolean);
  const out: string[] = [...extra];
  for (const part of parts) {
    out.push(part);
    const trade = NETWORK_TRADES.find((item) =>
      item.category === part
      || item.aliases.includes(part)
      || item.symptoms.includes(part),
    );
    if (trade) out.push(trade.category, ...trade.aliases);
  }
  return uniqueStrings(out.map((item) => cleanAskField(item) ?? '').filter(Boolean));
}

export function pickAckText(kind: 'ask' | 'nudge' | 'audio'): string {
  if (kind === 'nudge') return '在的在的，上一則我再對一次，請再等我一下～';
  if (kind === 'audio') return '收到語音，GO小助手先聽一遍再幫你找，請稍等～';
  const asks = [
    '收到，我正在對人脈庫，請耐心等一下～',
    '在！我先查名單，馬上回你。',
    '好，我處理資料中，請稍等一下。',
  ];
  return asks[Math.floor(Date.now() / 1000) % asks.length] ?? asks[0];
}
