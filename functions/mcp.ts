import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './_shared/env';
import {
  allowMcpCall,
  authenticateMcp,
  logMcpCall,
  readMcpToken,
  touchMcpKey,
} from './_shared/mcp-auth';
import { MCP_TOOLS, callMcpTool } from './_shared/mcp-tools';

const PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);

const INSTRUCTIONS = [
  '你是 Go Marketing 的行銷連接器。用繁體中文，只根據工具回傳的資料回答，不要編造數字、媒體名或優惠。',
  '討論接下來發什麼、成效、想法時，先讀行程與成效。',
  '圖片用 save_image_asset 存進指定品牌的素材庫。要掛到已經存在或已排程的貼文，用 attach_post_image，不要另開新稿。影片用 create_video_upload 拿上傳網址。',
  '使用者沒有明確說要發或排程時，不可呼叫 schedule_post 的 mode=publish。',
  '三品牌總覽只用 get_portfolio，範圍是 TaskGo、Homigo、Washgo。寫入時必須指名品牌。',
].join('');

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'content-type, authorization, x-api-key, mcp-protocol-version, mcp-session-id');
  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  headers.set('Access-Control-Expose-Headers', 'mcp-session-id');
  return new Response(response.body, { status: response.status, headers });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return cors(new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }));
}

function toolResponse(payload: unknown, isError: boolean) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text: text.length > 12_000 ? `${text.slice(0, 12_000)}\n…` : text }],
    isError,
  };
}

function negotiate(version: unknown): string {
  return typeof version === 'string' && PROTOCOL_VERSIONS.has(version) ? version : '2025-03-26';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (request.method === 'GET') return rpcError(null, -32000, '這支 MCP 用 POST', 405);
  if (request.method !== 'POST') return rpcError(null, -32000, '只接受 POST', 405);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, 'JSON 無法解析', 400);
  }

  let principal;
  try {
    principal = await authenticateMcp(env, readMcpToken(request));
  } catch (e) {
    console.error('[mcp] 金鑰驗證失敗', e);
    return rpcError(null, -32603, 'MCP 暫時無法驗證金鑰', 500);
  }
  if (!principal) return rpcError(null, -32001, '需要有效的 x-api-key', 401);

  const origin = new URL(request.url).origin;
  const batch = Array.isArray(body);
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      responses.push({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '無效的請求' } });
      continue;
    }
    const record = message as { id?: unknown; method?: unknown; params?: unknown };
    const id = record.id ?? null;
    const method = typeof record.method === 'string' ? record.method : '';
    const isNotification = !Object.prototype.hasOwnProperty.call(record, 'id');
    if (!method) {
      if (!isNotification) responses.push({ jsonrpc: '2.0', id, error: { code: -32600, message: '缺少 method' } });
      continue;
    }

    try {
      if (method === 'initialize') {
        const params = (record.params ?? {}) as { protocolVersion?: unknown };
        await touchMcpKey(env, principal.keyId);
        const result = {
          protocolVersion: negotiate(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'go-marketing', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        };
        if (!isNotification) responses.push({ jsonrpc: '2.0', id, result });
        continue;
      }
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') continue;
      if (method === 'ping') {
        if (!isNotification) responses.push({ jsonrpc: '2.0', id, result: {} });
        continue;
      }
      if (method === 'tools/list') {
        if (!isNotification) responses.push({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
        continue;
      }
      if (method === 'resources/list' || method === 'prompts/list') {
        const key = method === 'resources/list' ? 'resources' : 'prompts';
        if (!isNotification) responses.push({ jsonrpc: '2.0', id, result: { [key]: [] } });
        continue;
      }
      if (method === 'tools/call') {
        const params = (record.params ?? {}) as { name?: unknown; arguments?: unknown; args?: unknown };
        const toolName = typeof params.name === 'string' ? params.name : '';
        const rawArgs = params.arguments ?? params.args ?? {};
        const toolArgs = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
          ? rawArgs as Record<string, unknown>
          : {};
        if (!toolName) {
          if (!isNotification) responses.push({ jsonrpc: '2.0', id, error: { code: -32602, message: '缺少工具名稱' } });
          continue;
        }
        if (!(await allowMcpCall(env, principal.keyId))) {
          await logMcpCall(env, principal.keyId, toolName, null, false);
          if (!isNotification) {
            responses.push({
              jsonrpc: '2.0',
              id,
              result: toolResponse({ error: '這把金鑰這一分鐘的呼叫太多，請稍後再試。' }, true),
            });
          }
          continue;
        }
        await touchMcpKey(env, principal.keyId);
        const outcome = await callMcpTool(env, principal.user, principal.keyId, toolName, toolArgs, origin);
        await logMcpCall(env, principal.keyId, toolName, outcome.brandSlug, outcome.ok);
        if (!isNotification) responses.push({ jsonrpc: '2.0', id, result: toolResponse(outcome.payload, !outcome.ok) });
        continue;
      }
      if (!isNotification) responses.push({ jsonrpc: '2.0', id, error: { code: -32601, message: `不支援 ${method}` } });
    } catch (e) {
      console.error('[mcp]', method, e);
      if (!isNotification) responses.push({ jsonrpc: '2.0', id, error: { code: -32603, message: 'MCP 暫時無法完成' } });
    }
  }

  if (!responses.length) return cors(new Response(null, { status: 202 }));
  return cors(new Response(JSON.stringify(batch ? responses : responses[0]), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }));
};
