const test=require('node:test'),assert=require('node:assert/strict');
const {BotClient,botPayload,originOf}=require('./client.js');
function response(data,status=200){return {ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>data}}
test('API origin and payload prevent unsupported silent loss',()=>{
  assert.equal(originOf('https://api.example.test/'),'https://api.example.test');
  for(const value of ['http://api.example.test','https://a:b@api.example.test','https://api.example.test/path'])assert.throws(()=>originOf(value));
  assert.deepEqual(botPayload({content:null,embeds:[{title:'Welcome'}]}),{embeds:[{title:'Welcome'}]});
  for(const value of [{content:'x',files:[{}]},{content:'x',reference:'123'},{content:'x',thread_name:'New'},{content:'x',flags:4096},{content:'x',username:'Custom'}])assert.throws(()=>botPayload(value));
});
test('password login, bearer API, logout revoke, no password in messages',async()=>{
  const requests=[];
  const client=new BotClient(async(url,init)=>{requests.push({url,init});if(url.endsWith('/api/session')&&init.method==='POST')return response({token:'fixture-session'});if(url.endsWith('/connection'))return response({bot:{name:'LDS'},guilds:[]});return response({ok:true})});
  await client.connect('https://api.example.test','fixture-password');assert.equal(client.token,'fixture-session');
  await client.channels('123');assert.equal(requests[2].init.headers.Authorization,'Bearer fixture-session');assert.ok(!requests[2].init.body);
  await client.disconnect();assert.equal(requests[3].init.method,'DELETE');assert.equal(client.token,'');
});
test('all messages validated before sends; partial batch retry skips successful and reuses nonce',async()=>{
  const requests=[];let fail=true,n=0;
  const client=new BotClient(async(url,init)=>{const body=JSON.parse(init.body);requests.push(body);if(body.payload.content==='second'&&fail){fail=false;throw Error('timeout')}return response({url:'https://discord.com/channels/1/2/3'})},()=>String(++n));client.token='session';client.origin='https://api.example.test';
  await assert.rejects(client.send([{content:'first'},{content:'x',files:[{}]}],'12345678901234567',false));assert.equal(requests.length,0);
  const messages=[{content:'first'},{content:'second'}];
  await assert.rejects(client.send(messages,'12345678901234567',false));
  await client.send(messages,'12345678901234567',false);
  assert.equal(requests.length,3);assert.equal(requests[1].request_id,requests[2].request_id);assert.equal(requests[0].pings,false);
});
test('expired session clears bearer token',async()=>{
  const client=new BotClient(async()=>response({error:'expired'},401));client.token='old';client.origin='https://api.example.test';
  await assert.rejects(client.channels('123'),/expired/);assert.equal(client.token,'');
});
