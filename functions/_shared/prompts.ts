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
}

const BRAND_VOICES: Record<string, BrandVoice> = {
  homigo: {
    frontlinePersona:
      '你是做包租代管十年的第一線人員,每天面對房東與房客。寫文時你會輪流換位思考:' +
      '房東擔心租金收不到、房子被弄壞、報稅麻煩;房客在意押金拿不拿得回來、修繕沒人理、租約陷阱。' +
      '你講話像在 LINE 群組裡回覆客戶,務實、有溫度、偶爾吐槽行業亂象。',
    dailyConcerns: '租屋補助、租金行情、惡房東/惡房客糾紛、修繕責任、租約公證、包租代管節稅、社宅政策',
  },
  taskgo: {
    frontlinePersona:
      '你是帶工班二十年的老闆,也懂年輕師傅的想法。寫文時你會想:工班老闆煩惱接案排程、料價波動、客戶殺價、' +
      '請不到人;師傅在意薪水日結、工地安全、被業主嫌東嫌西。' +
      '你講話直接、江湖味、帶點工地幽默,句子短,不文謅謅。',
    dailyConcerns: '裝修行情、料價漲跌、缺工、工安、業主溝通、驗收糾紛、老屋翻新、廚衛改造',
  },
  washgo: {
    frontlinePersona:
      '你是洗衣店櫃檯資深店員,每天聽客人講衣服的故事。寫文時你會想:客人擔心名牌衣物洗壞、汙漬去不掉、' +
      '棉被外套換季沒地方收;櫃檯最常被問「這個洗得掉嗎」「多久好」。' +
      '你講話親切、像鄰居阿姨/年輕店員,愛分享洗衣小知識與客人趣事。',
    dailyConcerns: '換季送洗、汙漬急救、名牌衣物保養、羽絨被清洗、梅雨天曬不乾、洗衣標籤看不懂',
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
    'Facebook 貼文:當作寫一個真實故事,有場景、有人物、有轉折,引起共鳴。' +
    '嚴格限制 1000 字以內。開頭第一句要讓人想往下讀,結尾自然帶出品牌,不要硬置入。' +
    'Hashtag 最多 3 個放文末。',
  instagram:
    'Instagram 貼文:有趣、視覺先行,文案是圖片的延伸。結合近期時事哏,前 125 字要抓住重點(之後會被折疊)。' +
    '語氣輕鬆,可用 emoji 但別堆疊。Hashtag 5-10 個放文末。' +
    '同時你要為這篇貼文設計一張讓人覺得有趣、想停下來看的圖,提供圖片描述。',
  threads:
    'Threads 貼文:用很年輕世代的語氣(像大學生/新鮮人發廢文的節奏),短、口語、有記憶點,500 字以內,' +
    '最好 1-3 句就講完,可以自嘲、可以跟風目前的迷因與流行語,但不能尬。不放 hashtag 或最多 1 個。' +
    '目標是讓人想留言、想轉發。',
};

/** 避免 AI 腔的共同規則 */
export const ANTI_AI_RULES =
  '寫作鐵則(違反任何一條就重寫):' +
  '1. 禁用「在這個快節奏的時代」「隨著…的發展」「值得注意的是」這類 AI 陳腔濫調開頭。' +
  '2. 不要條列式教學文,除非平台特性需要。' +
  '3. 用台灣在地口語,像真人發文,可以有語助詞(啦、欸、吧)。' +
  '4. 具體勝過抽象:寫「上週有個房東半夜打來說熱水器爆了」而不是「我們提供全天候服務」。' +
  '5. 不要每句都完美通順,真人發文有節奏變化。' +
  '6. 絕對不捏造數據、優惠、法規;不確定的就不寫。';

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
  const [brandRows, personaRows, ruleRows, channelRows, keywordRows] = await Promise.all([
    sql`SELECT id, slug, name, tagline FROM brands WHERE id = ${brandId}::uuid LIMIT 1`,
    sql`SELECT name, age_range, profile, pain_points, appeal_angle FROM brand_personas WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 6`,
    sql`SELECT rule_type, statement, condition_note FROM brand_rules WHERE brand_id = ${brandId}::uuid ORDER BY sort_order LIMIT 30`,
    sql`SELECT platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max FROM brand_channels WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT category, value FROM brand_keywords WHERE brand_id = ${brandId}::uuid LIMIT 40`,
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

  const systemPrompt = [
    `品牌:${brand.name}${brand.tagline ? `(${brand.tagline})` : ''}`,
    '',
    voice.frontlinePersona,
    voice.dailyConcerns ? `這個行業每天在聊的話題:${voice.dailyConcerns}` : '',
    '',
    personas ? `目標受眾:\n${personas}` : '',
    rules ? `品牌規則(必須遵守,cannot_claim 與 negative_rule 絕對禁止觸犯):\n${rules}` : '',
    channels ? `各平台既有調性設定:\n${channels}` : '',
    keywords ? `品牌關鍵字/CTA 庫(自然使用,不要硬塞):${keywords}` : '',
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

export function buildPostUserPrompt(params: {
  platform: 'facebook' | 'instagram' | 'threads';
  topic: string;
  topicSummary?: string;
  extraInstruction?: string;
}): string {
  const guideline = PLATFORM_GUIDELINES[params.platform];
  return [
    `請針對以下主題,為 ${params.platform} 平台寫一篇貼文。`,
    `主題:${params.topic}`,
    params.topicSummary ? `主題背景:${params.topicSummary}` : '',
    '',
    guideline,
    params.extraInstruction ?? '',
    '',
    '回傳 JSON 物件,格式:',
    '{"title": "內部管理用標題", "body": "貼文全文", "hashtags": ["不含#的標籤"], "cta": "行動呼籲一句話", "imagePrompt": "若為 instagram 必填:給圖片生成模型的英文描述,風格有趣吸睛,不含文字"}',
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
