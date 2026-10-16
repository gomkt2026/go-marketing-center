/** 修繕工程聯盟已拍攝的工班。內容只整理自訪談成片，不補訪談沒講的縣市或報價。 */
export interface AllianceCrew {
  slug: string;
  name: string;
  person: string;
  trade: string;
  /** 訪談有講到的服務範圍。沒講就留空。 */
  area: string;
  hook: string;
  youtubeId: string;
  services: string[];
  story: string[];
}

export const ALLIANCE_CREWS: AllianceCrew[] = [
  {
    slug: 'hao',
    name: '居家好朋友',
    person: '豪哥',
    trade: '冷氣、洗衣機、電熱水器',
    area: '嘉義以南到屏東',
    hook: '17 年的洗衣機被我拆壞了',
    youtubeId: 'CLfkAZpSBIA',
    services: [
      '分離式冷氣清洗',
      '水塔清洗',
      '洗衣機清洗',
      '電熱水器安裝、維修、保養',
      '簡單室內修繕',
      '居家病媒防治',
    ],
    story: [
      '豪哥是退伍軍人，自己開了居家好朋友工作室。鏡頭裡他講過：客人堅持要洗一台 17 年的洗衣機，拆洗前已經說明可能會壞，軸承還是拔壞了，最後客人自己承擔。',
      '另一個案子在學校。冷氣裝完之後，機器和牆的空隙小到手掌伸不進去，連拆都拆不了。',
      '他加入聯盟是想拿到資源、和其他工班互助，也想多接一些案子，之後把清洗和居家修繕收成一組工班。',
    ],
  },
  {
    slug: 'shanqi',
    name: '珊琦水電',
    person: '珊琦姐',
    trade: '女性居家水電',
    area: '高雄',
    hook: '漏水漏到整屋電路燒掉',
    youtubeId: 'QueQZ03EaYQ',
    services: [
      '更換水龍頭',
      '跳電、電燈',
      '漏水造成的電路問題',
      '浴室與防水（先看現場，大工程再帶水電師傅）',
    ],
    story: [
      '珊琦姐本來在水電公司做業務助理。她看到獨居或帶小孩的女性，小水電案找不到人，也不放心讓陌生男師傅進門，所以自己出來接。',
      '她說自己的優勢是會留在現場，幫業主把事情講清楚。漏水把整屋電路燒掉的案子，她遇過兩三個。',
      '加入聯盟之後，她認識不同工種的工班，案子也可以互相轉。目前仍以水電、浴室、防水，以及女性居家修繕為主。',
    ],
  },
  {
    slug: 'deco',
    name: '雨桐設計',
    person: '雅茹',
    trade: '室內設計業務',
    area: '',
    hook: '設計圖被退了 6 次以上',
    youtubeId: 'm9Z_AtXEQWc',
    services: [
      '設計業務開發',
      '把反覆被退的圖收成一張可往下走的設計圖',
      '往歐洲軟裝、讓空間好住的方向',
    ],
    story: [
      '雅茹在雨桐設計負責業務開發。她講過一個業主：設計圖被退了 5 次、6 次以上。最後是她把 5 張圖收成 1 張，圖才留在他們身上。',
      '她覺得聯盟有用的地方，是工班碰到棘手或很專門的案子時，可以互相支援，不是只有自己認識的那幾個人。',
      '訪談裡她沒有講服務縣市。想找設計，直接留言，由她本人回能不能接。',
    ],
  },
  {
    slug: 'bedding',
    name: '雅玥生活美學',
    person: '芝瑜',
    trade: '台灣自有工廠寢具',
    area: '',
    hook: '床包寫天絲，先翻成分',
    youtubeId: 'kbHkKtGI00Q',
    services: [
      '床包、枕頭、棉被',
      '兒童寢具',
      '毛孩床包',
      '台灣工廠自己生產',
    ],
    story: [
      '芝瑜是寢具老闆娘，工廠在台灣，床包、枕頭、棉被、兒童寢具和毛孩床包都自己做。',
      '她在鏡頭裡教人：床包寫「天絲」先翻成分。有的成分裡天絲只有一半，標語看起來卻像整件都是。',
      '訪談沒有講門市縣市。想問料、成分或哪一款適合，留言給她。',
    ],
  },
  {
    slug: 'clean',
    name: '祝福清潔',
    person: '慈慧姐',
    trade: '居家清潔、收納、清運',
    area: '',
    hook: '整理完，房子賣得更好',
    youtubeId: 'UG9rpnOZO2o',
    services: [
      '居家清潔',
      '整體收納',
      '除塵蟎',
      '清運清潔',
    ],
    story: [
      '慈慧姐是祝福清潔的負責人。服務從居家清潔做起，現在也做整體收納、除塵蟎和清運清潔。',
      '短片講的是一個整理案：屋主先花一筆費用把東西清運、清潔、收好，房子後來賣得更好。那是她講過的個案，不是每間房子都會同樣結果。',
      '訪談沒有講固定服務縣市。交屋清潔、退租清運或收納，留言寫縣市和屋況，由她回能不能排。',
    ],
  },
];

export function crewBySlug(slug: string | undefined): AllianceCrew | undefined {
  return ALLIANCE_CREWS.find((crew) => crew.slug === slug);
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/shorts/${id}`;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export function youtubePosterUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/oardefault.jpg`;
}

export function youtubePosterFallback(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
