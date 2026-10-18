'use strict';
const embeds = require('./embed-core.js');
const discordLogin = require('./oauth-browser.js');
const SESSION_KEY='lds-editor-session-v1';
function originOf(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw Error('Введите HTTPS-адрес API без пути и параметров.');
  return url.origin;
}
function botPayload(message) {
  if(message.files?.some(file=>!(file instanceof Blob)))throw Error('Файл недоступен. Выберите его заново.');
  if (message.username || message.avatar_url) throw Error('Имя и аватар сообщения меняются в режиме Webhook. Бот использует свой профиль.');
  if (message.content?.length > 2000) throw Error('Content: максимум 2000 символов.');
  const result = {};
  if (message.content) result.content = message.content;
  const prepared = embeds.prepare(message.embeds || []);
  if (prepared.length) result.embeds = prepared;
  if (message.components !== undefined) result.components=message.components;
  if (message.attachments !== undefined) result.attachments=message.attachments;
  if (message.thread_name) result.thread_name=message.thread_name;
  if (message.applied_tags) result.applied_tags=message.applied_tags;
  if (message.flags) result.flags=message.flags & (4|4096|32768);
  if (!result.content && !result.embeds && !result.components?.length && !message.files?.length && !message.attachments?.length) throw Error('Сообщение пустое.');
  return result;
}
function messageAddress(value,channel=''){
 if(/^\d{17,20}$/.test(value||'')&&/^\d{17,20}$/.test(channel))return {channel_id:channel,message_id:value};
 let url;try{url=new URL(value)}catch{throw Error('Укажите ссылку на сообщение Discord.')}
 const match=url.pathname.match(/^\/channels\/\d{17,20}\/(\d{17,20})\/(\d{17,20})\/?$/);
 if(url.protocol!=='https:'||!['discord.com','canary.discord.com','ptb.discord.com','discordapp.com'].includes(url.hostname)||!match)throw Error('Укажите ссылку на сообщение Discord.');
 return {channel_id:match[1],message_id:match[2]};
}
class BotClient {
  constructor(fetchImpl = (...args) => fetch(...args), createId = () => crypto.randomUUID().replace(/-/g,'').slice(0,24)) {
    this.fetchImpl = fetchImpl; this.createId = createId; this.origin = ''; this.token = ''; this.batch = null;
    this.store = null;
  }
  async request(path, options = {}, session = false) {
    const headers = { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...options.headers };
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
      if (response.status === 401) { this.token = '';this.clearSavedSession(); }
      throw Object.assign(Error(data.error || 'Ошибка API (' + response.status + ')'),{status:response.status});
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
  async startDiscord(value, returnUrl, store = sessionStorage) {
    this.origin=originOf(value);
    return discordLogin.begin((path,body)=>this.request(path,{method:'POST',body:JSON.stringify(body)},true),this.origin,returnUrl,store);
  }
  async finishDiscord(store = sessionStorage) {
    this.store=store;
    const result=discordLogin.takeResult(store);if(!result)return null;
    this.origin=originOf(result.api);
    const session=await this.request('/api/oauth/exchange',{method:'POST',body:JSON.stringify(result.body)},true);
    if(!session.token||typeof session.token!=='string')throw Error('API не вернул сессию.');
    this.token=session.token;
    this.saveSession(session,store);
    return {...await this.request('/api/discord/connection'),user:session.user};
  }
  saveSession(session,store) {
    if(!Number.isFinite(session.expires_at)||session.expires_at<=Date.now())return;
    try{store.setItem(SESSION_KEY,JSON.stringify({token:session.token,expiresAt:session.expires_at,api:this.origin}))}catch{}
  }
  clearSavedSession(){try{this.store?.removeItem(SESSION_KEY)}catch{}}
  async restoreSession(store=sessionStorage){
    this.store=store;let saved;
    try{saved=JSON.parse(store.getItem(SESSION_KEY)||'null')}catch{this.clearSavedSession();return null}
    if(!saved)return null;
    if(typeof saved.token!=='string'||saved.expiresAt<=Date.now()||!Number.isFinite(saved.expiresAt)){this.clearSavedSession();return null}
    try{this.origin=originOf(saved.api);this.token=saved.token;const session=await this.request('/api/session');return {...await this.request('/api/discord/connection'),user:session.user}}
    catch(error){if(error.status===401){this.token='';this.clearSavedSession();return null}throw error}
  }
  channels(guild) { return this.request('/api/discord/channels?guild_id=' + encodeURIComponent(guild)); }
  loadMessage(link){const address=messageAddress(link);return this.request('/api/discord/messages?'+new URLSearchParams(address))}
  async send(messages, channel, pings, onProgress = (done, total) => {}) {
    if (!/^\d{17,20}$/.test(channel)) throw Error('Выберите канал или введите его ID.');
    if (!messages.length) throw Error('Добавьте сообщение.');
    const payloads = messages.map(botPayload);
    const items=payloads.map((payload,i)=>{const message=messages[i],files=Array.from(message.files||[]);if(files.length>10||files.reduce((n,f)=>n+f.size,0)>24*1024**2)throw Error('Не более 10 файлов, суммарно до 24 МБ.');const address=message.reference?messageAddress(message.reference,channel):{channel_id:channel};if(address.channel_id!==channel)throw Error('Канал отправки не совпадает с каналом в Message Link.');return {payload,files,address}});
    const fingerprints=await Promise.all(items.map(async item=>Promise.all(item.files.map(async file=>{if(!(file instanceof Blob))throw Error('Файл недоступен. Выберите его заново.');const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [file.name,file.size,Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')]}))));
    const key = JSON.stringify({payloads,channel,pings,addresses:items.map(item=>item.address),files:fingerprints});
    if (!this.batch || this.batch.key !== key) this.batch = {key,items:items.map(item => ({...item,id:this.createId(),result:null}))};
    for (let i=0;i<this.batch.items.length;i++) {
      const item = this.batch.items[i];
      if (!item.result) {const data={...item.address,payload:item.payload,pings:pings === true,request_id:item.id};let body=JSON.stringify(data);if(item.files.length){body=new FormData();body.set('payload_json',JSON.stringify(data));item.files.forEach((file,index)=>body.set(`files[${index}]`,file,file.name))}item.result = await this.request('/api/discord/messages', {method:'POST',body});}
      onProgress(i+1,this.batch.items.length);
    }
    const results=this.batch.items.map(item=>item.result); this.batch=null; return results;
  }
  async disconnect() {
    try { if(this.token) await this.request('/api/session',{method:'DELETE'}); }
    finally { this.token=''; this.origin=''; this.batch=null;this.clearSavedSession(); }
  }
}
module.exports={BotClient,botPayload,originOf,messageAddress};
