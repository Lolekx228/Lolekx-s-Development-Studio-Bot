'use strict';
const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const SESSION_MS = 4 * 60 * 60 * 1000;
function hash(value) { return createHash('sha256').update(value).digest(); }
function reply(res, status, value, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', Vary: 'Origin' };
  if (origin) { headers['access-control-allow-origin'] = origin; headers['access-control-allow-methods'] = 'GET, POST, DELETE, OPTIONS'; headers['access-control-allow-headers'] = 'Authorization, Content-Type'; headers['access-control-max-age'] = '600'; }
  res.writeHead(status, headers); res.end(status === 204 ? undefined : JSON.stringify(value));
}
async function readBody(req) {
  const chunks = []; let size = 0, tooLarge = false;
  for await (const chunk of req) { size += chunk.length; if (size > 16000) { tooLarge = true; continue; } chunks.push(chunk); }
  if (tooLarge) { const e = Error('Запрос слишком большой.'); e.status = 413; throw e; }
  return Buffer.concat(chunks).toString('utf8');
}
async function createHandler(options = {}) {
  const settings = options.env || process.env;
  const password = settings.EDITOR_ACCESS_PASSWORD || '';
  if (password.length < 20) throw Error('Задайте EDITOR_ACCESS_PASSWORD длиной не менее 20 символов на хостинге бота.');
  if (!settings.DISCORD_TOKEN) throw Error('DISCORD_TOKEN отсутствует в окружении бота.');
  let origin;
  try { const url = new URL(settings.EDITOR_ALLOWED_ORIGIN); if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw Error(); origin = url.origin; } catch { throw Error('Задайте EDITOR_ALLOWED_ORIGIN: HTTPS-адрес сайта, например https://username.github.io (без пути репозитория).'); }
  const service = options.handleDiscord || (await import(pathToFileURL(path.join(__dirname, 'discord-service.mjs')).href)).handleDiscord;
  const env = { DISCORD_TOKEN: settings.DISCORD_TOKEN, DISCORD_GUILD_ID: settings.GUILD_ID || settings.DISCORD_GUILD_ID, SITE_ORIGIN: origin };
  const sessions = new Map(); const expectedPassword = hash(password); let failedAttempts = 0, resetAt = Date.now() + 60000;
  const cleanup = setInterval(() => { const now = Date.now(); for (const [key, value] of sessions) if (value < now) sessions.delete(key); }, 60000); cleanup.unref();
  const handler = async (req, res) => {
    let requestOrigin = req.headers.origin, corsOrigin = requestOrigin === origin ? origin : undefined;
    try {
      if (requestOrigin && requestOrigin !== origin) return reply(res, 403, { error: 'Этот сайт не имеет доступа к боту.' });
      if (req.method === 'OPTIONS') return reply(res, 204, undefined, corsOrigin);
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return reply(res, 200, { ok: true }, corsOrigin);
      if (url.pathname === '/api/session' && req.method === 'POST') {
        if (requestOrigin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(res, 403, { error: 'Неверный источник запроса.' }, corsOrigin);
        if (Date.now() > resetAt) { resetAt = Date.now() + 60000; failedAttempts = 0; }
        if (failedAttempts >= 5) return reply(res, 429, { error: 'Слишком много попыток входа. Повторите через минуту.' }, corsOrigin);
        let input; try { input = JSON.parse(await readBody(req)); } catch (e) { return reply(res, e.status || 400, { error: 'Неверный запрос входа.' }, corsOrigin); }
        if (typeof input.password !== 'string' || !timingSafeEqual(hash(input.password), expectedPassword)) { failedAttempts++; return reply(res, 401, { error: 'Неверный пароль редактора.' }, corsOrigin); }
        const now = Date.now(); for (const [key, value] of sessions) if (value < now) sessions.delete(key);
        if (sessions.size >= 100) return reply(res, 429, { error: 'Слишком много активных сессий.' }, corsOrigin);
        const token = randomBytes(32).toString('base64url'), expiresAt = now + SESSION_MS; sessions.set(token, expiresAt); return reply(res, 200, { token, expires_at: expiresAt }, corsOrigin);
      }
      const bearer = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace(/^Bearer /, '') : '';
      if (!bearer || (sessions.get(bearer) || 0) <= Date.now()) { sessions.delete(bearer); return reply(res, 401, { error: 'Войдите по паролю редактора.' }, corsOrigin); }
      if (url.pathname === '/api/session' && req.method === 'DELETE') { sessions.delete(bearer); return reply(res, 200, { ok: true }, corsOrigin); }
      if (!url.pathname.startsWith('/api/discord/')) return reply(res, 404, { error: 'Маршрут не найден.' }, corsOrigin);
      if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { error: 'Метод не поддерживается.' }, corsOrigin);
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const headers = new Headers(); if (requestOrigin) headers.set('origin', requestOrigin); if (req.headers['content-type']) headers.set('content-type', req.headers['content-type']);
      const request = new Request('https://backend.invalid' + url.pathname + url.search, { method: req.method, headers, body });
      const result = await service(request, env, { authenticated: true });
      const payload = await result.json(); reply(res, result.status, payload, corsOrigin);
    } catch (e) { reply(res, e.status || 500, { error: e.status === 413 ? e.message : 'Не удалось обработать запрос.' }, corsOrigin); }
  };
  handler.dispose = () => { clearInterval(cleanup); sessions.clear(); };
  return handler;
}
async function createServer(options = {}) {
  const handler = await createHandler(options);
  const server = http.createServer(handler);
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.on('close', handler.dispose);
  return server;
}
let handlerPromise;
function getHandler() {
  if (!handlerPromise) handlerPromise = createHandler().catch(error => { handlerPromise = undefined; throw error; });
  return handlerPromise;
}
async function start(options = {}) {
  const settings = options.env || process.env;
  const port = Number(settings.EDITOR_PORT || settings.SERVER_PORT || settings.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Неверный EDITOR_PORT. Используйте выделенный порт Wispbyte.');
  const server = await createServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  console.log('[LDS EDITOR] API запущен на порту ' + port + '. Пароль и токен в лог не выводятся.');
  return server;
}
module.exports = { createServer, createHandler, getHandler, start };
if (require.main === module) start().catch(e => { console.error('[LDS EDITOR] ' + e.message); process.exitCode = 1; });
