'use strict';
let connected = false, sending = false, guildLoad = 0, pendingSend = null;
let sessionToken = '', apiOrigin = '';
const sendButton = $('#sendMessage');
function sendDestination() { const manual = $('#channelId').value.trim(); return manual || $('#channelSelect').value; }
function syncSendButton() { sendButton.disabled = sending || !connected || dirty || !/^\d{17,20}$/.test(sendDestination()); const options=document.getElementById('sendOptions');if(options)options.hidden=!connected;document.querySelector('.send-heading').hidden=!connected;document.getElementById('connectionStatus').hidden=!connected; }
function sendResult(message, isError = false) { const result = $('#sendResult'); result.textContent = message; result.classList.toggle('send-error', isError); }
async function api(path, options = {}) {
  if (!sessionToken || !apiOrigin) throw Error('Сначала войдите через Discord.');
  let response;
  try { response = await fetch(apiOrigin + '/api/discord' + path, { ...options, headers: { ...(typeof options.body==='string'?{'Content-Type':'application/json'}:{}), ...options.headers, Authorization: 'Bearer ' + sessionToken }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(25000) }); }
  catch { const e = Error('API бота не отвечает. Проверьте HTTPS-адрес, доступность Wispbyte и EDITOR_ALLOWED_ORIGIN.'); e.uncertain = options.method === 'POST'; throw e; }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('По этому адресу нет API редактора. Проверьте адрес хостинга бота.');
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) logoutLocal(); const error = Error(data.error || 'Ошибка API бота.'); error.uncertain = data.uncertain; error.retryAfter = data.retry_after; throw error; }
  return data;
}
async function loadChannels() {
  const sequence = ++guildLoad, guild = $('#guildSelect').value;
  $('#channelSelect').innerHTML = '<option value="">Загрузка каналов…</option>'; $('#channelSelect').disabled = true; $('#channelId').value = ''; syncSendButton();
  if (!guild) { $('#channelSelect').innerHTML = '<option value="">Сначала выберите сервер</option>'; return; }
  try { const data = await api('/channels?guild_id=' + encodeURIComponent(guild)); if (sequence !== guildLoad) return;
    $('#channelSelect').innerHTML = '<option value="">Выберите канал</option>' + data.channels.map(c => `<option value="${esc(c.id)}">${esc((c.type === 2 ? '◖ ' : '# ') + c.name + (c.category ? ' · ' + c.category : ''))}</option>`).join('');
    $('#channelSelect').disabled = false; sendResult(data.channels.length ? 'Сообщение будет отправлено в выбранный канал от имени бота.' : 'Нет каналов с правами отправки. Проверьте права бота или укажите ID доступной ветки.', !data.channels.length);
  } catch (e) { if (sequence !== guildLoad) return; $('#channelSelect').innerHTML = '<option value="">Не удалось загрузить каналы</option>'; sendResult(e.message, true); }
  syncSendButton();
}
async function loadConnection() {
  connected = false; $('#connectionStatus').textContent = 'Подключаем бота…'; $('#reloadChannels').disabled = true; syncSendButton();
  if (location.protocol === 'file:') { $('#connectionStatus').textContent = 'Отправка работает на размещённом сайте'; $('#reloadChannels').disabled = false; return; }
  try { const data = await api('/connection'); connected = true; $('#connectionStatus').textContent = '● Подключён: ' + data.bot.name; $('.meta strong').textContent = data.bot.name;
    $('#guildSelect').innerHTML = (data.guilds.length === 1 ? '' : '<option value="">Выберите сервер</option>') + data.guilds.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join(''); $('#guildSelect').disabled = false;
    if (!data.guilds.length) sendResult('Бот не подключён ни к одному доступному серверу.', true); else await loadChannels();
  } catch (e) { $('#connectionStatus').textContent = 'Бот не подключён'; sendResult(e.message, true); }
  $('#reloadChannels').disabled = false; syncSendButton();
}
$('#guildSelect').onchange = loadChannels; $('#channelSelect').onchange = () => { $('#channelId').value = ''; syncSendButton(); }; $('#channelId').oninput = syncSendButton; $('#reloadChannels').onclick = () => connected && $('#guildSelect').value ? loadChannels() : loadConnection();
new MutationObserver(syncSendButton).observe($('#copy'), { attributes: true, attributeFilter: ['disabled'] });
sendButton.onclick = async () => {
  syncSendButton(); if (sendButton.disabled) return;
  const body = { channel_id: sendDestination(), payload: payloadForExport(), pings: $('#allowPings').checked };
  const key = JSON.stringify(body);
  if (!pendingSend || pendingSend.key !== key) { pendingSend = { key, id: crypto.randomUUID().replace(/-/g, '').slice(0, 24) }; }
  body.request_id = pendingSend.id; sending = true; sendButton.textContent = 'Отправляем…'; syncSendButton(); sendResult('Ждём подтверждение Discord…');
  try { const data = await api('/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const url = safeUrl(data.url); $('#sendResult').classList.remove('send-error'); $('#sendResult').innerHTML = '✓ Сообщение отправлено. ' + (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Открыть в Discord ↗</a>` : ''); pendingSend = null; toast('Сообщение отправлено в Discord');
  } catch (e) { sendResult(e.message + (e.retryAfter ? ' Повторите через ' + e.retryAfter + ' сек.' : '') + (e.uncertain ? ' Не создавайте новый запрос, пока не проверите канал.' : ''), true); }
  finally { sending = false; sendButton.textContent = 'Отправить в Discord ↗'; syncSendButton(); }
};

function logoutLocal() {
  sessionToken = ''; connected = false; apiOrigin = '';
  sessionStorage.removeItem('lds-editor-session-v1');$('#accountUser').hidden=true;
  $('#backendUrl').disabled = false; 
  $('#connectBackend').hidden = false; $('#disconnectBackend').hidden = true;
  $('#guildSelect').disabled = true; $('#channelSelect').disabled = true; $('#connectionStatus').textContent = 'Войдите через Discord для отправки'; syncSendButton();
}
function backendOrigin(value) {
  const url = new URL(value); const local = ['localhost', '127.0.0.1'].includes(location.hostname) && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw Error('Укажите HTTPS-адрес API без пути, логина и параметров.');
  return url.origin;
}
$('#backendUrl').value = window.LDS_CONFIG?.apiUrl || '';
$('#connectBackend').onclick = async () => {
  const button=$('#connectBackend');button.disabled=true;
  try {
    if(dirty)throw Error('Сначала примените изменения JSON.');
    const origin=backendOrigin($('#backendUrl').value.trim());
    const target=await LDSDiscordLogin.begin(async(path,body)=>{
      const response=await fetch(origin+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Error('По этому адресу нет API редактора.');
      const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось начать вход.');return data;
    },origin,location.origin+location.pathname,sessionStorage);
    location.assign(target);
  }catch(error){sendResult(error.message,true)}finally{button.disabled=false}
};

$('#disconnectBackend').onclick = () => {
  if (sessionToken && apiOrigin) fetch(apiOrigin + '/api/session', { method: 'DELETE', credentials: 'omit', headers: { Authorization: 'Bearer ' + sessionToken } }).catch(() => {});
  logoutLocal(); sendResult('Вы вышли. Редактор и экспорт JSON продолжают работать.');
};
$('#reloadChannels').onclick = () => { if (!sessionToken) { sendResult('Сначала подключитесь к API бота.', true); return; } return connected && $('#guildSelect').value ? loadChannels() : loadConnection(); };
sendResult('Редактор работает без подключения. Для отправки войдите через Discord.');
syncSendButton();

(async()=>{
  const button=$('#connectBackend');button.disabled=true;
  try{
    const result=LDSDiscordLogin.takeResult(sessionStorage);
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem('lds-editor-session-v1')||'null')}catch{sessionStorage.removeItem('lds-editor-session-v1')}
    if(!result&&(!saved||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now())){sessionStorage.removeItem('lds-editor-session-v1');return}
    const origin=backendOrigin(result?result.api:saved.api);
    const response=await fetch(origin+(result?'/api/oauth/exchange':'/api/session'),{method:result?'POST':'GET',credentials:'omit',headers:result?{'Content-Type':'application/json'}:{Authorization:'Bearer '+saved.token},body:result?JSON.stringify(result.body):undefined,signal:AbortSignal.timeout(15000)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('По этому адресу нет API редактора.');
    const data=await response.json();if(!response.ok){if(response.status===401)sessionStorage.removeItem('lds-editor-session-v1');throw Error(data.error||'Вход не подтверждён.')}
    const token=result?data.token:saved.token;if(typeof token!=='string'||!token)throw Error('Сессия не подтверждена.');
    if(result)sessionStorage.setItem('lds-editor-session-v1',JSON.stringify({token,api:origin,expiresAt:data.expires_at}));
    apiOrigin=origin;sessionToken=token;$('#backendUrl').value=origin;$('#backendUrl').disabled=true;$('#connectBackend').hidden=true;$('#disconnectBackend').hidden=false;
    $('#accountUser').textContent=(data.user?.name||'Аккаунт')+' ✓';$('#accountUser').hidden=false;
    await loadConnection();
  }catch(error){sendResult(error.message,true)}finally{button.disabled=false}
})();
