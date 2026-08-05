// Vercel Serverless Function (ESM)：代理 GitHub OAuth Device Flow 的两个端点。
// 浏览器因 CORS 无法直接请求 github.com/login/device/code 与 /login/oauth/access_token，
// 改为请求同源的 /api/github?action=...，由本函数转发到 GitHub。
// Device Flow 不需要 client_secret，故本函数不存储任何密钥，仅做透传。

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // 鲁棒解析 action：优先 req.query，回退从 req.url 手动解析（兼容不同 Vercel runtime）
  let action = (req.query && req.query.action) || '';
  if (!action && req.url) {
    try { action = new URL(req.url, 'http://localhost').searchParams.get('action') || ''; } catch (e) {}
  }

  let upstreamUrl;
  if (action === 'device-code') {
    upstreamUrl = 'https://github.com/login/device/code';
  } else if (action === 'access-token') {
    upstreamUrl = 'https://github.com/login/oauth/access_token';
  } else {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unknown action. Use ?action=device-code or ?action=access-token' }));
    return;
  }

  // 读取原始请求体（Vercel 对 x-www-form-urlencoded 不会自动解析）
  let body = '';
  if (typeof req.body === 'string') {
    body = req.body;
  } else if (req.body && typeof req.body === 'object') {
    body = JSON.stringify(req.body);
  } else {
    try { for await (const chunk of req) body += chunk; } catch (e) { body = ''; }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(text);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Upstream request failed: ' + e.message }));
  }
}
