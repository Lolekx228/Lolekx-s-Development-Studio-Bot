const test=require('node:test'),assert=require('node:assert/strict'),{BotClient}=require('./client.cjs');
function storage(){const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),get size(){return map.size}}}
const response=(data,status=200)=>({ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>data});
test('Reload restores session only after API verification; logout clears saved credentials',async()=>{
 const store=storage(),calls=[];const user={id:'919815468519391252',name:'Owner'};
 const fetcher=async(url,init)=>{calls.push({url,init});return response(url.endsWith('/api/session')?{user}:{bot:{name:'LDS'},guilds:[]})};
 const first=new BotClient(fetcher);first.origin='https://api.example.test';first.store=store;first.token='fixture-session';first.saveSession({token:first.token,expires_at:Date.now()+3600000},store);
 const reloaded=new BotClient(fetcher);const data=await reloaded.restoreSession(store);assert.equal(data.user.id,user.id);assert.equal(reloaded.token,'fixture-session');assert.equal(calls[0].url,'https://api.example.test/api/session');assert.equal(calls[0].init.headers.Authorization,'Bearer fixture-session');
 await reloaded.disconnect();assert.equal(store.size,0);assert.equal(reloaded.token,'');assert.equal(calls.at(-1).init.method,'DELETE');
});
test('Revoked, expired and malformed sessions cannot restore login',async()=>{
 const store=storage();store.setItem('lds-editor-session-v1',JSON.stringify({api:'https://api.example.test',token:'old',expiresAt:Date.now()+60000}));
 const client=new BotClient(async()=>response({error:'expired'},401));assert.equal(await client.restoreSession(store),null);assert.equal(store.size,0);
 store.setItem('lds-editor-session-v1',JSON.stringify({token:'old',expiresAt:Date.now()-1}));assert.equal(await client.restoreSession(store),null);assert.equal(store.size,0);
 store.setItem('lds-editor-session-v1','bad json');assert.equal(await client.restoreSession(store),null);assert.equal(store.size,0);
});
test('Temporary network failure preserves session for retry',async()=>{
 const store=storage();store.setItem('lds-editor-session-v1',JSON.stringify({api:'https://api.example.test',token:'fixture',expiresAt:Date.now()+60000}));
 const client=new BotClient(async()=>{throw Error('offline')});await assert.rejects(client.restoreSession(store));assert.equal(store.size,1);
});
