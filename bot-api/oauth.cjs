'use strict';
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const TTL=5*60*1000, HANDOFF_TTL=60*1000;
const digest=value=>createHash('sha256').update(value).digest();
const validProof=value=>typeof value==='string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
function configure(settings,origin) {
  const clientId=settings.DISCORD_CLIENT_ID||settings.CLIENT_ID;
  const secret=settings.DISCORD_CLIENT_SECRET;
  const allowed=new Set([settings.OWNER_USER_ID,...(settings.EDITOR_ALLOWED_USER_IDS||'').split(',')].map(s=>s?.trim()).filter(Boolean));
  if(!/^\d{17,20}$/.test(clientId||'')||!secret||!allowed.size||[...allowed].some(id=>!/^\d{17,20}$/.test(id)))throw Error('Для входа Discord задайте CLIENT_ID, DISCORD_CLIENT_SECRET и OWNER_USER_ID на Wispbyte.');
  let api,site;
  try{
    api=new URL(settings.EDITOR_PUBLIC_URL);site=new URL(settings.EDITOR_SITE_URL);
    if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||api.pathname!=='/'||site.protocol!=='https:'||site.origin!==origin||site.username||site.password||site.search||site.hash||!site.pathname.endsWith('/'))throw Error();
  }catch{throw Error('Проверьте EDITOR_PUBLIC_URL (HTTPS API без пути) и EDITOR_SITE_URL (полный адрес сайта с / в конце).');}
  return {clientId,secret,allowed,callback:new URL('/api/oauth/callback',api).href,returnUrl:new URL('oauth-return.html',site).href};
}
function createOAuth(settings,origin,fetchImpl=fetch) {
  const config=configure(settings,origin),pending=new Map(),handoffs=new Map();let attempts=0,resetAt=Date.now()+60000;
  function cleanup(){const now=Date.now();for(const map of [pending,handoffs])for(const [key,item] of map)if(item.expiresAt<=now)map.delete(key);}
  function start(proof){
    if(!validProof(proof))throw Object.assign(Error('Неверный запрос входа.'),{status:400});
    cleanup();if(Date.now()>=resetAt){attempts=0;resetAt=Date.now()+60000}
    if(pending.size+handoffs.size>=100||++attempts>20)throw Object.assign(Error('Слишком много попыток входа. Повторите через минуту.'),{status:429});
    const state=randomBytes(32).toString('base64url');pending.set(state,{proof:digest(proof),expiresAt:Date.now()+TTL});
    const authorize=new URL('https://discord.com/oauth2/authorize');
    authorize.search=new URLSearchParams({client_id:config.clientId,response_type:'code',scope:'identify',state,redirect_uri:config.callback}).toString();
    return {url:authorize.href,state,expires_at:Date.now()+TTL};
  }
  function redirect(state,fields){const url=new URL(config.returnUrl);url.hash=new URLSearchParams({state,...fields}).toString();return url.href;}
  async function callback(url){
    cleanup();const state=url.searchParams.get('state'),transaction=pending.get(state);
    if(!transaction)throw Object.assign(Error('Запрос входа истёк или уже использован. Начните вход с сайта.'),{status:400});
    pending.delete(state);
    if(url.searchParams.has('error'))return redirect(state,{error:'access_denied'});
    const code=url.searchParams.get('code');if(!code||code.length>2048)return redirect(state,{error:'oauth_failed'});
    let token;
    try{
      const tokenResponse=await fetchImpl('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.secret,grant_type:'authorization_code',code,redirect_uri:config.callback}).toString(),signal:AbortSignal.timeout(15000)});
      if(!tokenResponse.ok)throw Error();const tokens=await tokenResponse.json();token=tokens.access_token;if(typeof token!=='string'||!token)throw Error();
      const profileResponse=await fetchImpl('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
      if(!profileResponse.ok)throw Error();const profile=await profileResponse.json();
      if(!config.allowed.has(profile.id))return redirect(state,{error:'unauthorized'});
      const handoff=randomBytes(32).toString('base64url');handoffs.set(handoff,{state,proof:transaction.proof,expiresAt:Date.now()+HANDOFF_TTL,user:{id:profile.id,name:profile.global_name||profile.username||profile.id}});
      return redirect(state,{code:handoff});
    }catch{return redirect(state,{error:'oauth_failed'});}
    finally{
      // Only identify is needed. Do not persist Discord access/refresh tokens.
      if(token)try{await fetchImpl('https://discord.com/api/oauth2/token/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.secret,token,token_type_hint:'access_token'}).toString(),signal:AbortSignal.timeout(5000)})}catch{}
    }
  }
  function exchange(input){
    cleanup();const item=handoffs.get(input?.code);
    if(!item||item.state!==input.state||!validProof(input.proof)||!timingSafeEqual(item.proof,digest(input.proof)))throw Object.assign(Error('Вход не подтверждён этим браузером или ссылка истекла. Начните вход заново.'),{status:401});
    handoffs.delete(input.code);return item.user;
  }
  return {start,callback,exchange,cleanup,dispose(){pending.clear();handoffs.clear()}};
}
module.exports={createOAuth,configure};
