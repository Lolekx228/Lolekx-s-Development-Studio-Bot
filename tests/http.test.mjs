import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{createServer}=require('../bot-api/server.cjs');
const origin='https://lolekx228.github.io',password='test-fixture-password-123456789';
test('Wispbyte API: origin, login, session, oversized request, protected API and logout',async()=>{
 let forwarded=0;const server=await createServer({env:{EDITOR_ACCESS_PASSWORD:password,EDITOR_ALLOWED_ORIGIN:origin,DISCORD_TOKEN:'fixture-not-real'},handleDiscord:async(request,env,user)=>{forwarded++;assert.equal(user.authenticated,true);assert.equal(env.SITE_ORIGIN,origin);return Response.json({ok:true});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,method='GET',body,token,source=origin){const headers={Origin:source};if(body)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;return fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined})}
 try{
  let r=await call('/healthz');assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  r=await call('/api/discord/connection');assert.equal(r.status,401);assert.equal(forwarded,0);
  r=await call('/api/session','OPTIONS');assert.equal(r.status,204);assert.ok(r.headers.get('access-control-allow-headers').includes('Authorization'));
  r=await call('/api/session','POST',{password},undefined,'https://evil.example');assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
  r=await call('/api/session','POST',{password:'wrong'});assert.equal(r.status,401);
  r=await call('/api/session','POST',{password:'a'.repeat(18000)});assert.equal(r.status,413);
  r=await call('/api/session','POST',{password});assert.equal(r.status,200);const session=await r.json();assert.ok(session.token.length>=40);
  r=await call('/api/discord/connection','GET',undefined,session.token);assert.equal(r.status,200);assert.equal(forwarded,1);
  r=await call('/api/discord/messages','POST',{content:'x'},session.token,'https://evil.example');assert.equal(r.status,403);assert.equal(forwarded,1);
  r=await call('/api/session','DELETE',undefined,session.token);assert.equal(r.status,200);
  r=await call('/api/discord/connection','GET',undefined,session.token);assert.equal(r.status,401);assert.equal(forwarded,1);
 }finally{await new Promise(r=>server.close(r));server.closeAllConnections()}
});
test('API refuses missing or weak configuration',async()=>{await assert.rejects(createServer({env:{EDITOR_ACCESS_PASSWORD:'short'}}));await assert.rejects(createServer({env:{EDITOR_ACCESS_PASSWORD:password,DISCORD_TOKEN:'fixture',EDITOR_ALLOWED_ORIGIN:'http://evil.example'}}));});
