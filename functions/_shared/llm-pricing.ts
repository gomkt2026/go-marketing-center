/** 每百萬 token 的美元牌價。未知模型沿用 Haiku，避免成本顯示成 0。 */
const TEXT_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-6.1-sol': { input: 1.25, output: 10 },
};

/** 一張圖的估計美元。圖像 API 不回 token。 */
export const IMAGE_USD = 0.04;

export function textCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = TEXT_USD_PER_MILLION[model] ?? { input: 1, output: 5 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function imageCostUsd(imageCount: number): number {
  return imageCount * IMAGE_USD;
}

export function twdRate(env: { USD_TWD_RATE?: string }): number {
  const rate = Number(env.USD_TWD_RATE);
  return Number.isFinite(rate) && rate > 0 ? rate : 32;
}
