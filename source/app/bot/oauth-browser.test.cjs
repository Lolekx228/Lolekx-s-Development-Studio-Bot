const test=require('node:test'),assert=require('node:assert/strict');
const flow=require('./oauth-browser.cjs'),{BotClient}=require('./client.cjs');
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),get size(){return map.size}}}
function response(data){return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data}}
const site='https://lolekx228.github.io/Lolekx-s-Development-Studio-Bot/';
test('Discord redirect preserves draft, binds browser proof and persists a bounded editor session',async()=>{
 const store=storage(),calls=[];const client=new BotClient(async(url,init)=>{calls.push({url,init});if(url.endsWith('/start'))return response({url:'https://discord.com/oauth2/authorize?state=fixture-state',state:'fixture-state',expires_at:Date.now()+300000});if(url.endsWith('/exchange'))return response({token:'fixture-editor-session',expires_at:Date.now()+3600000,user:{id:'919815468519391252',name:'Owner'}});return response({bot:{name:'LDS'},guilds:[]})});
 const authorize=await client.startDiscord('https://api.example.test',site+'?data=fixture-draft',store);assert.ok(authorize.startsWith('https://discord.com/'));const proof=JSON.parse(calls[0].init.body).proof;assert.equal(proof.length,64);
 const target=flow.returnToEditor(site+'oauth-return.html#state=fixture-state&code=fixture-handoff',store);assert.equal(target,site+'?data=fixture-draft');const data=await client.finishDiscord(store);assert.equal(data.user.name,'Owner');assert.equal(client.token,'fixture-editor-session');assert.equal(store.size,1);assert.equal(store.getItem('lds-discord-login-v1'),null);assert.equal(store.getItem('lds-discord-result-v1'),null);assert.equal(JSON.parse(store.getItem('lds-editor-session-v1')).token,'fixture-editor-session');assert.equal(JSON.parse(calls[1].init.body).proof,proof);assert.equal(calls[2].init.headers.Authorization,'Bearer fixture-editor-session');
});
test('malicious redirect, mismatched state and denied account do not finish login',async()=>{
 const store=storage();await assert.rejects(flow.begin(async()=>({url:'https://evil.example/',state:'bad'}),'https://api.example.test',site,store));assert.equal(store.size,0);
 await flow.begin(async()=>({url:'https://discord.com/oauth2/authorize?state=good',state:'good',expires_at:Date.now()+300000}),'https://api.example.test',site,store);
 assert.throws(()=>flow.returnToEditor(site+'oauth-return.html#state=bad&code=fake',store));
 flow.returnToEditor(site+'oauth-return.html#state=good&error=unauthorized',store);assert.throws(()=>flow.takeResult(store),/не разрешена/);assert.equal(store.size,0);
});
test('expired flow and cross-origin return draft rejected',async()=>{
 const store=storage();store.setItem('lds-discord-login-v1',JSON.stringify({state:'good',expiresAt:Date.now()-1,returnUrl:site}));assert.throws(()=>flow.returnToEditor(site+'oauth-return.html#state=good&code=fake',store));
 store.setItem('lds-discord-login-v1',JSON.stringify({state:'good',expiresAt:Date.now()+300000,returnUrl:'https://evil.example/'}));assert.throws(()=>flow.returnToEditor(site+'oauth-return.html#state=good&code=fake',store));
});
