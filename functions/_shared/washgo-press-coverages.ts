/** Washgo 2026-09 中部落地見報清單。第三方只存出處／摘要／金句／可宣稱事實，不存全文。 */
export const WASHGO_PRESS_STORY_KEY = 'washgo-2026-09-central-landing';
export const WASHGO_PRESS_HEADLINE = '傳統洗衣店也拚AI數位轉型！匠管Washgo中部落地、開放品牌加入';
export const WASHGO_PRESS_PUBLISHED_ON = '2026-09-15';

const PRIMARY_SUMMARY =
  '匠管旗下 Washgo 已於中部洗滌業者洗楽完成實際場域導入，以 LINE 為入口串聯送洗、報價、品管與收送，並正式開放洗衣、乾洗品牌加入。';
const PRIMARY_QUOTES = [
  '洗楽願意讓Washgo進入真實營運現場，對我們來說非常重要。因為系統到底好不好，不是我們自己說了算，而是現場每天願不願意用。',
  '品牌是你的，數位能力由匠管提供',
  'Taskgo、Homigo、Washgo是我們進入產業的入口，每一個產品先解決一個真實問題，再慢慢把不同場景串起來。',
];
const PRIMARY_FACTS = [
  'Washgo 已於中部洗滌業者洗楽完成實際場域導入',
  '以 LINE 為主要服務入口，消費者免另下載 App',
  '正式開放洗衣、乾洗品牌與門市加入',
  '品牌是你的，數位能力由匠管提供',
  '見報於 Yahoo、經濟日報等；同一則轉載不可算成多次獨立專訪',
];

export const WASHGO_CAN_CLAIM_PRESS = {
  statement: 'Yahoo、經濟日報等媒體曾報導 Washgo 中部落地、開放洗衣乾洗品牌加入',
  conditionNote: '可引用已列媒體名與已見報事實；不可把同一則轉載算成多次獨立專訪；不可宣稱全台專訪或保證導入成效',
};

export interface WashgoPressCoverageSeed {
  outlet: string;
  articleUrl: string | null;
  status: 'published' | 'syndicated';
  isPrimary: boolean;
  summary: string;
  keyQuotes: string[];
  claimableFacts: string[];
}

export const WASHGO_PRESS_COVERAGES: WashgoPressCoverageSeed[] = [
  {
    outlet: '經濟日報',
    articleUrl: null,
    status: 'published',
    isPrimary: true,
    summary: PRIMARY_SUMMARY,
    keyQuotes: PRIMARY_QUOTES,
    claimableFacts: PRIMARY_FACTS,
  },
  {
    outlet: 'Yahoo',
    articleUrl: 'https://tw.news.yahoo.com/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B-%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0-%E9%96%8B%E6%94%BE%E5%93%81%E7%89%8C%E5%8A%A0%E5%85%A5-091737161.html',
    status: 'published',
    isPrimary: true,
    summary: PRIMARY_SUMMARY,
    keyQuotes: PRIMARY_QUOTES,
    claimableFacts: PRIMARY_FACTS,
  },
  { outlet: '臺灣郵報', articleUrl: 'https://taiwanpost.net/2026/life/167962/', status: 'syndicated', isPrimary: false, summary: '臺灣郵報轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '民眾新聞網', articleUrl: 'https://mypeoplevol.com/2026/life/111715', status: 'syndicated', isPrimary: false, summary: '民眾新聞網轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '民聲新聞', articleUrl: 'https://91postnews.com/life/136166', status: 'syndicated', isPrimary: false, summary: '民聲新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '福爾摩沙新聞', articleUrl: 'https://formosalive.com/2026/life/351908', status: 'syndicated', isPrimary: false, summary: '福爾摩沙新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '玉山新聞', articleUrl: 'https://yushanmedia.com/2026/life/153433/', status: 'syndicated', isPrimary: false, summary: '玉山新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '蕃新聞', articleUrl: 'https://n.yam.com/Article/20260915866777', status: 'syndicated', isPrimary: false, summary: '蕃新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: 'PChome 新聞', articleUrl: 'https://news.pchome.com.tw/living/mypeople/20260915/index-78945263708716219009.html', status: 'syndicated', isPrimary: false, summary: 'PChome 新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: 'LIFE生活網', articleUrl: 'https://life.tw/article/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B-%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0-%E9%96%8B%E6%94%BE%E5%93%81-3149739', status: 'syndicated', isPrimary: false, summary: 'LIFE生活網轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: 'yes新聞網', articleUrl: 'https://www.yesmedia.com.tw/%e5%82%b3%e7%b5%b1%e6%b4%97%e8%a1%a3%e5%ba%97%e4%b9%9f%e6%8b%9aai%e6%95%b8%e4%bd%8d%e8%bd%89%e5%9e%8b%ef%bc%81%e5%8c%a0%e7%ae%a1washgo%e4%b8%ad%e9%83%a8%e8%90%bd%e5%9c%b0%e3%80%81%e9%96%8b%e6%94%be/', status: 'syndicated', isPrimary: false, summary: 'yes新聞網轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '中聞社', articleUrl: 'https://chiwannews.com/39612/', status: 'syndicated', isPrimary: false, summary: '中聞社轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '爆了媒', articleUrl: 'https://bowmedia.tw/81326/', status: 'syndicated', isPrimary: false, summary: '爆了媒轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '獨家報導', articleUrl: 'https://www.scooptw.com/taiwanpost/527874/%e5%82%b3%e7%b5%b1%e6%b4%97%e8%a1%a3%e5%ba%97%e4%b9%9f%e6%8b%9aai%e6%95%b8%e4%bd%8d%e8%bd%89%e5%9e%8b%ef%bc%81%e5%8c%a0%e7%ae%a1washgo%e4%b8%ad%e9%83%a8%e8%90%bd%e5%9c%b0%e3%80%81%e9%96%8b%e6%94%be/', status: 'syndicated', isPrimary: false, summary: '獨家報導轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '數智傳媒', articleUrl: 'https://pressunion.net/2026/edit-center/life/494857', status: 'syndicated', isPrimary: false, summary: '數智傳媒轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '奧丁丁', articleUrl: 'https://news.owlting.com/articles/1454907', status: 'syndicated', isPrimary: false, summary: '奧丁丁新聞轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '商傳媒', articleUrl: 'https://sunmedia.tw/news/Industry-information/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9AAI%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B%EF%BC%81%E5%8C%A0%E7%AE%A1Washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0%E3%80%81%E9%96%8B%E6%94%BE%E5%93%81%E7%89%8C%E5%8A%A0%E5%85%A5-1789457185940', status: 'syndicated', isPrimary: false, summary: '商傳媒轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '火報', articleUrl: 'https://firenews.com.tw/2026/09/15/%E5%82%B3%E7%B5%B1%E6%B4%97%E8%A1%A3%E5%BA%97%E4%B9%9F%E6%8B%9Aai%E6%95%B8%E4%BD%8D%E8%BD%89%E5%9E%8B%EF%BC%81%E5%8C%A0%E7%AE%A1washgo%E4%B8%AD%E9%83%A8%E8%90%BD%E5%9C%B0%E3%80%81%E9%96%8B%E6%94%BE/', status: 'syndicated', isPrimary: false, summary: '火報轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
  { outlet: '台灣電報', articleUrl: 'https://enn.tw/779363/', status: 'syndicated', isPrimary: false, summary: '台灣電報轉載同一則 Washgo 中部落地稿。', keyQuotes: [], claimableFacts: [] },
];
