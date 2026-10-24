import type { Env } from './env';
import { getSql } from './db';
import { buildBrandContext } from './prompts';
import { findBrandAgent, generatePostFromImage, saveGeneratedContent, type SocialPlatform } from './generate';
import { brandHasSlotContent, slotAtToday } from './threads-slots';
import { getMetaAccount } from './meta';
import { getThreadsAccount } from './threads';
import { toPublicMediaUrl } from './media';
import { logActivity } from './activity';
import {
  ensureSystemShortAssets, shortsForBrand, systemShortPrompt, type SystemShort,
} from './system-shorts';

/**
 * 每天的系統短影片檔：TaskGo、Washgo 各輪播一支短片，FB 發粉專影片、IG 發 Reels、Threads 附影片。
 * 同一天三個平台用同一支，隔天換下一支（最久沒發的先發）。
 */
export const SYSTEM_SHORT_SOURCE = 'system_short';

export const SYSTEM_SHORT_SLOTS: { platform: Extract<SocialPlatform, 'facebook' | 'instagram' | 'threads'>; hourTw: number }[] = [
  { platform: 'threads', hourTw: 15 },
  { platform: 'facebook', hourTw: 20 },
  { platform: 'instagram', hourTw: 20 },
];

export function hasSystemShorts(slug: string): boolean {
  return shortsForBrand(slug).length > 0;
}

/** 今天已經選過的那支；沒有就挑最久沒發的（沒發過的照集數先後） */
async function pickShortForDay(env: Env, brandId: string, slug: string, slotAt: Date): Promise<SystemShort> {
  const shorts = shortsForBrand(slug);
  const sql = getSql(env);
  const dayStart = slotAtToday(0, slotAt);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const rows = await sql`
    SELECT generation_prompt_meta->>'shortId' AS short_id,
           max((generation_prompt_meta->>'slotAt')::timestamptz) AS last_at
    FROM contents
    WHERE brand_id = ${brandId}::uuid
      AND generation_prompt_meta->>'source' = ${SYSTEM_SHORT_SOURCE}
      AND generation_prompt_meta->>'shortId' IS NOT NULL
    GROUP BY 1
  ` as { short_id: string; last_at: string | Date }[];
  const lastAt = new Map(rows.map((r) => [r.short_id, new Date(r.last_at).getTime()]));
  const today = shorts.find((s) => {
    const t = lastAt.get(s.id);
    return t !== undefined && t >= dayStart.getTime() && t < dayEnd.getTime();
  });
  if (today) return today;
  return [...shorts].sort((a, b) => (lastAt.get(a.id) ?? 0) - (lastAt.get(b.id) ?? 0))[0];
}

async function findStillAssetId(env: Env, brandId: string, slug: string, stillId: string): Promise<string | null> {
  const sql = getSql(env);
  const key = `go-short:${slug}:still:${stillId}`;
  const lookup = async () => {
    const rows = await sql`
      SELECT id FROM brand_assets
      WHERE brand_id = ${brandId}::uuid AND metadata->>'filmKey' = ${key}
      LIMIT 1
    `;
    return (rows[0] as { id?: string } | undefined)?.id ?? null;
  };
  const found = await lookup();
  if (found) return found;
  await ensureSystemShortAssets(env, slug);
  return lookup();
}

async function autoPublishOn(env: Env, brandId: string, platform: 'facebook' | 'instagram' | 'threads'): Promise<boolean> {
  if (platform === 'threads') return !!(await getThreadsAccount(env, brandId))?.autoPublish;
  return !!(await getMetaAccount(env, brandId, platform))?.autoPublish;
}

const PLATFORM_HINT: Record<'facebook' | 'instagram' | 'threads', string> = {
  facebook: 'FB 粉專影片的說明文字：開頭一句痛點，接著三到四個系統重點，最後一句收尾。',
  instagram: 'IG Reels 的說明：第一行就是痛點鉤子，讓人停下來看完影片；條列功能，hashtag 放最後。',
  threads: 'Threads 附影片：口語、像老闆在聊天，五行內，不用條列、不放 hashtag。',
};

/** 產一則短影片貼文並排程。已經有這一檔就跳過。回傳 contentId。 */
export async function generateSystemShortSlot(
  env: Env,
  params: { slug: string; platform: 'facebook' | 'instagram' | 'threads'; slotAt: Date },
): Promise<string | null> {
  const { slug, platform, slotAt } = params;
  if (!hasSystemShorts(slug)) return null;
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
  const brandId = (brands[0] as { id?: string } | undefined)?.id;
  if (!brandId) return null;
  if (await brandHasSlotContent(env, brandId, platform, SYSTEM_SHORT_SOURCE, slotAt)) return null;

  const short = await pickShortForDay(env, brandId, slug, slotAt);
  const still = short.stills[0];
  const assetId = await findStillAssetId(env, brandId, slug, still.id);
  const imageUrl = toPublicMediaUrl(env, still.file);
  if (!assetId || !imageUrl) throw new Error(`${slug} 短影片素材還沒寫進素材庫`);

  const brandCtx = await buildBrandContext(env, brandId);
  const agentId = await findBrandAgent(env, brandId);
  const result = await generatePostFromImage(env, {
    brandCtx,
    platform,
    imageUrl,
    caption: still.caption,
    imageCategory: 'system_screenshot',
    assetName: `系統短影片｜${short.feature}｜${still.tag}`,
    assetRole: short.role,
    feature: short.feature,
    usageContext: still.label,
    audienceLane: 'b2b',
    assetId,
    extraInstruction: `${systemShortPrompt(short)}\n${PLATFORM_HINT[platform]}`,
    skipPrediction: true,
  });

  const willAutoPublish = await autoPublishOn(env, brandId, platform);
  const { contentId, versionId } = await saveGeneratedContent(env, {
    brandCtx,
    platform,
    result,
    generatedByAgentId: agentId,
    status: willAutoPublish ? 'scheduled' : 'pending_review',
    promptMeta: {
      source: SYSTEM_SHORT_SOURCE,
      shortId: short.id,
      slotAt: slotAt.toISOString(),
      assetId,
      audienceLane: 'b2b',
      audienceName: result.audienceName,
    },
    imageAssetMeta: { sourceAssetId: assetId, generated: false, reused: true },
  });

  if (willAutoPublish) {
    await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (${contentId}::uuid, ${versionId}::uuid, ${platform}, 'scheduled', ${slotAt.toISOString()}::timestamptz)
    `;
  }
  await logActivity(env, {
    brandId,
    actorType: 'ai_agent',
    actorAgentId: agentId,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { platform, source: SYSTEM_SHORT_SOURCE, shortId: short.id, scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
  });
  console.log(`[shorts] ${slug}/${platform} 排定 ${short.feature} 短影片 ${slotAt.toISOString()}（${willAutoPublish ? '自動' : '待審核'}）`);
  return contentId;
}

/** 今天已到生成時間、還沒產的短影片檔，補一則。leadHours 前就可以先產。 */
export async function catchupSystemShortSlot(env: Env, slug: string, leadHours: number, now = new Date()): Promise<boolean> {
  if (!hasSystemShorts(slug)) return false;
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
  const brandId = (brands[0] as { id?: string } | undefined)?.id;
  if (!brandId) return false;
  for (const slot of SYSTEM_SHORT_SLOTS) {
    const slotAt = slotAtToday(slot.hourTw, now);
    if (now.getTime() < slotAt.getTime() - leadHours * 60 * 60 * 1000) continue;
    if (await brandHasSlotContent(env, brandId, slot.platform, SYSTEM_SHORT_SOURCE, slotAt)) continue;
    if (await generateSystemShortSlot(env, { slug, platform: slot.platform, slotAt })) return true;
  }
  return false;
}
