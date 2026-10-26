import test from 'node:test';
import assert from 'node:assert/strict';
import {createDelivery} from '../delivery.mjs';
import {preparePayload,ApiError} from '../discord-service.mjs';
import actions from '../component-actions.cjs';
const G='11111111111111111',C='22222222222222222',M='33333333333333333',R='44444444444444444',BOT='55555555555555555';
function fixture(){
 const records=new Map(),posts=[];let savedPayload,failSave=false,failBind=false;
 const store={get:id=>records.get(id),reserve:entries=>{if(failSave)throw Error('disk full');for(const entry of entries)records.set(entry.customId,entry);},bind:(entries,g,c,m)=>{if(failBind)throw Error('disk full');for(const entry of entries)records.set(entry.customId,{...entry,messageId:m,channelId:c});}};
 const discord=async(env,url,init)=>{
  if(url==='/channels/'+C)return {id:C,guild_id:G,type:0};
  if(url==='/users/@me')return {id:BOT};
  if(init?.method==='POST'){savedPayload=JSON.parse(init.body);posts.push(savedPayload);return {id:M,channel_id:C,attachments:[]};}
  if(url===`/channels/${C}/messages/${M}`)return {id:M,channel_id:C,author:{id:BOT},...savedPayload};
  throw Error('Unexpected '+url);
 };
 const delivery=createDelivery({discord,preparePayload,requireGuild:async()=>{},ApiError,actions:{...actions,defaultStore:store}});
 const body={channel_id:C,request_id:'unique_request_1',payload:{content:'Choose',components:[{type:1,components:[0,1].map(()=>({type:2,style:1,label:'Role',custom_id:'same_imported_id',flow:{actions:[{type:3,roleId:R}]}}))}]}};
 return {delivery,body,records,posts,env:{DISCORD_TOKEN:'test-only-token'},setFailSave:v=>failSave=v,setFailBind:v=>failBind=v};
}
test('delivery registers flows before sending, strips metadata on the wire and binds returned message IDs',async()=>{
 const f=fixture();const result=await f.delivery.send(f.env,f.body);assert.equal(result.id,M);assert.equal(f.posts.length,1);assert.equal(f.records.size,2);
 const buttons=f.posts[0].components[0].components;assert.notEqual(buttons[0].custom_id,buttons[1].custom_id);assert.ok(buttons.every(b=>b.custom_id.startsWith('lds:action:')&&!b.flow));
 assert.ok([...f.records.values()].every(e=>e.guildId===G&&e.channelId===C&&e.messageId===M));
 const loaded=await f.delivery.load(f.env,C,M);assert.equal(loaded.payload.components[0].components[0].flow.actions[0].roleId,R);
});
test('durable registry failure and unsupported actions prevent Discord mutations',async()=>{
 const f=fixture();f.setFailSave(true);await assert.rejects(f.delivery.send(f.env,f.body));assert.equal(f.posts.length,0);
 f.setFailSave(false);f.body.payload.components[0].components[0].flow={actions:[{type:8,name:'unsupported'}]};await assert.rejects(f.delivery.send(f.env,f.body),/не поддерживается/);assert.equal(f.posts.length,0);
});
test('repeated concurrent action sends use one Discord mutation and the same registry identities',async()=>{
 const f=fixture();await Promise.all([f.delivery.send(f.env,f.body),f.delivery.send(f.env,f.body)]);assert.equal(f.posts.length,1);assert.equal(f.records.size,2);
});
test('failed binding after Discord send is reported as uncertain and does not duplicate on retry',async()=>{
 const f=fixture();f.setFailBind(true);await assert.rejects(f.delivery.send(f.env,f.body),e=>e.status===503&&e.extra.uncertain===true);assert.equal(f.posts.length,1);
 await assert.rejects(f.delivery.send(f.env,f.body));assert.equal(f.posts.length,1);assert.ok([...f.records.values()].every(e=>!e.messageId));
});
