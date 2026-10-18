import {createDelivery} from './delivery.mjs';
import embedCore from './embed-core.cjs';
const API = 'https://discord.com/api/v10';

const SNOWFLAKE = /^\d{17,20}$/;
const SITE_ORIGIN = ''; // Origin задаётся в окружении Wispbyte.
export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
function json(data, status = 200) { return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
export function authorize(user, env) {
  if (user?.authenticated !== true) throw new ApiError(401, 'Войдите в редактор через Discord.');
  if (!env.DISCORD_TOKEN) throw new ApiError(503, 'Токен бота не настроен на хостинге.');
}
async function discord(env, path, init = {}) {
  let response;
  try { response = await fetch(API + path, { ...init, headers: { Authorization: 'Bot ' + env.DISCORD_TOKEN, ...(init.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), 'User-Agent': 'DiscordBot (https://github.com/Lolekx228, 1.0)', ...init.headers }, signal: AbortSignal.timeout(25000) }); }
  catch { throw new ApiError(502, init.method === 'POST' ? 'Discord не подтвердил отправку. Проверьте канал или повторите запрос: повтор использует тот же идентификатор сообщения.' : 'Не удалось связаться с Discord. Попробуйте ещё раз.', { uncertain: init.method === 'POST' }); }
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  if (response.status === 429) throw new ApiError(429, 'Discord ограничил частоту запросов. Подождите и повторите.', { retry_after: Math.ceil(Number(data.retry_after) || 5) });
  if (response.status === 401) throw new ApiError(503, 'Discord отклонил токен бота. Нужно обновить серверный секрет DISCORD_TOKEN.');
  if (response.status === 403) throw new ApiError(403, 'У бота нет доступа или права отправлять сообщения в этот канал. Проверьте View Channel и Send Messages (для веток — Send Messages in Threads).');
  if (response.status === 404) throw new ApiError(404, 'Сервер или канал не найден либо недоступен боту.');
  if (response.status === 400) throw new ApiError(400, 'Discord отклонил формат сообщения. Проверьте блоки и параметры JSON.', { discord_code: data.code || null });
  throw new ApiError(502, 'Ошибка на стороне Discord. Попробуйте позднее.', { uncertain: init.method === 'POST' && response.status >= 500 });
}
async function guilds(env) {
  if (env.DISCORD_GUILD_ID) { const g = await discord(env, '/guilds/' + env.DISCORD_GUILD_ID); return [{ id: g.id, name: g.name }]; }
  const list = await discord(env, '/users/@me/guilds?limit=200'); return list.map(g => ({ id: g.id, name: g.name }));
}
async function requireGuild(env, guildId) {
  if (!SNOWFLAKE.test(guildId || '')) throw new ApiError(400, 'Неверный ID сервера.');
  if (env.DISCORD_GUILD_ID) { if (guildId !== env.DISCORD_GUILD_ID) throw new ApiError(403, 'Этот сервер не подключён к сайту.'); return; }
  if (!(await guilds(env)).some(g => g.id === guildId)) throw new ApiError(403, 'Бот не подключён к этому серверу.');
}
function permissions(channel, guildId, roles, member, botId) {
  let value = BigInt(roles.find(r => r.id === guildId)?.permissions || '0');
  for (const r of roles) if (member.roles.includes(r.id)) value |= BigInt(r.permissions);
  if (value & 8n) return (1n << 64n) - 1n;
  const apply = o => { value &= ~BigInt(o.deny || '0'); value |= BigInt(o.allow || '0'); };
  const overwrites = channel.permission_overwrites || [];
  const everyone = overwrites.find(o => o.id === guildId); if (everyone) apply(everyone);
  let deny = 0n, allow = 0n;
  for (const o of overwrites) if (o.type === 0 && member.roles.includes(o.id)) { deny |= BigInt(o.deny || '0'); allow |= BigInt(o.allow || '0'); }
  value = (value & ~deny) | allow;
  const personal = overwrites.find(o => o.type === 1 && o.id === botId); if (personal) apply(personal);
  if (member.communication_disabled_until && Date.parse(member.communication_disabled_until) > Date.now()) value &= ~(2048n | (1n << 38n));
  return value;
}
async function channels(env, guildId) {
  await requireGuild(env, guildId);
  const bot = await discord(env, '/users/@me');
  const [all, roles, member] = await Promise.all([discord(env, '/guilds/' + guildId + '/channels'), discord(env, '/guilds/' + guildId + '/roles'), discord(env, '/guilds/' + guildId + '/members/' + bot.id)]);
  return all.filter(c => [0, 2, 5, 15, 16].includes(c.type)).filter(c => { const p = permissions(c, guildId, roles, member, bot.id); return !!(p & 1024n) && !!(p & 2048n); }).sort((a, b) => (a.position || 0) - (b.position || 0)).map(c => ({ id: c.id, name: c.name, type: c.type, category: all.find(parent => parent.id === c.parent_id)?.name || '' }));
}
function webUrl(value) { if (typeof value !== 'string') return false; try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } }
function cleanText(value, max, label) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, label + ': пустое значение или превышен лимит ' + max + '.'); return value.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere'); }
export function preparePayload(input, pings = false, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Нужен JSON-объект сообщения.');
  if (JSON.stringify(input).length > 64000) throw new ApiError(400, 'JSON превышает 64000 символов.');
  if(input.username||input.avatar_url)throw new ApiError(400,'Имя и аватар отдельного сообщения меняются в режиме Webhook.');
  let count = 0, totalText = 0, v2 = false; const customIds = new Set();
  function customId(c) { if (typeof c.custom_id !== 'string' || !c.custom_id || c.custom_id.length > 100 || customIds.has(c.custom_id)) throw new ApiError(400, 'Custom ID должен быть уникальной строкой до 100 символов.'); customIds.add(c.custom_id); return c.custom_id; }
  function emoji(e) { if (!e || typeof e !== 'object') return undefined; const out = {}; if (e.id && SNOWFLAKE.test(String(e.id))) out.id = String(e.id); if (typeof e.name === 'string') out.name = e.name.slice(0, 100); if (e.animated) out.animated = true; return Object.keys(out).length ? out : undefined; }
  function component(c, parent = 0, depth = 0) {
    if (++count > 40 || depth > 8) throw new ApiError(400, 'Максимум 40 компонентов, включая вложенные.');
    if (!c || typeof c !== 'object' || !Number.isInteger(c.type)) throw new ApiError(400, 'Неверный компонент.');
    const t = c.type;
    const allowed = parent === 0 ? [1, 9, 10, 12, 14, 17] : parent === 17 ? [1, 9, 10, 12, 14] : parent === 1 ? [2, 3, 5, 6, 7, 8] : parent === 9 ? [10] : parent === 99 ? [2, 11] : [];
    if (!allowed.includes(t)) throw new ApiError(400, 'Недопустимое размещение компонента type:' + t + '.');
    if ([9, 10, 11, 12, 14, 17].includes(t)) v2 = true;
    const out = { type: t };
    if ([1, 9, 17].includes(t)) {
      if (!Array.isArray(c.components) || !c.components.length) throw new ApiError(400, 'Контейнер, ряд или секция пусты.');
      if (t === 1 && (c.components.length > 5 || (c.components.some(x => x.type !== 2) && c.components.length !== 1))) throw new ApiError(400, 'Ряд содержит максимум 5 кнопок или одно меню.');
      if (t === 9 && c.components.length > 3) throw new ApiError(400, 'В секции максимум 3 текстовых блока.');
      out.components = c.components.map(child => component(child, t, depth + 1));
      if (t === 9) { if (!c.accessory) throw new ApiError(400, 'Секции нужна кнопка или миниатюра.'); out.accessory = component(c.accessory, 99, depth + 1); }
      if (t === 17) { if (c.accent_color !== undefined) { if (!Number.isInteger(c.accent_color) || c.accent_color < 0 || c.accent_color > 16777215) throw new ApiError(400, 'Неверный цвет контейнера.'); out.accent_color = c.accent_color; } if (c.spoiler) out.spoiler = true; }
    }
    if (t === 10) { out.content = cleanText(c.content, 4000, 'Текст'); totalText += c.content.length; }
    if (t === 14) { out.divider = c.divider !== false; out.spacing = c.spacing === 2 ? 2 : 1; }
    if (t === 2) {
      if (![1, 2, 3, 4, 5].includes(c.style)) throw new ApiError(400, 'Неверный стиль кнопки.'); out.style = c.style;
      if (c.label) out.label = cleanText(c.label, 80, 'Название кнопки'); if (c.emoji) out.emoji = emoji(c.emoji);
      if (!out.label && !out.emoji) throw new ApiError(400, 'Кнопке нужно название или эмодзи.');
      if (c.style === 5) { if (!webUrl(c.url)) throw new ApiError(400, 'Кнопке нужен HTTP(S) URL.'); out.url = c.url; } else out.custom_id = customId(c);
      if (c.disabled) out.disabled = true;
    }
    if (t === 11) { if (!webUrl(c.media?.url)) throw new ApiError(400, 'Миниатюре нужен HTTP(S) URL.'); out.media = { url: c.media.url }; if (c.description) out.description = cleanText(c.description, 1024, 'Описание'); if (c.spoiler) out.spoiler = true; }
    if (t === 12) {
      if (!Array.isArray(c.items) || !c.items.length || c.items.length > 10) throw new ApiError(400, 'Галерея содержит от 1 до 10 изображений.');
      out.items = c.items.map(item => { if (!webUrl(item?.media?.url)) throw new ApiError(400, 'Изображению нужен HTTP(S) URL.'); const result = { media: { url: item.media.url } }; if (item.description) result.description = cleanText(item.description, 1024, 'Описание изображения'); if (item.spoiler) result.spoiler = true; return result; });
    }
    if ([3, 5, 6, 7, 8].includes(t)) {
      out.custom_id = customId(c); if (c.placeholder) out.placeholder = cleanText(c.placeholder, 150, 'Подсказка меню');
      const min = c.min_values ?? 1, max = c.max_values ?? 1;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 25 || min > max) throw new ApiError(400, 'Неверный диапазон выбора меню.'); out.min_values = min; out.max_values = max; if (c.disabled) out.disabled = true;
      if (t === 3) { if (!Array.isArray(c.options) || !c.options.length || c.options.length > 25 || max > c.options.length) throw new ApiError(400, 'Неверное количество вариантов меню.'); const values = new Set(); out.options = c.options.map(o => { const option = { label: cleanText(o.label, 100, 'Название варианта'), value: cleanText(o.value, 100, 'Значение варианта') }; if (values.has(option.value)) throw new ApiError(400, 'Значения вариантов меню должны быть уникальными.'); values.add(option.value); if (o.description) option.description = cleanText(o.description, 100, 'Описание варианта'); if (o.emoji) option.emoji = emoji(o.emoji); if (o.default) option.default = true; return option; }); }
      if (t === 8 && Array.isArray(c.channel_types)) out.channel_types = c.channel_types.filter(Number.isInteger);
    }
    return out;
  }
  const out = { allowed_mentions: { parse: pings === true ? ['users', 'roles'] : [], replied_user: false } };
  if (input.components !== undefined) { if (!Array.isArray(input.components)) throw new ApiError(400, 'components должен быть массивом.'); out.components = input.components.map(c => component(c)); }
  if (input.content !== undefined && input.content !== '') out.content = cleanText(input.content, 2000, 'Сообщение');
  if(input.embeds!==undefined){try{const embeds=embedCore.prepare(input.embeds);if(embeds.length)out.embeds=embeds;}catch(error){throw new ApiError(400,error.message)}}
  if(out.embeds?.length&&(v2||(Number(input.flags)&32768)))throw new ApiError(400,'Embeds нельзя смешивать с Components V2.');
  if(!v2&&out.components?.length>5)throw new ApiError(400,'Максимум 5 рядов компонентов в обычном сообщении.');
  if (!out.content && !out.components?.length && !out.embeds?.length && !options.hasFiles && !input.attachments?.length) throw new ApiError(400, 'Сообщение пустое.');
  if ((v2 || (Number(input.flags)&32768)) && out.content) throw new ApiError(400, 'Перенесите content в текстовый блок Components V2.');
  if (totalText > 4000) throw new ApiError(400, 'Текст компонентов превышает 4000 символов.');
  const flags = (v2 || (Number(input.flags)&32768) ? 32768 : 0) | (Number(input.flags) & (4|4096)); if (flags) out.flags = flags;
  return out;
}
const delivery=createDelivery({discord,preparePayload,requireGuild,ApiError});
export async function handleDiscord(request, env, user) {
  try {
    authorize(user, env);
    const url = new URL(request.url), path = url.pathname.replace(/^\/api\/discord/, '');
    if (request.method === 'GET' && path === '/connection') { const [bot, servers] = await Promise.all([discord(env, '/users/@me'), guilds(env)]); return json({ bot: { id: bot.id, name: bot.global_name || bot.username }, guilds: servers }); }
    if (request.method === 'GET' && path === '/channels') return json({ channels: await channels(env, url.searchParams.get('guild_id')) });
    if(request.method==='GET'&&path==='/messages')return json(await delivery.load(env,url.searchParams.get('channel_id'),url.searchParams.get('message_id')));
    if(request.method==='POST'&&path==='/messages'){
      if(request.headers.get('origin')!==(env.SITE_ORIGIN||SITE_ORIGIN))throw new ApiError(403,'Неверный источник запроса.');
      const {body,files}=await delivery.read(request);return json(await delivery.send(env,body,files));
    }
    return json({ error: 'Маршрут не найден.' }, 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, ...e.extra }, e.status);
    return json({ error: 'Ошибка обработки сообщения. Проверьте JSON и повторите.' }, 500);
  }
}
