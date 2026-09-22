import type { R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DATABASE_URL: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  /** FIXERCOWORK 品牌限定登入(明文比對,僅存伺服器端) */
  FIXERCOWORK_USERNAME?: string;
  FIXERCOWORK_PASSWORD?: string;
  SESSION_SECRET?: string;
  /** OpenAI API key(文案與圖片生成) */
  OPENAI_API_KEY?: string;
  /** 選填:覆寫文字模型,預設 gpt-4o-mini */
  OPENAI_TEXT_MODEL?: string;
  /** 選填:覆寫圖片模型,預設 gpt-image-1 */
  OPENAI_IMAGE_MODEL?: string;
  /** ElevenLabs API key(Podcast 語音合成、Conversational AI) */
  ELEVENLABS_API_KEY?: string;
  /** Washgo 阿樂 Conversational Agent id */
  ELEVENLABS_WASHGO_AGENT_ID?: string;
  /** Homigo 小咪 Conversational Agent id(工作台品牌化後使用) */
  ELEVENLABS_HOMIGO_AGENT_ID?: string;
  /** TaskGo 阿豪 Conversational Agent id(工作台品牌化後使用) */
  ELEVENLABS_TASKGO_AGENT_ID?: string;
  /** 小編工作台 webhook tools 共用密鑰 */
  ELEVENLABS_TOOL_SECRET?: string;
  /** 選填:社群 token 加密金鑰,未設定則以 SESSION_SECRET 衍生 */
  TOKEN_ENCRYPTION_KEY?: string;
  /** 官網 ingest 金鑰備援（品牌智慧未填時仍可發布） */
  HOMIGO_INGEST_KEY?: string;
  TASKGO_INGEST_KEY?: string;
  WASHGO_INGEST_KEY?: string;
  /** X(Twitter) OAuth2 App 的 Client ID / Client Secret(Go 生態系共用帳號 token 續期用) */
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  /** R2 bucket:AI 生成圖片等媒體檔案 */
  MEDIA?: R2Bucket;
  /** 選填:站台公開網址(組媒體絕對 URL 給 Meta API 抓圖用),預設 Pages 網域 */
  PUBLIC_BASE_URL?: string;
  /** FIXERCOWORK 人脈 Bot(LINE Messaging API)。正式環境用 wrangler pages secret put */
  LINE_NETWORK_CHANNEL_SECRET?: string;
  LINE_NETWORK_CHANNEL_ACCESS_TOKEN?: string;
  /** 此 Bot 寫入的品牌 slug,預設 fixercowork */
  LINE_NETWORK_BRAND_SLUG?: string;
  /** GO 行銷中心管理者 Bot（審閱通知／成效查詢） */
  LINE_OPS_CHANNEL_SECRET?: string;
  LINE_OPS_CHANNEL_ACCESS_TOKEN?: string;
  LINE_OPS_ADD_FRIEND_URL?: string;
  /** Cesium ion token（場域地圖 3D；Community 方案僅限評估/非商用） */
  CESIUM_ION_TOKEN?: string;
}

export function getSessionSecret(env: Env): string {
  return env.SESSION_SECRET ?? `${env.ADMIN_PASSWORD}:gmc-session-v1`;
}

export function getTokenEncryptionSecret(env: Env): string {
  return env.TOKEN_ENCRYPTION_KEY ?? `${getSessionSecret(env)}:gmc-token-enc-v1`;
}
