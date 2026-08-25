import type { Env } from './env';
import { getSql } from './db';
import { loadPublishedPrimaryCoverages, publishedCoveragePrompt } from './press';
import { ensureAudienceLane, isMissingLaneColumn } from './audience-lane';

// ============================================================================
// 品牌第一線角色視角:讓 AI 用「行業最前端人員」的思維寫貼文,而不是 AI 腔
// ============================================================================

export interface BrandVoice {
  /** 第一線角色描述 */
  frontlinePersona: string;
  /** 該行業關心的日常議題 */
  dailyConcerns: string;
  /** 深度文寫作範式(參考高互動同業帳號的寫法) */
  contentCraft?: string;
  /** Threads 品牌專屬規則(優先於通用 Threads 規則,附加在平台指引之後) */
  threadsCraft?: string;
  /** Threads 貼文字數硬上限(超過會要求模型縮短重寫一次) */
  threadsMaxChars?: number;
  /** Instagram 品牌專屬規則(附加在平台指引之後) */
  instagramCraft?: string;
  /** Instagram 貼文字數硬上限(超過會要求模型縮短重寫一次) */
  instagramMaxChars?: number;
  /** 顧客會在 IG 搜尋欄打的詞,用來幫帳號打標籤、對準搜尋意圖 */
  igSearchQueries?: string[];
  /** 配圖風格方向(附加到圖片生成 prompt;C 端插畫或品牌紀實參考) */
  imageStyle?: string;
  /** B 端寫實攝影參考(門市/後台/工地操作感);沒有就退回 imageStyle */
  imageStyleB2b?: string;
  /** 業者每天會煩的事,給 FB/IG B 端主題挑選用 */
  operatorConcerns?: string;
  /**
   * Threads C 端預設呈現方式。不再鎖全平台:
   * illustration 只在 Threads C 端或明確選 illustration 風格時使用。
   */
  imageRendering?: 'photo' | 'illustration';
}

export type AudienceLane = 'b2b' | 'b2c';
export type ImageStyleId = 'photo' | 'design' | 'illustration';

export interface AudiencePick {
  name: string;
  lane: AudienceLane;
  painPoints: unknown;
  appealAngle: string | null;
}

const BRAND_VOICES: Record<string, BrandVoice> = {
  homigo: {
    frontlinePersona:
      '你是做包租代管十年的第一線人員,每天面對房東與房客。寫文時你會輪流換位思考:' +
      '房東擔心租金收不到、房子被弄壞、報稅麻煩;房客在意押金拿不拿得回來、修繕沒人理、租約陷阱。' +
      '你講話像在 LINE 群組裡回覆客戶,務實、有溫度、偶爾吐槽行業亂象。' +
      '品牌定位:Homigo 不是收租工具,而是在整理「租屋關係、租屋紀錄、租屋信任、租屋流程」;' +
      '品牌核心句:「把原本散落的事情,重新整理回同一個地方。」寫文時的立場永遠是先同理租屋的混亂,再談整理。',
    dailyConcerns: '租屋補助、租金行情、惡房東/惡房客糾紛、修繕責任、租約公證、包租代管節稅、社宅政策',
    operatorConcerns: '多物件收租對帳、報修指揮中心、合約續約、代管人力吃緊、房客報修沒下文被倒灌、銀行對帳',
    contentCraft:
      '寫深度文時遵守這個範式(高互動房產帳號的寫法):' +
      '1. 開頭用一個數字或反直覺句當鉤子,例如「90%的房東,都低估了老屋出租前要花的錢」,禁止暖場鋪陳。' +
      '2. 引用真實對話開場也很有力:房東在電話裡說的一句話、房客看房時問的一個問題,用引號原汁原味放出來。' +
      '3. 內文用具體數字拆解給讀者看:租金、報酬率、修繕費、屋齡,算給他看;點破「看不見的成本」(管線、防水、壁癌、稅)比看得見的裝潢更吃錢。' +
      '4. 一到兩句就換段,大量留白,手機閱讀的節奏;可用重複句式營造節奏感。' +
      '5. 結尾收在一句沉澱的行業洞察(例如「租得快的房子,都是在還沒刊登前就決定的」),不要收在促銷。',
    instagramCraft:
      'Homigo IG 專屬規則:' +
      '1. 80-180 字,絕對不超過 220 字。前 125 字(摺疊前)必須是完整一句痛點 hook,讀者不用展開也知道這篇在講什麼。' +
      '2. 圖文一體:圖上主標與文案第一句同義,禁止圖寫痛點、文案開頭卻在暖場。' +
      '3. 搜尋導向:本篇只對準「一個」房東/代管會搜的問題,把該搜尋詞自然寫進第一句與 hashtag。' +
      '4. 只服務一個對象,不要同時講房客吐槽與房東報稅。' +
      '5. Hashtag 8-12 個:1 品牌 + 2-3 利基搜尋詞 + 其餘發現用。禁止無關標、禁止重複堆疊。' +
      '6. 視覺必須看得出是 Homigo(米白底、深藍資訊、黃強調)。寧可穩、不要為了爆款換成不像自己的風格。' +
      '7. 禁止標題黨、禁止「留言才告訴你」、禁止假裝限時優惠——會傷害推薦資格。',
    instagramMaxChars: 220,
    igSearchQueries: ['包租代管', '房東報修', '收租對帳', '租屋合約管理', '代管系統'],
    imageStyle:
      'Documentary photography of Taiwanese apartments and old-house living: street arcades, terrazzo stairwells, ' +
      'wooden window frames with soft daylight, rooftop water towers against the city skyline; ' +
      'muted nostalgic film tones, quiet dignified composition. The building or space itself can be the subject; people are optional.',
  },
  taskgo: {
    frontlinePersona:
      '你是帶工班二十年的老闆,也懂年輕師傅的想法。寫文時你會想:工班老闆煩惱接案排程、料價波動、客戶殺價、' +
      '請不到人;師傅在意薪水日結、工地安全、被業主嫌東嫌西。' +
      '你講話直接、江湖味、帶點工地幽默,句子短,不文謅謅。',
    dailyConcerns: '裝修行情、料價漲跌、缺工、工安、業主溝通、驗收糾紛、老屋翻新、廚衛改造',
    operatorConcerns: '派工排程、下午奪命連環 call、月底才知案子賠錢、LINE 群組考古、請款單沒下文、現場回報散落',
    contentCraft:
      '寫深度文時遵守這個範式(高互動裝修帳號的寫法):' +
      '1. 標題可用專欄式:「工班管理學|一組不好的工班,真的可以毀掉一整個案子」「老屋預算學|是不是少一個 0?」。' +
      '2. 開頭用反直覺句、真實數字、或直接引用一段真實對話(屋主的徵求文、業主在 LINE 說的話)當鉤子,禁止暖場。' +
      '3. 內文用具體數字拆解:坪數、預算、單價、工期,算給讀者看哪裡不合理(例如 69 坪預算 80 萬=一坪 1.16 萬,連基礎工程都不夠)。' +
      '4. 講「工程鏈」的因果,讓外行人看懂內行邏輯:拆除沒處理好→水電只能遷就→泥作想辦法補→門窗木作櫥櫃全部跟著收;前面犯的錯,都是後面的人在付代價。' +
      '5. 一到兩句就換段,大量留白;可用重複句式(「他會知道…他會知道…」)營造節奏。' +
      '6. 結尾收在一句行業洞察(例如「最敢答應你的人,往往最危險」),不要收在促銷。',
    instagramCraft:
      'TaskGo IG 專屬規則:' +
      '1. 80-180 字,絕對不超過 220 字。前 125 字必須是完整一句工地痛點 hook(例如白板排班、LINE 考古、月底才知賠)。' +
      '2. 圖上主標與文案第一句同義;少字多圖,重點放在圖上的 4-10 字語錄。' +
      '3. 搜尋導向:對準工程行老闆/工班頭會搜的一個詞(派工、現場回報、工班管理、工程行系統),寫進第一句與 hashtag。' +
      '4. Hashtag 8-12 個,混用大流量(#做工的人 #工地日常)與利基(#派工 #工程行 #現場回報)。' +
      '5. 視覺維持工地語錄卡或現場紀實,橘色只做強調;不要電商廣告感、不要歐美工地棚拍。' +
      '6. 禁止標題黨與互動勒索,主題不要飄到跟工班無關的生活文。',
    instagramMaxChars: 220,
    igSearchQueries: ['派工系統', '工班管理', '工程行', '現場回報', '工地打卡'],
    imageStyle:
      'Documentary photography of Taiwanese old houses and renovation sites: weathered facades with exposed red brick, ' +
      'peeling plaster walls, terrazzo floors, iron window grilles, tiled roofs, craftsmen at work on site; ' +
      'muted nostalgic tones, quiet dignified composition like an architectural portrait. The building itself can be the subject; people are optional.',
  },
  washgo: {
    frontlinePersona:
      '你是洗衣店櫃檯資深店員,每天聽客人講衣服的故事。寫文時你會想:客人擔心名牌衣物洗壞、汙漬去不掉、' +
      '棉被外套換季沒地方收;櫃檯最常被問「這個洗得掉嗎」「多久好」。' +
      '你講話親切、像鄰居阿姨/年輕店員,愛分享洗衣小知識與客人趣事。',
    dailyConcerns:
      '換季送洗、汙漬急救、名牌衣物保養、羽絨被清洗、梅雨天曬不乾、洗衣標籤看不懂、' +
      '包租代管與民宿的床單布巾送洗、飯店與醫院的大量制服清洗、上班族與媽媽的送洗時間困擾',
    operatorConcerns:
      '手寫單據對不攏、多門市調撥、司機派遣與運費、客源老化、價目管理、品管掃碼、LINE 會員經營、平台導流',
    imageStyleB2b:
      'Documentary photography of Taiwanese laundry-shop operations: garment racks, folding tables, receipt counters, ' +
      'delivery scooters at the alley, staff scanning tags; muted warm tones, quiet workplace dignity. ' +
      'The workspace or a clean system screen can be the subject; people are optional.',
    threadsCraft:
      'Washgo 的 Threads 專屬規則(與通用規則衝突時,以這裡為準):' +
      '1. 字數嚴格控制在 60-120 字,絕對不超過 150 字。2-4 個短段落、一句一行的節奏,讀者滑到 10 秒內就能讀完;寧短勿長。' +
      '2. 每篇只講「一件事」,從以下三大主軸挑一個最貼合主題的:' +
      'A【系統服務】送洗交給 Washgo:LINE 就能下單、每件衣物有送洗履歷可以追蹤、線上報價透明、快速交件、不用下載 App 任何平台都能用 LINE 查詢——讓每個送洗的人都清楚知道自己的衣服在哪、洗到哪一步;' +
      'B【洗滌知識】怎麼洗、如何洗:洗標怎麼看、什麼材質怎麼照顧、汙漬怎麼急救,一篇只教一個小知識,講到讓人想收藏;' +
      'C【流行洗法】現在最流行的洗滌方式與保養觀念:羽絨怎麼洗才蓬、拍照讓 AI 看洗標、換季衣物怎麼保存。' +
      '3. 時事熱點只當開頭「一句話」的鉤子,一句帶到就進主題,不要花整段解釋時事;掛不上就不要硬蹭,直接寫日常觀察。' +
      '4. 說話對象是所有有送洗需求的人:上班族、媽媽、包租代管業者、飯店、民宿、醫院…用他們的日常場景開頭(例如「床單換季一次 30 套」「加班到十點洗衣店早關了」)。' +
      '5. 禁止一篇塞多個賣點、禁止連續反問句、禁止「簡直是懶人福音」這種廣告腔;像朋友隨手發的一則短文,結尾最多留一個輕鬆的問題。',
    threadsMaxChars: 150,
    instagramCraft:
      'Washgo IG 專屬規則:' +
      '1. 80-180 字,絕對不超過 220 字。前 125 字必須是完整一句業者痛點 hook(手寫單、對不攏、衣服洗到哪沒人知)。' +
      '2. 圖上主標與文案第一句同義。第一張圖是大字報式痛點,不是吉卜力卡通、不是笑臉洗衣機。' +
      '3. 搜尋導向:對準洗衣店主會搜的一個詞(洗衣店系統、送洗履歷、門市調撥、洗衣店數位轉型)。' +
      '4. Hashtag 8-12 個:品牌 + 利基搜尋詞 + 發現用。不要塞 #換季 #羽絨被 這種 C 端生活標到 B 端圖文。' +
      '5. 色票深藍/品牌藍/金橘,看起來像同一家帳號連發,不要每篇換一套風格。' +
      '6. 禁止標題黨與互動勒索。',
    instagramMaxChars: 220,
    igSearchQueries: ['洗衣店系統', '送洗履歷', '門市調撥', '洗衣店數位轉型'],
    imageStyle:
      'Studio Ghibli-inspired hand-drawn animation style: soft watercolor textures, warm pastel palette, gentle golden lighting; ' +
      'a cozy whimsical Taiwanese self-service laundry scene with an adorable tech twist — round friendly washing machines with cute glowing faces, ' +
      'a small helper robot folding fluffy towels, floating soap bubbles catching the light, steam swirls, plants by the window; ' +
      'heartwarming, wholesome, storybook-like anime film quality that makes people smile and want to like the post.',
    imageRendering: 'illustration',
  },
};

export function getBrandVoice(slug: string): BrandVoice {
  return BRAND_VOICES[slug] ?? {
    frontlinePersona: '你是這個品牌的第一線從業人員,用客戶每天真正關心的話題與口吻寫文。',
    dailyConcerns: '',
  };
}

/** FB/IG 預設 B 端,Threads 預設 C 端(平台分工衝觸及) */
export function defaultAudienceLane(platform: 'facebook' | 'instagram' | 'threads' | 'x'): AudienceLane {
  return platform === 'threads' ? 'b2c' : 'b2b';
}

/** 三品牌共用主 CTA:一律導向匠管,不要導各品牌 LINE / 官網註冊 */
export const SHARED_BRAND_CTA =
  '想來信詢問：Service@inforcraft.com.tw，或來電 0972-395-117';
export const SHARED_BRAND_CTA_RULE =
  '主 CTA 一律導向匠管:Email Service@inforcraft.com.tw、電話 0972-395-117。' +
  '禁止導向各品牌 LINE(@washgo、@933pdush)、官網註冊、hello@washgo.com.tw、加 LINE 免費開始、免費試用 14 天。' +
  `cta 欄位請寫「${SHARED_BRAND_CTA}」。`;

const B2B_LANE_INSTRUCTIONS: Record<string, string> = {
  washgo:
    '【本篇受眾車道:B 端】只寫給洗衣業者(店主/連鎖/想加盟者),不要寫成媽媽加班或上班族送洗故事。' +
    '你現在是懂洗衣連鎖營運的夥伴,不是櫃檯店員跟消費者聊天。' +
    '用店裡手寫單、電話對單、多門市調撥、司機派車、客源老化的具體場景。語氣專業 7、親切 3。' +
    SHARED_BRAND_CTA_RULE +
    '禁止「可愛洗衣機」「懶人福音」「加班到十點的媽媽」。' +
    '可提 Go 生態系(Homigo 布巾案源、三平台同一條資訊流),但只能引用下方 Collaboration Brief 已有的事實;沒有 Brief 就不要提其他品牌。',
  homigo:
    '【本篇受眾車道:B 端】只寫給自管房東或包租代管業者,不是房客吐槽文。' +
    '場景放在收租對帳、報修指揮中心、合約續約、多物件人力。' +
    '先同理房東/代管的混亂,再談整理回同一個地方。不要寫成租客權益文。' +
    SHARED_BRAND_CTA_RULE,
  taskgo:
    '【本篇受眾車道:B 端】只寫給工程行老闆、工班頭或工地主任。' +
    '場景放在派工排程、成本、LINE 現場回報、月底才知賠錢。' +
    '用後台/系統畫面感說話,少寫純工地風景抒情。立場站在做工的人這邊。' +
    SHARED_BRAND_CTA_RULE,
};

const B2C_LANE_INSTRUCTIONS: Record<string, string> = {
  washgo:
    '【本篇受眾車道:C 端】說話對象是有送洗需求的人(上班族、媽媽、租屋族)。維持親切口語,一篇只講一件事。' +
    SHARED_BRAND_CTA_RULE,
  homigo:
    '【本篇受眾車道:C 端】可以從房客或租屋日常切入,但不要假裝 Homigo 只做 C 端生活品牌。' +
    SHARED_BRAND_CTA_RULE,
  taskgo:
    '【本篇受眾車道:C 端】若要寫現場師傅日常,仍要讓人感覺這是工班在用的工具,不是消費生活帳號。' +
    SHARED_BRAND_CTA_RULE,
};

const FALLBACK_AUDIENCES: Record<string, Record<AudienceLane, AudiencePick>> = {
  washgo: {
    b2b: { name: '傳統洗衣店主(B2B)', lane: 'b2b', painPoints: ['手寫單、電話聯絡、客源老化'], appealAngle: '數位轉型零門檻、年輕客群從 LINE 進來' },
    b2c: { name: '忙碌上班族/雙薪家庭', lane: 'b2c', painPoints: ['沒時間洗', '沒時間拿'], appealAngle: '到府收送、LINE 下單、時間還給自己' },
  },
  homigo: {
    b2b: { name: '自管房東(1~10間)', lane: 'b2b', painPoints: ['收租、報修、續約全靠自己記'], appealAngle: '每天只看一眼的自動化' },
    b2c: { name: '房客(20~40歲租屋族)', lane: 'b2c', painPoints: ['報修沒下文', '押金爭議'], appealAngle: '透明進度、HomiScore 信用資產' },
  },
  taskgo: {
    b2b: { name: '工程行老闆 / 工班頭', lane: 'b2b', painPoints: ['排班燒腦', '月底才知道案子賠錢'], appealAngle: '省時間、看得到錢、掌控感' },
    b2c: { name: '現場師傅 / 工班成員', lane: 'b2c', painPoints: ['怕學新東西', '請款單沒下文'], appealAngle: '不用裝 APP、會傳早安圖就會用' },
  },
};

export function audienceLaneInstruction(slug: string, lane: AudienceLane): string {
  const table = lane === 'b2b' ? B2B_LANE_INSTRUCTIONS : B2C_LANE_INSTRUCTIONS;
  return table[slug] ?? (lane === 'b2b'
    ? '【本篇受眾車道:B 端】只寫給會付錢買系統的業者,不要寫成一般消費者生活文。'
    : '【本篇受眾車道:C 端】寫給會使用這個服務的個人,口語、有生活場景。');
}

export async function pickAudience(env: Env, brandId: string, slug: string, lane: AudienceLane): Promise<AudiencePick> {
  const fallback = FALLBACK_AUDIENCES[slug]?.[lane] ?? {
    name: lane === 'b2b' ? '業者' : '使用者',
    lane,
    painPoints: [],
    appealAngle: null,
  };
  try {
    await ensureAudienceLane(env);
  } catch (e) {
    console.error('[audience] ensureAudienceLane 失敗,改用 fallback', e);
    return fallback;
  }
  const sql = getSql(env);
  try {
    const audienceRows = await sql`
      SELECT name, lane, pain_points, appeal_angle FROM brand_audiences
      WHERE brand_id = ${brandId}::uuid AND lane = ${lane}
      ORDER BY random() LIMIT 1
    `;
    if (audienceRows.length) {
      const row = audienceRows[0] as { name: string; lane: AudienceLane; pain_points: unknown; appeal_angle: string | null };
      return { name: row.name, lane, painPoints: row.pain_points, appealAngle: row.appeal_angle };
    }
    const personaRows = await sql`
      SELECT name, lane, pain_points, appeal_angle FROM brand_personas
      WHERE brand_id = ${brandId}::uuid AND lane = ${lane}
      ORDER BY random() LIMIT 1
    `;
    if (personaRows.length) {
      const row = personaRows[0] as { name: string; lane: AudienceLane; pain_points: unknown; appeal_angle: string | null };
      return { name: row.name, lane, painPoints: row.pain_points, appealAngle: row.appeal_angle };
    }
  } catch (e) {
    if (!isMissingLaneColumn(e)) console.error('[audience] pickAudience 查詢失敗', e);
  }
  return fallback;
}

/** B 端沒素材時,設計圖/寫實輪替;C 端 Threads(Washgo)維持可愛插畫。IG 加重 design,讓圖上主標當第一句 hook。 */
export function pickImageStyle(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  lane: AudienceLane;
  brandSlug: string;
  recentStyles?: ImageStyleId[];
}): ImageStyleId {
  if (params.brandSlug === 'washgo' && params.platform === 'threads' && params.lane === 'b2c') {
    return 'illustration';
  }
  const weights: Record<ImageStyleId, number> = params.platform === 'instagram'
    ? (params.lane === 'b2b' ? { photo: 1, design: 3, illustration: 0 } : { photo: 1, design: 2, illustration: 1 })
    : (params.lane === 'b2b' ? { photo: 1, design: 1, illustration: 0 } : { photo: 1, design: 1, illustration: 1 });
  const recent = new Set(params.recentStyles ?? []);
  let pool = (Object.entries(weights) as [ImageStyleId, number][])
    .filter(([, w]) => w > 0)
    .filter(([style]) => !recent.has(style));
  if (!pool.length) {
    pool = (Object.entries(weights) as [ImageStyleId, number][]).filter(([, w]) => w > 0);
  }
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [style, w] of pool) {
    roll -= w;
    if (roll <= 0) return style;
  }
  return pool[pool.length - 1][0];
}

// ============================================================================
// 平台差異規則
// ============================================================================

export const PLATFORM_GUIDELINES: Record<string, string> = {
  facebook:
    'Facebook 貼文:當作寫一個真實故事或一篇有深度的行業觀察,有場景、有轉折,引起共鳴。' +
    '嚴格限制 1000 字以內。開頭第一句要讓人想往下讀,結尾自然帶出品牌,不要硬置入。' +
    '排版節奏:一到兩句就換行成段,段落之間留白,像在手機上讀一篇好讀的長文;不要擠成大塊文字。' +
    'Hashtag 最多 3 個放文末。',
  // IG 規則對齊「起號 / 搜尋打標籤 / 第一句 hook / 帳號辨識 > 單篇爆款 / 推薦資格」
  instagram:
    'Instagram 貼文:視覺先行,文案是圖片的延伸,不是 Facebook 長文縮短版。' +
    'IG 操盤鐵則(必遵守):' +
    '1. 第一句決定推薦——前 125 字(摺疊前)必須是完整痛點 hook;只改第一句就能決定停滑或滑走。禁止暖場。' +
    '2. 顧客搜尋——把這篇當成「顧客在 IG 搜尋欄打的一個問題」的答案。主題、圖上主標、hashtag 都圍繞同一個問題,幫演算法幫這個帳號打標籤。' +
    '3. 帳號辨識 > 單篇爆款——視覺要看得出是這個品牌(色票、構圖、主標語氣一致)。寧可穩,不要為了爆款換成不像自己的風格;影片火了人沒火等於白做。' +
    '4. 收藏優先——讓人想截圖/收藏的一句話或對比,比堆 emoji 重要。' +
    '5. 推薦資格——不洗 hashtag、不標題黨、不誤導對比、不互動勒索(禁止「留言才告訴你」)。內容必須跟帳號主題一致。' +
    '6. 80-200 字,語氣輕鬆但具體,可用少量 emoji。Hashtag 8-12 個放文末。' +
    '7. 同時為這篇設計一張 4:5 直式、讓人停下來的圖;圖上主標與文案第一句同義。',
  threads:
    'Threads 貼文:用很年輕世代的語氣(像大學生/新鮮人發文的節奏),口語、有記憶點,500 字以內。' +
    'Threads 演算法要點(必遵守):' +
    '1. 前 3 行(約 0.2 秒滑過的時間)決定生死——開頭直接丟出數據、衝突、或反常識的一句話,禁止鋪陳開場。' +
    '2. 設計「讓人想私訊轉發」的內容:省時懶人包、幫讀者說出說不清的痛點、有根據的反直覺觀點,三選一。' +
    '3. 演算法偏好有資訊量的結構化內容勝過碎片短語;若寫長一點就要有清楚節奏,不要流水帳。' +
    '4. 結尾自然丟一個讓人想留言的問題或選邊站的話題(不要寫「歡迎留言」這種話)。' +
    '5. 停留時間 >8 秒才算有效閱讀,內容要讓人願意讀完。' +
    '不放 hashtag 或最多 1 個。可以自嘲、跟風迷因,但不能尬。',
};

/** 避免 AI 腔的共同規則 */
export const ANTI_AI_RULES =
  '寫作鐵則(違反任何一條就重寫):' +
  '1. 禁用「在這個快節奏的時代」「隨著…的發展」「值得注意的是」這類 AI 陳腔濫調開頭。' +
  '2. 不要條列式教學文,除非平台特性需要。' +
  '3. 用台灣在地口語,像真人發文,可以有語助詞(啦、欸、吧)。' +
  '4. 具體勝過抽象:寫「上週有個房東半夜打來說熱水器爆了」而不是「我們提供全天候服務」。' +
  '5. 不要每句都完美通順,真人發文有節奏變化。' +
  '6. 絕對不捏造數據、優惠、法規;不確定的就不寫。' +
  '7. 只用台灣用語,出現中國用語就重寫:影片(不是視頻)、品質(不是質量)、網路(不是網絡)、資訊(不是信息)、馬鈴薯(不是土豆)。' +
  '8. 內容要長在台灣的生活場景裡:超商、騎樓、捷運、機車、夜市、梅雨、颱風假、報稅季…讓台灣讀者一看就覺得「這就是我的日常」。' +
  '9. 沒有「已驗證媒體報導」清單時,禁止寫「媒體報導」「登上 XX」「全台媒體」。有清單也只能引用列出的出處與事實,不可發明媒體名或把轉載算成多次專訪。' +
  '10. Homigo / TaskGo / Washgo 主 CTA 一律寫匠管聯絡:Service@inforcraft.com.tw、電話 0972-395-117。禁止寫各品牌 LINE、官網註冊、hello@washgo、加 LINE 免費開始。';

// ============================================================================
// 品牌知識組裝:從 DB 撈品牌設定組成 system prompt
// ============================================================================

export interface BrandContext {
  brandId: string;
  slug: string;
  name: string;
  systemPrompt: string;
}

function formatApprovedLearning(row: { insight: string; supporting_data: unknown }): string {
  const data = (row.supporting_data ?? {}) as { do_more?: string[]; do_less?: string[] };
  const extras: string[] = [];
  if (data.do_more?.length) extras.push(`多做:${data.do_more.join('、')}`);
  if (data.do_less?.length) extras.push(`少做:${data.do_less.join('、')}`);
  return extras.length ? `- ${row.insight}（${extras.join(';')}）` : `- ${row.insight}`;
}

export async function buildBrandContext(env: Env, brandId: string): Promise<BrandContext> {
  const sql = getSql(env);
  const [brandRows, personaRows, ruleRows, channelRows, keywordRows, learningRows, coverages] = await Promise.all([
    sql`SELECT id, slug, name, tagline FROM brands WHERE id = ${brandId}::uuid LIMIT 1`,
    sql`SELECT name, age_range, profile, pain_points, appeal_angle FROM brand_personas WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 6`,
    sql`SELECT rule_type, statement, condition_note FROM brand_rules WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 30`,
    sql`SELECT platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max FROM brand_channels WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT category, value FROM brand_keywords WHERE brand_id = ${brandId}::uuid LIMIT 40`,
    sql`SELECT insight, supporting_data FROM learning_records WHERE brand_id = ${brandId}::uuid AND status = 'approved' ORDER BY created_at DESC LIMIT 8`,
    loadPublishedPrimaryCoverages(env, brandId, 4),
  ]);
  if (!brandRows.length) throw new Error('Brand not found');

  const brand = brandRows[0] as { id: string; slug: string; name: string; tagline: string | null };
  const voice = getBrandVoice(brand.slug);

  const personas = (personaRows as { name: string; age_range: string | null; profile: string | null; pain_points: unknown; appeal_angle: string | null }[])
    .map((p) => `- ${p.name}(${p.age_range ?? ''}):${p.profile ?? ''};痛點:${JSON.stringify(p.pain_points)};訴求:${p.appeal_angle ?? ''}`)
    .join('\n');

  const rules = (ruleRows as { rule_type: string; statement: string; condition_note: string | null }[])
    .map((r) => `- [${r.rule_type}] ${r.statement}${r.condition_note ? `(條件:${r.condition_note})` : ''}`)
    .join('\n');

  const channels = (channelRows as { platform: string; tone_of_voice: string | null; length_guideline: string | null; format_guideline: string | null }[])
    .map((c) => `- ${c.platform}:調性 ${c.tone_of_voice ?? '-'};長度 ${c.length_guideline ?? '-'};格式 ${c.format_guideline ?? '-'}`)
    .join('\n');

  const keywords = (keywordRows as { category: string; value: string }[])
    .map((k) => `${k.category}:${k.value}`)
    .join('、');

  const learnings = (learningRows as { insight: string; supporting_data: unknown }[])
    .map((l) => formatApprovedLearning(l))
    .join('\n');

  const systemPrompt = [
    `品牌:${brand.name}${brand.tagline ? `(${brand.tagline})` : ''}`,
    '',
    voice.frontlinePersona,
    voice.dailyConcerns ? `這個行業每天在聊的話題:${voice.dailyConcerns}` : '',
    voice.contentCraft ?? '',
    '',
    personas ? `目標受眾:\n${personas}` : '',
    rules ? `品牌規則(必須遵守,cannot_claim 與 negative_rule 絕對禁止觸犯):\n${rules}` : '',
    channels ? `各平台既有調性設定:\n${channels}` : '',
    keywords ? `品牌關鍵字/CTA 庫(自然使用,不要硬塞):${keywords}` : '',
    learnings ? `過往經營累積的操盤心得(寫文時參考,不可改品牌定位):\n${learnings}` : '',
    publishedCoveragePrompt(coverages),
    '',
    SHARED_BRAND_CTA_RULE,
    ANTI_AI_RULES,
  ].filter(Boolean).join('\n');

  return { brandId: brand.id, slug: brand.slug, name: brand.name, systemPrompt };
}

// ============================================================================
// 跨品牌合作內容(Collaboration Workspace):AI 只能讀 collaboration_briefs,
// 不得跨讀對方完整的 Brand Knowledge(Principle 3)。
// 用於「Go 生態系」跨品牌導流貼文(例如 Homigo 房東 TA 看見 TaskGo 修繕/Washgo 洗衣)。
// ============================================================================

/** 讀取指定 Collaboration 最新版 Brief,包成明確分隔、標示「唯一可引用來源」的區塊 */
export async function buildCollaborationContext(env: Env, collaborationId: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT title, content_markdown FROM collaboration_briefs
    WHERE collaboration_id = ${collaborationId}::uuid
    ORDER BY version_number DESC LIMIT 1
  `;
  if (!rows.length) return null;
  const brief = rows[0] as { title: string; content_markdown: string };
  return [
    `【跨品牌合作事實 — 唯一可引用來源:${brief.title}】`,
    '以下內容是「Go 生態系」Collaboration Workspace 中,經雙方/三方品牌負責人共同維護的合作事實。',
    '提及其他品牌時,只能引用這個區塊裡的內容,絕對不能自行編造或延伸對方品牌的內部數據、受眾、規則或未公開資訊。',
    '',
    brief.content_markdown,
  ].join('\n');
}

/** 依 slug 查詢品牌所屬的「Go 生態系」Collaboration id(找不到回傳 null,呼叫端應優雅跳過) */
export async function findEcosystemCollaborationId(env: Env, brandSlug?: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = brandSlug
    ? await sql`
        SELECT c.id FROM collaborations c
        JOIN collaboration_brands cb ON cb.collaboration_id = c.id
        JOIN brands b ON b.id = cb.brand_id
        WHERE c.title = 'Go 生態系(Homigo × TaskGo × Washgo)' AND b.slug = ${brandSlug}
        LIMIT 1
      `
    : await sql`SELECT id FROM collaborations WHERE title = 'Go 生態系(Homigo × TaskGo × Washgo)' LIMIT 1`;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

// ============================================================================
// 貼文生成與互動潛力評估的輸出格式
// ============================================================================

export interface GeneratedPost {
  title: string;
  body: string;
  hashtags: string[];
  cta: string;
  imagePrompt?: string;
}

export interface EngagementPrediction {
  score: number;         // 0-100
  analysis: string;      // 評估說明
  suggestions: string[]; // 改進建議
}

// ============================================================================
// Homigo IG/Threads 專用:4:5 直式「社群設計圖」規範(痛點主標 → 情境 → 解法)
// ============================================================================

/** 指示文案 AI 為 Homigo IG 圖撰寫設計描述(不是純照片描述) */
export const HOMIGO_IG_IMAGE_PROMPT_SPEC =
  '"imagePrompt": "必填:這張圖是 Homigo 的 4:5 直式「社群設計圖」(不是純照片)。請用繁體中文描述三個元素:' +
  '1) 主標文字:從貼文第一句提煉一句 4-10 字、有情緒、會直接印在圖上的痛點短句,必須與文案第一句同義(例如「講不清楚」「根本管不動」「房子越多,越焦慮」「大家都在自保」);' +
  '2) 情境畫面:台灣年輕房東或房客的真實疲憊場景(LINE 訊息爆炸、合約找不到、報修沒人理、電費算不清),自然表情、不要商業假笑;' +
  '3) Homigo 解法元素:一個簡潔白底的手機畫面(合約管理/繳租紀錄/報修紀錄/電表管理擇一),低調出現在畫面下方"';

/** Homigo IG 圖片生成的固定設計規格(直接附加在圖片 prompt 後) */
export const HOMIGO_IG_IMAGE_STYLE = [
  '【設計規格】4:5 直式社群貼文設計圖。米白背景(#F5F1EA)大面積留白;深藍(#0B2D5C)為主要資訊色;黃色(#F7B500)只做重點強調,禁止過度花俏。',
  '上下留白至少 120px、左右至少 80px,文字不可貼邊,畫面不可過滿,留白感要足夠。',
  '【閱讀順序】第一眼:大而粗、有情緒的繁體中文主標(痛點,可局部用黃色強調);第二眼:有共鳴的情境;第三眼才看到 Homigo 解法。先讓人感受到問題,不要一開始就像廣告、像在賣工具。',
  '【人物】東亞臉孔的台灣年輕人,自然表情、不要過度微笑、不要商業假笑,情緒偏真實與疲憊(房東焦慮、房客無奈)。不浮誇、不搞笑,讓人有共鳴。',
  '【手機UI】簡潔、白底、深藍 icon、黃色重點;像真的有人會用的租屋工具,不要金融 APP 的科技感,不要過度複雜的 UI、假 icon、無意義按鈕、奇怪數字。' +
  '手機畫面上「只能有一個」2-4 字的功能標題(如「合約管理」「繳租紀錄」),其餘內容一律用抽象的灰色線條與色塊示意,絕對不要畫任何小號文字或數字(小字一定會變成亂碼)。',
  '【文字防呆】圖上所有文字必須是「正確的台灣繁體中文」:禁止任何簡體字(壞不能寫成坏、燈不能寫成灯、約不能寫成约)、禁止錯字、禁止英文亂碼、禁止模糊文字。' +
  '整張圖的文字元素不超過 5 個(主標 1 個+情境短語最多 3 個+手機 UI 標籤),每個情境短語 2-4 字,逐字確認寫對再畫。',
  '【整體感覺】像新創品牌做的內容視覺,有觀點、有情緒、有生活感;不要像電商廣告、保險 DM、傳統房仲海報、不要過度商業化。',
  '目標:讓人看到的反應是「這真的就是我遇到的問題」,而不是「又一個廣告」。',
].join('\n');

/** Homigo 品牌標:無 logo 檔時的文字標 fallback */
export const HOMIGO_TEXT_MARK_RULE =
  '【品牌標】畫面左下角或 footer 放小小的深藍色「Homigo」文字標,乾淨、不可過大、不可貼底。';

/** 各品牌 B 端「社群設計圖」規格(痛點主標 + 系統 UI 卡);Homigo 沿用既有 IG 規範 */
export const BRAND_DESIGN_IMAGE_STYLE: Record<string, string> = {
  homigo: HOMIGO_IG_IMAGE_STYLE,
  washgo: [
    '【設計規格】4:5 直式社群設計圖(IG Feed)。深藍(#1D4F8C)為主色,品牌藍(#3A8DDE)做層次,金橘(#FFB84D)只做重點強調。',
    '大面積留白,文字不可貼邊。第一眼是一句 4-10 字繁中痛點主標(例如「手寫單對不攏」「衣服洗到哪沒人知」);第二眼是洗衣店後場或櫃檯情境;第三眼才是簡潔的系統畫面卡。',
    '【手機UI】白底、一個 2-4 字功能標題(如「送洗履歷」「門市調撥」),其餘用灰色線條示意,禁止小號文字與數字(小字會變亂碼)。',
    '【文字防呆】圖上所有文字必須是正確台灣繁體中文,整張不超過 5 個文字元素。不要吉卜力卡通、不要笑臉洗衣機。',
  ].join('\n'),
  taskgo: [
    '【設計規格】4:5 直式社群設計圖(IG Feed)。深灰底或米白底,橘色(#ED9121)只做重點強調。',
    '第一眼是一句 4-10 字繁中痛點主標(例如「今天做到哪」「月底才知賠」);第二眼是工地或後台情境;第三眼才是派工/回報系統畫面卡。',
    '【手機UI】白底、一個 2-4 字功能標題(如「派工佇列」「現場回報」),其餘用灰色線條示意,禁止小號文字與數字。',
    '【文字防呆】圖上所有文字必須是正確台灣繁體中文,整張不超過 5 個文字元素。不要電商廣告感。',
  ].join('\n'),
};

/** Washgo Threads 專用:每篇必配一張可愛插畫衝曝光(短文 + 可愛圖是流量策略核心;只用於 Threads C 端) */
export const WASHGO_THREADS_IMAGE_PROMPT_SPEC =
  '"imagePrompt": "必填:Washgo 的 Threads 每篇都要配一張「可愛系插畫」來增加曝光。' +
  '給圖片生成模型的英文描述:畫出這篇貼文主題的療癒場景,構圖要簡單、主體只有一個、一眼看懂' +
  '(例如圓滾滾有笑臉的洗衣機、蓬鬆的羽絨被、疊得整齊的毛巾山、幫忙摺衣服的小幫手角色),' +
  '讓人滑到會停下來按讚的可愛程度,不含文字"';

const DESIGN_IMAGE_PROMPT_SPEC =
  '"imagePrompt": "必填:這張圖是 4:5 直式「社群設計圖」(不是純照片)。請用繁體中文描述三個元素:' +
  '1) 主標文字:從貼文第一句提煉一句 4-10 字、有情緒、會直接印在圖上的痛點短句(必須與文案第一句同義,這是停滑 hook);' +
  '2) 情境畫面:業者真實會遇到的疲憊或忙亂場景,自然表情、不要商業假笑;' +
  '3) 解法元素:一個簡潔白底的系統畫面(只顯示一個 2-4 字功能標題)"';

/** 各平台配圖描述的要求:FB 走寫實攝影、IG 走溫暖插畫/自然攝影,Threads 預設純文字、AI 判斷有圖更好才選填 */
const IMAGE_PROMPT_SPEC: Record<'facebook' | 'instagram' | 'threads', string> = {
  facebook:
    '"imagePrompt": "必填:給圖片生成模型的英文描述,走「寫實紀實攝影」風格。' +
    '主角可以是「人」也可以是「空間/建築本身」:' +
    '拍人時要是真實的台灣人(東亞臉孔、自然身形與日常穿著,不要歐美模特兒長相),有真實的表情與動作;' +
    '拍空間時讓老屋的質感說話(斑駁外牆、紅磚、磨石子地板、鐵窗花、樓梯間的光影),像建築紀實攝影。' +
    '場景要在台灣(騎樓、公寓、工地、巷口、洗衣店…)、自然光,' +
    '要溫暖、貼近人心、有故事感,photorealistic 質感,避免棚拍廣告感、塑膠感與科技感構圖,不含文字"',
  instagram:
    '"imagePrompt": "必填:給圖片生成模型的英文描述,4:5 直式構圖。' +
    '畫面必須有一個一眼看懂的停滑主體(一個人的真實情緒、或一個台灣日常空間的關鍵細節),回答這篇顧客搜尋問題。' +
    '主角是台灣人(東亞臉孔、自然身形與日常穿著)或台灣空間本身;自然光、淺景深、有生活感。' +
    '禁止冷冰冰物件圖、科技感構圖、歐美模特兒、棚拍廣告感。不含文字"',
  threads:
    '"imagePrompt": "選填,預設【不要】提供這個欄位(Threads 以純文字為主,大多數貼文不需要圖)。' +
    '只有當你判斷「這篇配一張圖會明顯更吸睛、更容易被按讚轉發」(例如畫面感很強的場景、視覺哏)才提供:' +
    '給圖片生成模型的英文描述,描繪一個溫暖可愛、有台灣生活感的場景,不含文字"',
};

function resolveImagePromptSpec(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  brandSlug?: string;
  imageStyle?: ImageStyleId;
  skipImagePrompt?: boolean;
  lane?: AudienceLane;
}): string {
  if (params.skipImagePrompt) return '';
  const slug = params.brandSlug;
  const style = params.imageStyle;
  if (style === 'design' || (slug === 'homigo' && params.platform === 'instagram' && !style)) {
    return slug === 'homigo' ? HOMIGO_IG_IMAGE_PROMPT_SPEC : DESIGN_IMAGE_PROMPT_SPEC;
  }
  if (slug === 'washgo' && params.platform === 'threads' && (params.lane ?? 'b2c') === 'b2c') {
    return WASHGO_THREADS_IMAGE_PROMPT_SPEC;
  }
  if (style === 'illustration') {
    return '"imagePrompt": "必填:給圖片生成模型的英文描述,走溫暖手繪插畫,主體單一、一眼看懂,不含文字"';
  }
  if (style === 'photo') return IMAGE_PROMPT_SPEC.facebook;
  return IMAGE_PROMPT_SPEC[params.platform];
}

export function buildPostUserPrompt(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  topic: string;
  topicSummary?: string;
  extraInstruction?: string;
  brandSlug?: string;
  audienceLane?: AudienceLane;
  audienceName?: string;
  imageStyle?: ImageStyleId;
  skipImagePrompt?: boolean;
}): string {
  const voice = params.brandSlug ? getBrandVoice(params.brandSlug) : undefined;
  const guideline = params.platform === 'threads' && voice?.threadsCraft
    ? `${PLATFORM_GUIDELINES.threads}\n${voice.threadsCraft}`
    : params.platform === 'instagram' && voice?.instagramCraft
      ? `${PLATFORM_GUIDELINES.instagram}\n${voice.instagramCraft}`
      : PLATFORM_GUIDELINES[params.platform];
  const lane = params.audienceLane;
  const laneBlock = lane && params.brandSlug
    ? [
        audienceLaneInstruction(params.brandSlug, lane),
        params.audienceName ? `本篇主受眾:${params.audienceName}。整篇只對這一個對象說話,不要同時討好 B 端與 C 端。` : '',
      ].filter(Boolean).join('\n')
    : '';
  const searchBlock = params.platform === 'instagram' && voice?.igSearchQueries?.length
    ? `本篇要能被顧客在 IG 搜尋欄找到。只選下面「一個」搜尋意圖寫進第一句與 hashtag:${voice.igSearchQueries.join('、')}。`
    : '';
  const imageSpec = resolveImagePromptSpec({
    platform: params.platform, brandSlug: params.brandSlug,
    imageStyle: params.imageStyle, skipImagePrompt: params.skipImagePrompt, lane,
  });
  return [
    `請針對以下主題,為 ${params.platform} 平台寫一篇貼文。`,
    `主題:${params.topic}`,
    params.topicSummary ? `主題背景:${params.topicSummary}` : '',
    '',
    guideline,
    laneBlock,
    searchBlock,
    params.extraInstruction ?? '',
    params.skipImagePrompt ? '配圖已指定為品牌上傳的真實截圖或實拍,不要提供 imagePrompt。' : '',
    '',
    '回傳 JSON 物件,格式:',
    `{"title": "內部管理用標題", "body": "貼文全文", "hashtags": ["不含#的標籤"], "cta": "行動呼籲一句話"${imageSpec ? `, ${imageSpec}` : ''}}`,
  ].filter(Boolean).join('\n');
}

const IMAGE_CATEGORY_LABEL: Record<string, string> = {
  system_screenshot: '系統畫面截圖',
  real_photo: '實際拍攝照片',
  people: '人物照片',
  scene: '場景照片',
  brand_collab: '合作品牌/異業合作照片',
  other: '其他素材',
};

/** 看圖寫貼文的文字指示(需搭配 image_url content part 一起送);FB/IG/Threads 共用 */
export function buildImageInspiredPostPrompt(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  caption?: string;
  imageCategory?: string;
  brandSlug?: string;
  audienceLane?: AudienceLane;
  audienceName?: string;
}): string {
  const voice = params.brandSlug ? getBrandVoice(params.brandSlug) : undefined;
  const guideline = params.platform === 'threads' && voice?.threadsCraft
    ? `${PLATFORM_GUIDELINES.threads}\n${voice.threadsCraft}`
    : params.platform === 'instagram' && voice?.instagramCraft
      ? `${PLATFORM_GUIDELINES.instagram}\n${voice.instagramCraft}`
      : PLATFORM_GUIDELINES[params.platform];
  const categoryLabel = params.imageCategory ? IMAGE_CATEGORY_LABEL[params.imageCategory] ?? '素材照片' : '素材照片';
  const lane = params.audienceLane ?? defaultAudienceLane(params.platform);
  const laneBlock = params.brandSlug
    ? [
        audienceLaneInstruction(params.brandSlug, lane),
        params.audienceName ? `本篇主受眾:${params.audienceName}。` : '',
      ].filter(Boolean).join('\n')
    : '';
  const searchBlock = params.platform === 'instagram' && voice?.igSearchQueries?.length
    ? `文案第一句要對準顧客會搜的一個詞:${voice.igSearchQueries.join('、')}。`
    : '';
  return [
    `這是品牌上傳的一張${categoryLabel}${params.caption ? `,說明:${params.caption}` : ''}。`,
    `請仔細看這張圖,挑一個畫面裡真的有的細節或情境當鉤子,寫一篇 ${params.platform} 貼文。`,
    '不要憑空描述圖片裡沒有的東西,也不要寫成單純的圖片說明文;要像有人真的看到/用到這個畫面後,寫下的一則真實感想或分享。',
    '',
    guideline,
    laneBlock,
    searchBlock,
    '',
    '回傳 JSON 物件:',
    '{"title": "內部管理用標題", "body": "貼文全文", "hashtags": ["不含#的標籤"], "cta": "行動呼籲一句話"}',
  ].filter(Boolean).join('\n');
}

/** @deprecated 改用 buildImageInspiredPostPrompt */
export function buildImageInspiredThreadsPrompt(params: {
  platform: 'threads';
  caption?: string;
  imageCategory?: string;
  brandSlug?: string;
}): string {
  return buildImageInspiredPostPrompt(params);
}

// ============================================================================
// Threads 熱議跟風貼文:類型輪替(避免連續發文都落在同一個角度,例如連續兩篇都在講換季)
//   排程 Worker(generateThreadsSlot)每次會排除最近用過的類型,再從其餘類型權重隨機挑一個;
//   image_inspired 只有在品牌智慧素材庫裡有可用圖片時才會進入候選池(見 generate.ts 的 generateThreadsFromImage)。
//   這裡的 instruction 刻意寫成品牌無關:AI 已經從 buildBrandContext 的 systemPrompt 知道
//   這個品牌的第一線人設與日常關心的議題,不需要在這裡為每個品牌各寫一份。
// ============================================================================

export type ThreadsHourlyCategoryId =
  | 'seasonal_trend'   // 現行行為:熱門話題/PTT/Dcard 跟風
  | 'emotion'          // 人際/感情視角:依品牌自然換成房東房客、業主工班、伴侶室友等關係
  | 'weather'          // 台灣當下天氣/季節現象(梅雨、颱風、入秋、濕度…)
  | 'entertainment'    // 影劇/綜藝/明星/動漫等娛樂話題
  | 'sports'           // 運動賽事/健身風潮
  | 'image_inspired';  // 用品牌智慧素材庫上傳的圖片當話題

export interface ThreadsHourlyCategory {
  id: ThreadsHourlyCategoryId;
  label: string;   // 中文標籤,存進 generation_prompt_meta.category,行程表 UI 顯示用
  weight: number;  // 權重隨機的相對權重
  /** 給模型的切入角度指示;{{TRENDS}} 會由呼叫端代換成目前的熱門話題清單(可以是空字串) */
  instruction: string;
}

export const THREADS_HOURLY_CATEGORIES: ThreadsHourlyCategory[] = [
  {
    id: 'seasonal_trend',
    label: '熱議跟風',
    weight: 2,
    instruction:
      '從下面這份「台灣現在的熱門話題」挑「一個」最能跟品牌日常自然掛勾的,寫一則 Threads 跟風文。' +
      '如果全部都掛不上,就寫一則品牌日常 observation 文(第一線工作看到的趣事)。不要硬蹭。\n{{TRENDS}}',
  },
  {
    id: 'emotion',
    label: '感情/人際視角',
    weight: 1,
    instruction:
      '這篇從「人際互動/感情」的角度切入:依這個行業實際會出現的關係去想' +
      '(可能是家人、伴侶、室友、房東房客、業主與工班之間,自然會有的摩擦、體貼或溫馨互動),' +
      '不要生套跟行業無關的戀愛哏。用一個具體的小場景或一句真實對話開頭,自然帶到品牌日常會遇到的情境,' +
      '結尾不用刻意收在促銷。如果下面的熱門話題裡有適合的人際/感情類話題也可以參考,但不強求:\n{{TRENDS}}',
  },
  {
    id: 'weather',
    label: '天氣/季節話題',
    weight: 1,
    instruction:
      '這篇從「台灣當下的天氣/季節現象」切入(例如梅雨、颱風、忽冷忽熱、濕度、換季),' +
      '只寫普遍性的季節觀察,不要捏造具體氣象數據或預報。自然帶到品牌日常會被這種天氣影響到的場景。' +
      '如果下面的熱門話題裡有天氣相關的可以參考,但不強求:\n{{TRENDS}}',
  },
  {
    id: 'entertainment',
    label: '娛樂/影視話題',
    weight: 1,
    instruction:
      '這篇從「娛樂/影視話題」切入:如果下面的熱門話題裡有影劇、綜藝、明星、動漫(含日劇/日本動漫,台灣人普遍在追的)相關,' +
      '挑一個順勢帶到品牌日常;如果都沒有適合的,就寫近期台灣人普遍在討論的娛樂現象(不要捏造具體劇情或未證實的八卦)。\n{{TRENDS}}',
  },
  {
    id: 'sports',
    label: '運動/賽事話題',
    weight: 1,
    instruction:
      '這篇從「運動/賽事」切入:如果下面的熱門話題裡有運動賽事(棒球、籃球、路跑、健身風潮)相關,' +
      '挑一個順勢帶到品牌日常;如果都沒有適合的,就寫近期普遍性的運動/健身觀察(不捏造比賽成績或數據)。\n{{TRENDS}}',
  },
  {
    id: 'image_inspired',
    label: '系統畫面/實績分享',
    weight: 1,
    instruction: '(由呼叫端在 generateThreadsFromImage 組專屬 prompt,這裡的 instruction 不會被使用)',
  },
];

/** 排除最近用過的類型後,依權重隨機挑一個(排除後池子是空的就退回全部類型) */
export function pickThreadsHourlyCategory(
  excludeIds: ThreadsHourlyCategoryId[],
  availableIds?: ThreadsHourlyCategoryId[],
): ThreadsHourlyCategory {
  const base = availableIds
    ? THREADS_HOURLY_CATEGORIES.filter((c) => availableIds.includes(c.id))
    : THREADS_HOURLY_CATEGORIES;
  const pool = base.filter((c) => !excludeIds.includes(c.id));
  const candidates = pool.length ? pool : base.length ? base : THREADS_HOURLY_CATEGORIES;
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

// ============================================================================
// Threads 生活哏文(跟品牌/服務完全無關的個人碎念,拿來衝自然流量與帳號真實感)
//   目前先限定 Washgo(見排程 Worker 的 OFFTOPIC_BRANDS),之後要擴充品牌只要加進那個陣列。
// ============================================================================

/** 生活哏文的通用人設:完全不提品牌,像帳號背後真的有一個會講幹話的人 */
export const OFFTOPIC_SYSTEM_PROMPT =
  '你是一個 20-35 歲的台灣人,平常就愛在 Threads 上分享生活觀察、幹話、感情觀,完全不是任何品牌的代言人或行銷帳號,' +
  '這篇貼文純粹是你的個人碎念,跟任何工作、品牌、商業一律沒有關係。' +
  '你講話很真實、有個人風格,偶爾自嘲、偶爾毒舌,像朋友圈裡那個很會講話又敢講真心話的人。';

interface OfftopicPostType {
  label: string;
  instruction: string;
}

const OFFTOPIC_TYPES: OfftopicPostType[] = [
  {
    label: '好笑生活哏',
    instruction:
      '寫一則會讓人邊看邊笑出來的生活觀察或自嘲哏,主題從台灣人共通的日常小尷尬/小崩潰取材' +
      '(通勤、外送、家人 LINE 群組、減肥、上班、社交軟體、颱風天、租屋室友…都可以),' +
      '要有畫面感跟意外的收尾,不要是老掉牙的冷笑話,不要條列式。',
  },
  {
    label: '引人省思的一段話',
    instruction:
      '寫一段簡短但有記憶點的省思,像是深夜突然想通某件事的感覺,主題可以是成長、時間、選擇、人際關係、與自己相處等,' +
      '語氣真誠不說教,結尾留一點餘韻讓人想截圖收藏,不要寫成長文說教或條列金句。',
  },
  {
    label: '感情觀/戀愛觀點表態',
    instruction:
      '對戀愛/感情/單身/交往相處中的某個現象講出你的真實看法或立場' +
      '(例如:曖昧該不該講清楚、多久沒聯絡算是不喜歡了、遠距離戀愛、分帳、已讀不回、家人催婚…),' +
      '可以稍微犀利或有態度,但要讓人覺得「講得對」而不是說教或攻擊某群人。',
  },
];

/** 隨機挑一種類型組成生活哏文的 user prompt;usedTopics 是近期已寫過的標題,避免重複哏 */
export function buildOfftopicUserPrompt(usedTopics: string[]): string {
  const picked = OFFTOPIC_TYPES[Math.floor(Math.random() * OFFTOPIC_TYPES.length)];
  return [
    `請寫一篇 Threads 貼文,類型是「${picked.label}」。`,
    picked.instruction,
    '',
    '鐵則(違反任何一條都不合格):',
    '1. 完全不能提到任何品牌、公司、產品、服務,或洗衣、送洗、包租代管、裝修裝潢等相關字眼——就是一則單純的個人生活貼文。',
    '2. 不放連結、不放促銷、不放 CTA、不放 hashtag(hashtags 回傳空陣列,cta 回傳空字串)。',
    '3. 500 字以內,前 3 行要抓住眼球(數據、衝突、或反常識的一句話),口語、像真人隨手發的短文,不要鋪陳開場。',
    '4. 避免政治、宗教、災難、性別對立等真正的爭議雷區;感情觀可以有立場,但走輕鬆有共鳴的路線,不要說教或攻擊性言論。',
    usedTopics.length ? `以下主題最近寫過了,不要重複類似的角度:\n${usedTopics.join('、')}` : '',
    '',
    ANTI_AI_RULES,
    '',
    '回傳 JSON 物件:{"title": "內部管理用標題(15字內,方便去重比對,不會公開發布)", "body": "貼文全文", "hashtags": [], "cta": ""}',
  ].filter(Boolean).join('\n');
}

// ============================================================================
// Go 生態系 X(Twitter) 帳號:全新的英文獨立人格,不代表任何單一品牌的翻譯版。
// 素材只能來自 buildCollaborationContext() 讀到的 Go 生態系 Collaboration Brief
// (含各品牌 can_claim 等級的公開事實),絕對不能碰任一品牌完整的 Brand Knowledge。
// ============================================================================

export const ECOSYSTEM_X_SYSTEM_PROMPT = [
  'You are the voice of "Go Ecosystem" on X (Twitter) — an independent English-language persona, not a translation of any single brand.',
  'You represent a vertical SaaS ecosystem born in Taiwan: demand from one app becomes supply for another, and a lifestyle layer completes the loop.',
  'Your background story: you have actually operated inside this ecosystem — watched a landlord\'s repair request flow straight into a contractor\'s dispatch queue, watched a laundry pickup get bundled as a tenant perk.',
  'Tone: sharp, opinionated, data-aware, mildly contrarian. You write like an operator who ships product, not a marketer chasing engagement.',
  'Audience: international PropTech / vertical SaaS / startup-builder circles on X — people who follow product strategy, GTM, and platform thinking.',
  '',
  'Hard rules (breaking any one of these makes the output invalid):',
  '1. Never invent aggregate ecosystem numbers (e.g. "500K users across our apps") unless explicitly given in the source material.',
  '2. Only reference facts that appear in the collaboration brief provided to you. If you want to mention a specific brand fact and it is not in the brief, leave it out.',
  '3. No hashtag spam — 0 to 2 hashtags max, and only if they add real discovery value.',
  '4. No generic AI-speak openers ("In today\'s fast-paced world...", "It\'s worth noting that..."). Open with a concrete scene, a number, or a contrarian claim.',
  '5. Write like a real founder/operator tweeting, not a press release. Short sentences. Confident. No corporate hedging.',
  '6. Never claim market leadership or use unverifiable superlatives ("the best", "#1", "market leader").',
].join('\n');

export interface GeneratedXPost {
  format: 'single' | 'thread';
  tweets: string[];
  /** 1-2 句英文視覺場景描述,用來生成配圖的 hero image;固定套用 ECOSYSTEM_X_IMAGE_STYLE 統一視覺風格 */
  imagePrompt?: string;
}

/**
 * Go 生態系 X 帳號的固定配圖風格:科技感、走在趨勢端,吸引國際 PropTech/SaaS 圈與創投的視覺辨識度。
 * 刻意不放任何真人/品牌 logo/文字,維持抽象未來感,才能跨三品牌通用又不混淆品牌知識邊界。
 */
export const ECOSYSTEM_X_IMAGE_STYLE = [
  'Sleek futuristic tech aesthetic for an international SaaS/startup audience.',
  'Abstract glowing data-flow network, interconnected nodes and lines representing 3 systems exchanging data in real time.',
  'Deep navy or near-black background with vivid cyan, electric violet, and magenta gradient light accents.',
  'Clean minimalist high-end product/VC-deck visual language, subtle glass/3D render quality, dramatic rim lighting.',
  'Wide 16:9 composition, cinematic depth of field, ultra-detailed digital art, trending on Behance/Dribbble style.',
  'No people, no text, no logos, no watermark, no UI mockups with readable text.',
].join(' ');

export interface EcosystemXAngle {
  id: string;
  label: string;
  instruction: string;
}

/** X 內容形式輪替:單推(觀點) vs Thread(產業敘事/拆解) vs 單品牌聚焦(spotlight) */
export const ECOSYSTEM_X_ANGLES: EcosystemXAngle[] = [
  {
    id: 'single_insight',
    label: '單推觀點',
    instruction:
      'Write ONE sharp, standalone tweet (max 275 characters) — a single opinionated insight about vertical SaaS, ' +
      'ecosystem thinking, or a concrete scene from how Homigo/TaskGo/Washgo hand off demand and supply to each other. ' +
      'Return {"format": "single", "tweets": ["..."]} with exactly one item.',
  },
  {
    id: 'thread_narrative',
    label: 'Thread 產業敘事',
    instruction:
      'Write a thread of 4-6 tweets telling a concrete story about how this ecosystem works ' +
      '(e.g. a repair request flowing from Homigo to TaskGo, or how a lifestyle service like Washgo gets bundled in). ' +
      'Tweet 1 must be the strongest hook (a claim, number, or scene) — someone scrolling must want to tap "Show this thread". ' +
      'Each tweet max 270 characters, self-contained enough to make sense on its own but building on the previous one. ' +
      'Return {"format": "thread", "tweets": ["tweet 1", "tweet 2", ...]} with 4 to 6 items.',
  },
  {
    id: 'thread_builder_pov',
    label: 'Thread 操盤手視角',
    instruction:
      'Write a thread of 3-5 tweets from the point of view of someone who actually built this: a candid, slightly contrarian take on ' +
      'building three vertical apps that feed each other instead of one all-in-one app. Reference only facts present in the brief below. ' +
      'Tweet 1 is the hook. Each tweet max 270 characters. ' +
      'Return {"format": "thread", "tweets": ["tweet 1", "tweet 2", ...]} with 3 to 5 items.',
  },
  {
    id: 'brand_spotlight_taskgo',
    label: '單品牌聚焦:TaskGo',
    instruction:
      'This post is a solo spotlight on ONE product in the ecosystem: TaskGo (construction/field-service dispatch management). ' +
      'Explicitly name "TaskGo" in the first tweet. Write either one standalone tweet (max 275 characters) OR a thread of 2-4 tweets ' +
      '(each max 270 characters) — pick whichever better fits the concrete detail available. Only use facts about TaskGo that appear ' +
      'in the brief below; do not pad it with unrelated Homigo/Washgo facts unless the brief explicitly frames them as a TaskGo benefit. ' +
      'Open with a concrete scene, number, or contrarian claim about field-service/dispatch work — not a generic intro. ' +
      'Return {"format": "single"|"thread", "tweets": ["..."]}.',
  },
  {
    id: 'brand_spotlight_homigo',
    label: '單品牌聚焦:Homigo',
    instruction:
      'This post is a solo spotlight on ONE product in the ecosystem: Homigo (LINE-native rental/property management). ' +
      'Explicitly name "Homigo" in the first tweet. Write either one standalone tweet (max 275 characters) OR a thread of 2-4 tweets ' +
      '(each max 270 characters) — pick whichever better fits the concrete detail available. Only use facts about Homigo that appear ' +
      'in the brief below; do not pad it with unrelated TaskGo/Washgo facts unless the brief explicitly frames them as a Homigo benefit. ' +
      'Open with a concrete scene, number, or contrarian claim about rental/property management — not a generic intro. ' +
      'Return {"format": "single"|"thread", "tweets": ["..."]}.',
  },
  {
    id: 'brand_spotlight_washgo',
    label: '單品牌聚焦:Washgo',
    instruction:
      'This post is a solo spotlight on ONE product in the ecosystem: Washgo (smart laundry/garment-care platform). ' +
      'Explicitly name "Washgo" in the first tweet. Write either one standalone tweet (max 275 characters) OR a thread of 2-4 tweets ' +
      '(each max 270 characters) — pick whichever better fits the concrete detail available. Only use facts about Washgo that appear ' +
      'in the brief below; do not pad it with unrelated TaskGo/Homigo facts unless the brief explicitly frames them as a Washgo benefit. ' +
      'Open with a concrete scene, number, or contrarian claim about laundry/garment-care operations — not a generic intro. ' +
      'Return {"format": "single"|"thread", "tweets": ["..."]}.',
  },
];

export function pickEcosystemXAngle(excludeIds: string[]): EcosystemXAngle {
  const pool = ECOSYSTEM_X_ANGLES.filter((a) => !excludeIds.includes(a.id));
  const candidates = pool.length ? pool : ECOSYSTEM_X_ANGLES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function buildEcosystemXUserPrompt(params: { angle: EcosystemXAngle; collaborationContext: string }): string {
  return [
    params.angle.instruction,
    '',
    params.collaborationContext,
    '',
    'Every fact you use about Homigo, TaskGo, or Washgo must come from the brief above. Do not add anything beyond it.',
    '',
    'Also include an "imagePrompt" field in the JSON: a short 1-2 sentence description of ONE concrete abstract visual scene ' +
      '(e.g. "three glowing data streams merging into a single pulsing core node") that fits this specific post\'s idea. ' +
      'Keep it abstract/conceptual, not literal — a fixed tech visual style will be applied on top of it automatically.',
  ].join('\n');
}

export function buildEngagementEvalPrompt(params: { platform: string; body: string }): string {
  const igExtra = params.platform === 'instagram'
    ? [
        'Instagram 加權評估(這四項低分就要扣):',
        '- 前 125 字是否自成一句痛點 hook(不用展開也看得懂)',
        '- 有沒有對準一個顧客搜尋問題(幫帳號打標籤)',
        '- 值不值得收藏/截圖(saves 比 likes 更能推推薦)',
        '- 讀完會不會只記得這篇、記不住是哪個品牌(影片火了人沒火=低分)',
        '- 有無傷害推薦資格:洗標、標題黨、互動勒索、主題飄掉',
      ].join('\n')
    : '';
  return [
    `你是台灣社群操盤手,請評估以下 ${params.platform} 貼文的互動潛力(按讚/留言/轉發${params.platform === 'instagram' ? '/收藏' : ''})。`,
    '從受眾共鳴、開頭吸引力、平台演算法友善度、轉發動機四個面向評估。',
    igExtra,
    '',
    '貼文內容:',
    params.body,
    '',
    '回傳 JSON 物件:{"score": 0到100的數字, "analysis": "一段評估說明", "suggestions": ["具體改進建議"]}',
  ].filter(Boolean).join('\n');
}
