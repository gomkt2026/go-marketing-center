import type { Env } from './env';
import { getSql } from './db';

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
  /** 配圖風格方向(附加到圖片生成 prompt) */
  imageStyle?: string;
  /** 圖片呈現方式:photo 走寫實攝影(預設);illustration 走插畫風(不套 photorealistic) */
  imageRendering?: 'photo' | 'illustration';
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
    contentCraft:
      '寫深度文時遵守這個範式(高互動房產帳號的寫法):' +
      '1. 開頭用一個數字或反直覺句當鉤子,例如「90%的房東,都低估了老屋出租前要花的錢」,禁止暖場鋪陳。' +
      '2. 引用真實對話開場也很有力:房東在電話裡說的一句話、房客看房時問的一個問題,用引號原汁原味放出來。' +
      '3. 內文用具體數字拆解給讀者看:租金、報酬率、修繕費、屋齡,算給他看;點破「看不見的成本」(管線、防水、壁癌、稅)比看得見的裝潢更吃錢。' +
      '4. 一到兩句就換段,大量留白,手機閱讀的節奏;可用重複句式營造節奏感。' +
      '5. 結尾收在一句沉澱的行業洞察(例如「租得快的房子,都是在還沒刊登前就決定的」),不要收在促銷。',
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
    contentCraft:
      '寫深度文時遵守這個範式(高互動裝修帳號的寫法):' +
      '1. 標題可用專欄式:「工班管理學|一組不好的工班,真的可以毀掉一整個案子」「老屋預算學|是不是少一個 0?」。' +
      '2. 開頭用反直覺句、真實數字、或直接引用一段真實對話(屋主的徵求文、業主在 LINE 說的話)當鉤子,禁止暖場。' +
      '3. 內文用具體數字拆解:坪數、預算、單價、工期,算給讀者看哪裡不合理(例如 69 坪預算 80 萬=一坪 1.16 萬,連基礎工程都不夠)。' +
      '4. 講「工程鏈」的因果,讓外行人看懂內行邏輯:拆除沒處理好→水電只能遷就→泥作想辦法補→門窗木作櫥櫃全部跟著收;前面犯的錯,都是後面的人在付代價。' +
      '5. 一到兩句就換段,大量留白;可用重複句式(「他會知道…他會知道…」)營造節奏。' +
      '6. 結尾收在一句行業洞察(例如「最敢答應你的人,往往最危險」),不要收在促銷。',
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

// ============================================================================
// 平台差異規則
// ============================================================================

export const PLATFORM_GUIDELINES: Record<string, string> = {
  facebook:
    'Facebook 貼文:當作寫一個真實故事或一篇有深度的行業觀察,有場景、有轉折,引起共鳴。' +
    '嚴格限制 1000 字以內。開頭第一句要讓人想往下讀,結尾自然帶出品牌,不要硬置入。' +
    '排版節奏:一到兩句就換行成段,段落之間留白,像在手機上讀一篇好讀的長文;不要擠成大塊文字。' +
    'Hashtag 最多 3 個放文末。',
  instagram:
    'Instagram 貼文:有趣、視覺先行,文案是圖片的延伸。結合近期時事哏,前 125 字要抓住重點(之後會被折疊)。' +
    '語氣輕鬆,可用 emoji 但別堆疊。Hashtag 5-10 個放文末。' +
    '同時你要為這篇貼文設計一張讓人覺得有趣、想停下來看的圖,提供圖片描述。',
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
  '8. 內容要長在台灣的生活場景裡:超商、騎樓、捷運、機車、夜市、梅雨、颱風假、報稅季…讓台灣讀者一看就覺得「這就是我的日常」。';

// ============================================================================
// 品牌知識組裝:從 DB 撈品牌設定組成 system prompt
// ============================================================================

export interface BrandContext {
  brandId: string;
  slug: string;
  name: string;
  systemPrompt: string;
}

export async function buildBrandContext(env: Env, brandId: string): Promise<BrandContext> {
  const sql = getSql(env);
  const [brandRows, personaRows, ruleRows, channelRows, keywordRows, learningRows] = await Promise.all([
    sql`SELECT id, slug, name, tagline FROM brands WHERE id = ${brandId}::uuid LIMIT 1`,
    sql`SELECT name, age_range, profile, pain_points, appeal_angle FROM brand_personas WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 6`,
    sql`SELECT rule_type, statement, condition_note FROM brand_rules WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 30`,
    sql`SELECT platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max FROM brand_channels WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT category, value FROM brand_keywords WHERE brand_id = ${brandId}::uuid LIMIT 40`,
    sql`SELECT insight FROM learning_records WHERE brand_id = ${brandId}::uuid ORDER BY created_at DESC LIMIT 8`,
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

  const learnings = (learningRows as { insight: string }[])
    .map((l) => `- ${l.insight}`)
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
    learnings ? `過往經營累積的品牌心得(寫文時參考這些洞察):\n${learnings}` : '',
    '',
    ANTI_AI_RULES,
  ].filter(Boolean).join('\n');

  return { brandId: brand.id, slug: brand.slug, name: brand.name, systemPrompt };
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
  '1) 主標文字:從貼文提煉一句 4-10 字、有情緒、會直接印在圖上的痛點短句(例如「講不清楚」「根本管不動」「房子越多,越焦慮」「大家都在自保」);' +
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

/** Washgo Threads 專用:每篇必配一張可愛插畫衝曝光(短文 + 可愛圖是流量策略核心) */
export const WASHGO_THREADS_IMAGE_PROMPT_SPEC =
  '"imagePrompt": "必填:Washgo 的 Threads 每篇都要配一張「可愛系插畫」來增加曝光。' +
  '給圖片生成模型的英文描述:畫出這篇貼文主題的療癒場景,構圖要簡單、主體只有一個、一眼看懂' +
  '(例如圓滾滾有笑臉的洗衣機、蓬鬆的羽絨被、疊得整齊的毛巾山、幫忙摺衣服的小幫手角色),' +
  '讓人滑到會停下來按讚的可愛程度,不含文字"';

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
    '"imagePrompt": "必填:給圖片生成模型的英文描述。畫面要以「台灣人」為主角(東亞臉孔、自然的身形與台灣日常穿著,有表情、有動作、有生活感的真實場景,例如師傅擦汗大笑、店員幫客人摺衣服),場景要有台灣感(騎樓、巷口、公寓、夜市…),溫暖手繪插畫或自然攝影感,避免冷冰冰的物件圖或科技感構圖,不含文字"',
  threads:
    '"imagePrompt": "選填,預設【不要】提供這個欄位(Threads 以純文字為主,大多數貼文不需要圖)。' +
    '只有當你判斷「這篇配一張圖會明顯更吸睛、更容易被按讚轉發」(例如畫面感很強的場景、視覺哏)才提供:' +
    '給圖片生成模型的英文描述,描繪一個溫暖可愛、有台灣生活感的場景,不含文字"',
};

export function buildPostUserPrompt(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  topic: string;
  topicSummary?: string;
  extraInstruction?: string;
  brandSlug?: string;
}): string {
  const voice = params.brandSlug ? getBrandVoice(params.brandSlug) : undefined;
  const guideline = params.platform === 'threads' && voice?.threadsCraft
    ? `${PLATFORM_GUIDELINES.threads}\n${voice.threadsCraft}`
    : PLATFORM_GUIDELINES[params.platform];
  const imageSpec = params.brandSlug === 'homigo' && params.platform === 'instagram'
    ? HOMIGO_IG_IMAGE_PROMPT_SPEC
    : params.brandSlug === 'washgo' && params.platform === 'threads'
      ? WASHGO_THREADS_IMAGE_PROMPT_SPEC
      : IMAGE_PROMPT_SPEC[params.platform];
  return [
    `請針對以下主題,為 ${params.platform} 平台寫一篇貼文。`,
    `主題:${params.topic}`,
    params.topicSummary ? `主題背景:${params.topicSummary}` : '',
    '',
    guideline,
    params.extraInstruction ?? '',
    '',
    '回傳 JSON 物件,格式:',
    `{"title": "內部管理用標題", "body": "貼文全文", "hashtags": ["不含#的標籤"], "cta": "行動呼籲一句話"${imageSpec ? `, ${imageSpec}` : ''}}`,
  ].filter(Boolean).join('\n');
}

export function buildEngagementEvalPrompt(params: { platform: string; body: string }): string {
  return [
    `你是台灣社群操盤手,請評估以下 ${params.platform} 貼文的互動潛力(按讚/留言/轉發)。`,
    '從受眾共鳴、開頭吸引力、平台演算法友善度、轉發動機四個面向評估。',
    '',
    '貼文內容:',
    params.body,
    '',
    '回傳 JSON 物件:{"score": 0到100的數字, "analysis": "一段評估說明", "suggestions": ["具體改進建議"]}',
  ].join('\n');
}
