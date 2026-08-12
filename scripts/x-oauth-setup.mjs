// 一次性腳本:走一遍 X(Twitter) OAuth 2.0 Authorization Code + PKCE 流程,
// 取得「Go 生態系」共用 X 帳號(@inforcraftgo)的 access_token / refresh_token。
//
// 事前準備(在 developer.x.com / console.x.com 的 App 設定完成):
//   1. App 的 User authentication settings 開啟 OAuth 2.0
//      - App permissions: Read and write
//      - Type of App: Web App, Automated App or Bot(= Confidential client)
//      - Callback URI / Redirect URL 加入: http://127.0.0.1:8787/callback
//      - Website URL: 任填一個品牌網址即可
//   2. 在 .env 補上這兩行(從 App 的 Keys and tokens 分頁取得):
//        X_CLIENT_ID=xxxxx
//        X_CLIENT_SECRET=xxxxx
//   3. 用瀏覽器登入 X 且目前帳號就是要授權的那個(如 @inforcraftgo)
//
// 用法: node scripts/x-oauth-setup.mjs
// 跑完後把印出的 access_token / refresh_token 貼到「品牌合作」頁面的
// 「Go 生態系」X 帳號設定區塊,按「測試連線」。
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';

const PORT = 8787;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
// media.write 是上傳配圖(POST /2/media/upload)必須的 scope,tweet.write 本身不夠
const SCOPES = 'tweet.read tweet.write users.read offline.access media.write';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const clientId = envText.match(/^X_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const clientSecret = envText.match(/^X_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
if (!clientId || !clientSecret) {
  throw new Error('請先在 .env 補上 X_CLIENT_ID 和 X_CLIENT_SECRET(從 X App 的 Keys and tokens 分頁取得)');
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const codeVerifier = base64url(randomBytes(48));
const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
const state = base64url(randomBytes(16));

const authUrl = new URL('https://x.com/i/oauth2/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<h2>授權失敗:${error || '缺少 code'}</h2>`);
    console.error('❌ 授權失敗:', error || '缺少 code 參數');
    server.close();
    return;
  }
  if (returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>state 不一致,可能是 CSRF,已中止</h2>');
    console.error('❌ state 不一致,已中止');
    server.close();
    return;
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: clientId,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`換取 token 失敗 (${tokenRes.status}): ${text}`);
    }
    const tokenData = await tokenRes.json();

    const meRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = meRes.ok ? (await meRes.json()).data : null;

    console.log('\n✅ 授權成功!請把以下內容貼到「品牌合作」頁面的「Go 生態系」X 帳號設定區塊:\n');
    if (me) console.log(`X 帳號 handle: @${me.username}(id: ${me.id})`);
    console.log(`access_token:  ${tokenData.access_token}`);
    console.log(`refresh_token: ${tokenData.refresh_token}`);
    console.log(`\n(access_token ${tokenData.expires_in} 秒後過期沒關係,系統會用 refresh_token 自動續期)\n`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<h2>✅ 授權成功!回到終端機複製 token,可以關閉這個分頁了。</h2>'
    );
  } catch (e) {
    console.error('❌', e.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<h2>失敗:${e.message}</h2>`);
  } finally {
    setTimeout(() => server.close(), 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('請用「已登入目標 X 帳號(如 @inforcraftgo)」的瀏覽器分頁打開以下連結授權:\n');
  console.log(authUrl.toString());
  console.log(`\n正在等待 http://127.0.0.1:${PORT}/callback 的回呼...(不要關閉這個終端機)\n`);

  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} "${authUrl.toString()}"`, () => {});
});
