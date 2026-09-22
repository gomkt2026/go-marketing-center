export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** 熱路徑 GET 失敗時一定回 { error }，避免 Cloudflare 空 500 被前端顯示成「伺服器忙碌」 */
export function failLoad(label: string, err: unknown): Response {
  console.error(`[${label}]`, err);
  const msg = err instanceof Error ? err.message : String(err);
  const busy = /timeout|timed out|subrequest|1101|1102|overload|too many|connection/i.test(msg);
  return error(
    busy ? `伺服器忙碌，請再試一次（${label}）` : `${label} 載入失敗：${msg.slice(0, 180)}`,
    500,
  );
}
