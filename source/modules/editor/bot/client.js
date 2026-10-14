'use strict';
const embeds = require('./embed-core.js');
function originOf(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw Error('Введите HTTPS-адрес API без пути и параметров.');
  return url.origin;
}
function botPayload(message) {
  if (message.username || message.avatar_url) throw Error('Имя и аватар сообщения меняются в режиме Webhook. Бот использует свой профиль.');
  if (message.files?.length) throw Error('Вложения отправляются в режиме Webhook. API LDS Bot пока поддерживает текст и embeds.');
  if (message.reference) throw Error('Редактирование отправленного сообщения доступно в режиме Webhook.');
  if (message.thread_name) throw Error('Для бота выберите существующую ветку по ID. Создание ветки доступно в режиме Webhook.');
  if (message.flags & 4096) throw Error('Тихая отправка доступна в режиме Webhook.');
  if (message.content?.length > 2000) throw Error('Content: максимум 2000 символов.');
  const result = {};
  if (message.content) result.content = message.content;
  const prepared = embeds.prepare(message.embeds || []);
  if (prepared.length) result.embeds = prepared;
  if (message.flags & 4) result.flags = 4;
  if (!result.content && !result.embeds) throw Error('Сообщение пустое.');
  return result;
}
class BotClient {
  constructor(fetchImpl = (...args) => fetch(...args), createId = () => crypto.randomUUID().replace(/-/g,'').slice(0,24)) {
    this.fetchImpl = fetchImpl; this.createId = createId; this.origin = ''; this.token = ''; this.batch = null;
  }
  async request(path, options = {}, session = false) {
    const headers = { 'Content-Type':'application/json', ...options.headers };
    if (!session) {
      if (!this.token) throw Error('Сначала подключите бота.');
      headers.Authorization = 'Bearer ' + this.token;
    }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),25000);
    let response;
    try { response = await this.fetchImpl(this.origin + path, { ...options, headers, credentials:'omit', cache:'no-store', signal:controller.signal }); }
    catch { throw Error('API не подтвердил запрос. Проверьте канал перед повтором; повтор сохраняет идентификатор отправки.'); }
    finally { clearTimeout(timer); }
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('По этому адресу нет API редактора.');
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) this.token = '';
      throw Error(data.error || 'Ошибка API (' + response.status + ')');
    }
    return data;
  }
  async connect(value, password) {
    this.origin = originOf(value);
    const data = await this.request('/api/session', {method:'POST',body:JSON.stringify({password})},true);
    if (!data.token || typeof data.token !== 'string') throw Error('API не вернул сессию.');
    this.token = data.token;
    return this.request('/api/discord/connection');
  }
  channels(guild) { return this.request('/api/discord/channels?guild_id=' + encodeURIComponent(guild)); }
  async send(messages, channel, pings, onProgress = (done, total) => {}) {
    if (!/^\d{17,20}$/.test(channel)) throw Error('Выберите канал или введите его ID.');
    if (!messages.length) throw Error('Добавьте сообщение.');
    const payloads = messages.map(botPayload);
    const key = JSON.stringify({payloads,channel,pings});
    if (!this.batch || this.batch.key !== key) this.batch = {key,items:payloads.map(payload => ({payload,id:this.createId(),result:null}))};
    for (let i=0;i<this.batch.items.length;i++) {
      const item = this.batch.items[i];
      if (!item.result) item.result = await this.request('/api/discord/messages', {method:'POST',body:JSON.stringify({channel_id:channel,payload:item.payload,pings:pings === true,request_id:item.id})});
      onProgress(i+1,this.batch.items.length);
    }
    const results=this.batch.items.map(item=>item.result); this.batch=null; return results;
  }
  async disconnect() {
    try { if(this.token) await this.request('/api/session',{method:'DELETE'}); }
    finally { this.token=''; this.origin=''; this.batch=null; }
  }
}
module.exports={BotClient,botPayload,originOf};
