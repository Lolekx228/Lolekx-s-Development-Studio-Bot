(function(root){
  'use strict';
  const PENDING='lds-discord-login-v1',RESULT='lds-discord-result-v1';
  const messages={access_denied:'Вход отменён в Discord.',unauthorized:'Этому аккаунту не разрешена отправка через LDS Bot.',oauth_failed:'Discord не подтвердил вход. Проверьте настройки OAuth на Wispbyte.'};
  function clear(store){store.removeItem(PENDING);store.removeItem(RESULT)}
  async function begin(call,api,returnUrl,store,cryptoImpl=crypto){
    const proof=Array.from(cryptoImpl.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    const data=await call('/api/oauth/start',{proof});
    const authorize=new URL(data.url);
    if(authorize.protocol!=='https:'||authorize.hostname!=='discord.com'||authorize.pathname!=='/oauth2/authorize'||authorize.username||authorize.password||typeof data.state!=='string'||authorize.searchParams.get('state')!==data.state)throw Error('API вернул неверный адрес авторизации.');
    clear(store);store.setItem(PENDING,JSON.stringify({proof,state:data.state,api,returnUrl,expiresAt:Math.min(Number(data.expires_at)||0,Date.now()+300000)}));
    return authorize.href;
  }
  function returnToEditor(href,store){
    const current=new URL(href),params=new URLSearchParams(current.hash.slice(1));let pending;
    try{pending=JSON.parse(store.getItem(PENDING)||'null')}catch{}
    if(!pending||pending.state!==params.get('state')||pending.expiresAt<=Date.now())throw Error('Запрос входа не принадлежит этому браузеру или истёк. Вернитесь в редактор и войдите снова.');
    const target=new URL(pending.returnUrl),base=current.pathname.slice(0,current.pathname.lastIndexOf('/')+1);
    if(target.origin!==current.origin||!target.pathname.startsWith(base)||target.pathname===current.pathname||target.username||target.password)throw Error('Неверный адрес возврата.');
    const result={state:pending.state,code:params.get('code'),error:params.get('error')};
    if(!result.code&&!result.error)throw Error('Discord не вернул результат входа.');
    store.setItem(RESULT,JSON.stringify(result));return target.href;
  }
  function takeResult(store){
    if(!store.getItem(RESULT))return null;
    let pending,result;try{pending=JSON.parse(store.getItem(PENDING)||'null');result=JSON.parse(store.getItem(RESULT))}catch{clear(store);throw Error('Начните вход через Discord заново.')}
    clear(store);
    if(!pending||pending.state!==result.state||pending.expiresAt<=Date.now())throw Error('Запрос входа истёк. Войдите через Discord заново.');
    if(result.error)throw Error(messages[result.error]||messages.oauth_failed);
    return {api:pending.api,body:{code:result.code,state:pending.state,proof:pending.proof}};
  }
  const api={begin,returnToEditor,takeResult,clear};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LDSDiscordLogin=api;
})(typeof globalThis!=='undefined'?globalThis:this);
