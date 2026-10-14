/** 外地簡報用的簡報庫。投影片來自 2026/10/12 修繕聯盟簡報，講稿沿用該檔備註。 */

export type BriefingBrand = 'taskgo' | 'homigo' | 'washgo';

export interface BriefingVideo {
  src: string;
  label: string;
  /** 直式畫面，播放時左右留空 */
  vertical?: boolean;
}

export interface BriefingSlide {
  title: string;
  notes: string;
  video?: BriefingVideo;
}

export interface BriefingSection {
  label: string;
  /** 1-based 起始頁 */
  at: number;
}

export interface BriefingDeck {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  audience: string;
  updated: string;
  brands: BriefingBrand[];
  sections: BriefingSection[];
  slides: BriefingSlide[];
}

export interface BriefingFilm {
  slug: string;
  title: string;
  summary: string;
  src: string;
  poster: string;
  duration: string;
  brands: BriefingBrand[];
  /** 什麼時候播 */
  cue: string;
}

export const BRAND_LABEL: Record<BriefingBrand, string> = {
  taskgo: 'TaskGo',
  homigo: 'Homigo',
  washgo: 'Washgo',
};

export function slideImage(slug: string, index: number): string {
  return `/briefings/${slug}/slides/s-${String(index + 1).padStart(2, '0')}.jpg`;
}

const ALLIANCE: BriefingDeck = {
  slug: 'alliance-1012',
  title: '修繕聯盟夥伴說明',
  kicker: 'TaskGo × Homigo × Washgo',
  summary: '案源從 Homigo 報修進來，TaskGo 派工把案子管完。三品牌怎麼串、媒體怎麼報、加入聯盟拿到什麼，都在這一份。',
  audience: '21克拉工程聯盟、修繕廠商',
  updated: '2026/10/12',
  brands: ['taskgo', 'homigo', 'washgo'],
  sections: [
    { label: '開場', at: 1 },
    { label: '三品牌', at: 4 },
    { label: '案源', at: 15 },
    { label: '管案', at: 19 },
    { label: '加入', at: 27 },
  ],
  slides: [
    {
      title: '案源送上門，案子管得清楚',
      notes: '開場：今天是說明加入修繕聯盟後，案子從哪來、怎麼派、怎麼回報、怎麼請款。\n日期、場地、主講人職稱若有更新，開場時口頭補上。',
    },
    {
      title: '你是不是也這樣',
      notes: '先讓台下點頭：案源不穩、資料散在 LINE、進度靠記憶、請款對不齊。這四件事工班都遇過。\n可以問誰在群組翻過三個月前的照片。若有聯盟成員的原話，用原話，不要自己編。',
    },
    {
      title: '修繕聯盟生態圈',
      notes: '一句話：Homigo 產生報修需求，TaskGo 完成派工施工，聯盟廠商把案子做好。\n成員家數若被問到，只講已經確認的數字。',
    },
    {
      title: 'PART 1｜三個產業入口',
      notes: '轉場。接下來講匠管是誰：TaskGo、Homigo、Washgo 三個入口，以及跟修繕廠商的關係。',
    },
    {
      title: '生活工程管理生態系',
      notes: '匠管過去一年從三個場景推出三個產品：TaskGo 修繕與工程、Homigo 租屋與居住、Washgo 洗衣與乾洗。對外說法是「工作、居住、生活」。\n路徑是先讓人願意用，累積真實資料，再用 AI 提升效率。\n三個產品目前仍各自服務不同產業。不要說已經完全融合。',
    },
    {
      title: '三品牌怎麼串',
      notes: '現在做得到的：Homigo 與 TaskGo 報修串接；匠城呈現用在 TaskGo 結案與 Washgo 洗滌追蹤；GoCoin 跨品牌點數。\nGoCoin 若現場還不能在 TaskGo、Homigo 使用，口頭只講 Washgo。\n報導裡的下一步只能說「規劃、逐步」，不要承諾時程。\n不要說 Washgo 已經會派修繕案件給聯盟廠商。目前沒有這個方向。',
    },
    {
      title: '修繕單轉成洗滌訂單',
      notes: '方向是修繕轉洗滌。客人從 TaskGo 公開報修選「洗滌服務」，進 Washgo「我要送洗」，本單 95 折。\nWashgo 後台：開放轉介紹、客人 95 折、介紹廠商佣金 8%。TaskGo 接單設定裡，天晴清潔、洗楽各 3%，各有專屬連結。\n畫面是示範環境。洗楽、天晴清潔、Fixercowork、淇揚企業社是示範資料。\nTaskGo 畫面是阿豪，Washgo 畫面是阿樂。',
    },
    {
      title: '客人選品牌、我要送洗',
      notes: '接上一頁。客人選「洗楽專業洗衣」，95 折、到府收送，Washgo 會帶入 TaskGo 轉介紹。\n不要把示範店名講成已簽約的聯盟洗衣廠。',
    },
    {
      title: '操作示範',
      notes: '先講一句再按播放。影片約 2 分鐘，TaskGo 由阿豪說明，Washgo 由阿樂說明。\n不要說 Washgo 會把修繕案派給聯盟廠商。',
      video: {
        src: '/briefings/alliance-1012/washgo.mp4',
        label: '播放 TaskGo × Washgo 操作示範',
      },
    },
    {
      title: '媒體報導',
      notes: '三篇都在經濟日報「商情／熱門亮點」，記者鄭芝珊。\nTaskGo 2025/10/20、Homigo 2026/07/01、Washgo 2026/09/16。可說「經濟日報報導過」。不要說「各大媒體專訪」，轉載不要算成多次報導。\nTaskGo 報導裡的「一個月免費試用」是 2025 年當時方案。現在官網是 14 天免費試用。',
    },
    {
      title: '報導裡的原話',
      notes: '引言都出自經濟日報原文。創辦人姓名若要正式書寫，以公司登記為準。\n「300 萬租屋人口」一定要帶「根據市場統計」，這是報導原句。\n收尾：報導講的是方向，聯盟要做的是把它落到每一張修繕單上。',
    },
    {
      title: 'Go 行銷中心',
      notes: '三個品牌的社群都在這個 AI 行銷中心跑。AI 協助產出，人審過才發布。\n2026/10/02 快照：發布任務 TaskGo 231、Homigo 218、Washgo 381；市場情報合計 1,063 則；Podcast 12 集。\n對工班：可以講「Go 幫你發文」，每週 2 則、999 元／月。施工照片與結案報告就是素材。\n聯盟是否有專屬優惠，還沒定，不要現場承諾。QR 連到 Go 幫你發文頁。',
    },
    {
      title: 'TaskGo 媒體與社群成績單',
      notes: '數字是行銷中心 2026/10/12 的 TaskGo 資料。已發布 316：Threads 248、Instagram 41、Facebook 24、官網長文 3。\n曝光 257,870、留言 316、分享 250 只統計 Threads。FB、IG 目前沒有回收曝光。\n10/7 那則 Threads 單篇 131,560 曝光，大約占一半。這是爆文，不要說成平均。\n已見報才算確認過的原始報導；轉載不重複計算。待確認的 5 則還沒核准，不要拿來報成績。\n工商時報 2026/07/11 有工程聯盟活動報導，點名 TaskGo 補工程履歷與施工透明化。',
    },
    {
      title: '匠城出任務',
      notes: '遊戲是把人帶進平台的入口。數據截至 2026/10/02，與官網遊戲區一致：7 天、不重複玩家 1,125、遊玩 2,004 局、完整跑完 1,596 局。\n9/30 改版後兩天就有 1,648 局，同期推廣貼文 Threads 大約 1,100 次曝光，人潮主要來自分享。\n約 3,000 人次、月化 15,000 是估算，會受改版與活動影響。等值廣告費只口頭參考，不要寫成已發生的收入。\n遊戲內還沒有聯盟廠商看板，不要說已經能買廣告。101 支手機是排行榜留的，不能拿來當廣告名單。',
    },
    {
      title: 'PART 2｜案源從哪裡來',
      notes: '轉場。接下來講 Homigo 報修怎麼變成廠商的工單。',
    },
    {
      title: '三個入口，案子自己送上門',
      notes: '案源有兩條：Homigo 的房東、代管、房客報修，以及廠商自己的客戶用 TaskGo 管。\nHomigo 報修分租屋修繕（房東負責的設備）和生活修繕（房客自費）。\n物件數、每月報修件數、派工規則若被問到，只講已經定案的。還沒定的規則不要現場發明。',
    },
    {
      title: '一張報修單走到請款',
      notes: '這頁是整份簡報的骨架。資料只建一次，房東、房客、廠商、後勤看同一個案號。\nTaskGo 會把階段回傳 Homigo，報修管理頁看得到進度與財務狀態。',
    },
    {
      title: '房東看得到進度',
      notes: '截圖是 2026/08/25 的 Homigo 房東畫面，地址已模糊。\n對廠商：房東自己看得到進度與金額，少接電話，也少「你沒說要收錢」的爭執。\n若要對外長期播放，之後換成示範帳號。',
    },
    {
      title: 'PART 3｜案子怎麼管',
      notes: '轉場。施工連結、照片、進度、報價、結案，全部留紀錄。',
    },
    {
      title: '一個連結，師傅打開就能做',
      notes: '現場可以拿手機開一個場勘連結，30 秒走完。會用 LINE 就會用，不用另裝 App。\n畫面是 SOP 教學的示範資料。',
    },
    {
      title: '施工前、中、後',
      notes: '三段照片缺一不能送。這是廠商自己的保護：事後說「本來就壞了」「你沒做」，照片在。\n這些照片會進結案報告。',
    },
    {
      title: '施工照片與結案畫面',
      notes: '左邊是案件流程與前中後照片，中間是結案工序，右側直式影片是匠城呈現，約 37 秒。按播放。\n畫面是寬寬測試的示範案。地址與人名不要講成某一家聯盟廠商的真實案件。',
      video: {
        src: '/briefings/alliance-1012/jiangcheng.mp4',
        label: '播放匠城結案呈現',
        vertical: true,
      },
    },
    {
      title: '後台看每案做到哪',
      notes: '狀態由現場回報推進，不是靠人改白板。\nTaskGo 還有儀表板、派工行事曆、每日報告、改善任務、專案地圖。接案後幾小時要聯繫，這條服務標準還沒對外定版，不要承諾時數。',
    },
    {
      title: '報價與簽名',
      notes: '場勘完成，報價草稿帶出來。報價、派工、簽名都在系統。\n聯盟案件誰報價、有沒有抽成、誰收款、誰開發票，還沒定。被問到就說會依聯盟確認的規則，不要現場給比例。',
    },
    {
      title: '做完就變成作品集',
      notes: '結案報告由 TaskGo 產生，回傳 Homigo，房東在報修詳情打開，免登入。\n匠城呈現可以把工序與現場照片走一遍，用 LINE 傳給房東。下一頁就是這段畫面的影片，若上一頁已播過，這裡口頭收即可。',
    },
    {
      title: '客戶評分，廠商也評工班',
      notes: '案子完成後客戶評分，派工廠商也對工班評完成度、速度、服務。\n這是系統畫面。不要把畫面上的客戶姓名與評價內容講成公開客訴。',
    },
    {
      title: 'PART 4｜加入聯盟拿到什麼',
      notes: '轉場。收斂到案源、工具、信任、收款。',
    },
    {
      title: '四個好處',
      notes: '500+ 團隊、派工時間減少 70% 是 TaskGo 官網的客戶案例。14 天免費試用以現行官網為準。不要自行加其他數字。\n聯盟廠商有沒有優惠、Homigo 案件是否只派給聯盟成員，還沒定，不要承諾。',
    },
    {
      title: '五步驟接到第一張案',
      notes: '左邊是依 TaskGo 現有流程整理的建議。右邊還沒由聯盟拍板的項目，被問到就記下來，不要當場填答案。',
    },
    {
      title: 'Q & A',
      notes: '收尾，邀請提問。來信 Service@inforcraft.com.tw，來電 0972-395-117。\n若現場有報名表單，再口頭引導。沒有表單就不要說「現在掃碼報名」。',
    },
  ],
};

export const BRIEFING_DECKS: BriefingDeck[] = [ALLIANCE];

export const BRIEFING_FILMS: BriefingFilm[] = [
  {
    slug: 'taskgo-washgo',
    title: 'TaskGo 轉 Washgo',
    summary: '客人從報修選洗滌服務，進 Washgo 我要送洗，本單 95 折。阿豪講 TaskGo，阿樂講 Washgo。',
    src: '/briefings/alliance-1012/washgo.mp4',
    poster: '/briefings/alliance-1012/washgo-poster.jpg',
    duration: '1 分 57 秒',
    brands: ['taskgo', 'washgo'],
    cue: '簡報第 9 頁，或單獨播',
  },
  {
    slug: 'jiangcheng-report',
    title: '匠城結案呈現',
    summary: '直式結案畫面。把真實施工收成可傳給房東的專案報告，約 37 秒。',
    src: '/briefings/alliance-1012/jiangcheng.mp4',
    poster: '/briefings/alliance-1012/jiangcheng-poster.jpg',
    duration: '37 秒',
    brands: ['taskgo', 'homigo', 'washgo'],
    cue: '簡報第 22 頁，或講到結案時播',
  },
  {
    slug: 'online-repair',
    title: '線上報修，建立場勘',
    summary: '後勤從公開報修進來，在修繕管理複製場勘連結。問到案子怎麼進系統時播。',
    src: '/briefings/films/online-repair.mp4',
    poster: '/briefings/films/online-repair.jpg',
    duration: '2 分 24 秒',
    brands: ['taskgo'],
    cue: '問到後勤怎麼建案時播',
  },
  {
    slug: 'mobile-survey',
    title: '手機場勘回報',
    summary: '工班打開連結，填漏水現況、工法與照片，送出完成回報。給師傅看這支。',
    src: '/briefings/films/mobile-survey.mp4',
    poster: '/briefings/films/mobile-survey.jpg',
    duration: '1 分 38 秒',
    brands: ['taskgo'],
    cue: '問到師傅手機會不會用時播',
  },
  {
    slug: 'survey-quote',
    title: '場勘帶入報價',
    summary: '場勘完成後，後台把回報帶成報價草稿，再傳送給業主簽名。',
    src: '/briefings/films/survey-quote.mp4',
    poster: '/briefings/films/survey-quote.jpg',
    duration: '1 分',
    brands: ['taskgo'],
    cue: '問到報價怎麼出來時播',
  },
];

export function briefingDeck(slug: string | undefined): BriefingDeck | undefined {
  return BRIEFING_DECKS.find((deck) => deck.slug === slug);
}

export function briefingFilm(slug: string | undefined): BriefingFilm | undefined {
  return BRIEFING_FILMS.find((film) => film.slug === slug);
}

export function sectionSlides(deck: BriefingDeck, sectionIndex: number): { slide: BriefingSlide; at: number }[] {
  const start = deck.sections[sectionIndex].at;
  const end = deck.sections[sectionIndex + 1]?.at ?? deck.slides.length + 1;
  return deck.slides.slice(start - 1, end - 1).map((slide, offset) => ({
    slide,
    at: start + offset,
  }));
}
