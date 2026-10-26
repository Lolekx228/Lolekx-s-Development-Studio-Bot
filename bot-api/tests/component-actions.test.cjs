const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createActionStore,materialize,restoreFlows,createInteractionHandler,validateFlow,PREFIX}=require('../component-actions.cjs');
const G='11111111111111111',C='22222222222222222',M='33333333333333333',U='44444444444444444',A='55555555555555555',B='66666666666666666';
function fixture(flow={actions:[{type:3,roleId:A},{type:4,roleId:B},{type:12,message:{content:'{user}, готово!'},flags:64}]}){
 const ops=[],replies=[],defs=[],warnings=[],entries=new Map(),id=PREFIX+'test';let n=0;
 const entry={customId:id,guildId:G,channelId:C,messageId:M,flow};entries.set(id,entry);
 const member={roles:{cache:new Map([[B,{}]]),add:async r=>ops.push(['add',r]),remove:async r=>ops.push(['remove',r])}};
 const guild={id:G,members:{fetch:async()=>member,fetchMe:async()=>({permissions:{has:()=>true}})},roles:{fetch:async r=>({id:r,managed:false,editable:true})}};
 const store={get:id=>entries.get(id)},handler=createInteractionHandler({store,logger:{warn:m=>warnings.push(m)}});
 const interaction=(values)=>({id:'interaction-'+(++n),customId:id,guild,guildId:G,channelId:C,user:{id:U,username:'Foxik'},message:{id:M},values,isButton:()=>!values,isAnySelectMenu:()=>!!values,isStringSelectMenu:()=>!!values,
 deferReply:async d=>defs.push(d),editReply:async r=>replies.push(r),reply:async r=>replies.push(r),followUp:async r=>replies.push(r),deferred:true});
 return {handler,interaction,ops,replies,defs,warnings,member,guild,entry,entries,store};
}
test('materializes deterministic scoped IDs, including section accessories and select options',()=>{
 const raw=[{type:9,components:[{type:10,content:'Hi'}],accessory:{type:2,style:1,custom_id:'old',flow:{actions:[{type:3,roleId:A}]}}},{type:1,components:[{type:3,custom_id:'menu',options:[{label:'A',value:'a'}],flows:{a:{actions:[{type:12,message:{content:'Choice {values}'}}]}}}]}];
 const wire=structuredClone(raw),context={guildId:G,channelId:C,requestId:'unique_request_1'};
 const entries=materialize(raw,wire,context),again=materialize(raw,structuredClone(raw),context);assert.deepEqual(entries,again);assert.equal(entries.length,2);assert.ok(wire[0].accessory.custom_id.startsWith(PREFIX));assert.notEqual(wire[0].accessory.custom_id,wire[1].components[0].custom_id);assert.equal(raw[0].accessory.custom_id,'old');
});
test('role add/remove and response execute for the clicker, with controlled author mention',async()=>{
 const f=fixture();await f.handler(f.interaction());assert.deepEqual(f.ops,[['add',A],['remove',B]]);assert.equal(f.replies[0].content,`<@${U}>, готово!`);assert.deepEqual(f.replies[0].allowedMentions,{parse:[],users:[U],repliedUser:false});assert.equal(f.defs[0].flags,64);
});
test('toggle uses updated local membership even when SDK cache is not yet updated',async()=>{
 const f=fixture({actions:[{type:5,roleId:A},{type:5,roleId:A}]});await f.handler(f.interaction());assert.deepEqual(f.ops,[['add',A],['remove',A]]);
});
test('string menu executes selected option only and expands values; unknown prototype options cannot run',async()=>{
 const f=fixture();delete f.entry.flow;f.entry.flows={a:{actions:[{type:3,roleId:A}]},b:{actions:[{type:12,message:{content:'Выбор: {values}'},flags:0}]}};
 await f.handler(f.interaction(['b']));assert.deepEqual(f.ops,[]);assert.equal(f.replies[0].content,'Выбор: b');assert.equal(f.defs[0].flags,0);
 await f.handler(f.interaction(['constructor']));assert.deepEqual(f.ops,[]);assert.match(f.replies.at(-1).content,/не настроено/);
});
test('message/guild/channel binding blocks copied IDs and pending registrations',async()=>{
 for(const change of [{channelId:'77777777777777777'},{guild:{id:'77777777777777777'}},{message:{id:'77777777777777777'}}]){const f=fixture();await f.handler({...f.interaction(),...change});assert.deepEqual(f.ops,[]);}
 const f=fixture();delete f.entry.messageId;await f.handler(f.interaction());assert.deepEqual(f.ops,[]);assert.equal(f.defs.length,0);
});
test('preflights every role and expanded response before any role changes',async()=>{
 const f=fixture();f.guild.roles.fetch=async r=>({id:r,managed:false,editable:r!==B});await f.handler(f.interaction());assert.deepEqual(f.ops,[]);
 const long=fixture({actions:[{type:3,roleId:A},{type:12,message:{content:'{user}'.repeat(300)}}]});await long.handler(long.interaction());assert.deepEqual(long.ops,[]);
});
test('concurrent duplicate clicks do not execute a toggle twice',async()=>{
 const f=fixture({actions:[{type:5,roleId:A}]});const i=f.interaction();await Promise.all([f.handler(i),f.handler(i)]);assert.equal(f.ops.length,1);
});
test('unsupported flow actions, wrong role IDs, remote replies and excessive action counts fail validation',()=>{
 for(const flow of [{actions:[{type:1,duration:1}]},{actions:[{type:3,roleId:'Admin'}]},{actions:[{type:12,channelId:C,message:{content:'text'}}]},{actions:Array.from({length:11},()=>({type:3,roleId:A}))}])assert.throws(()=>validateFlow(flow));
});
test('disk registry survives restart, binds only confirmed messages and restores flows on load',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lds-actions-'));t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('lds-actions-'));fs.rmSync(directory,{recursive:true,force:true});});const file=path.join(directory,'actions.json');
 const entry={customId:PREFIX+'disk',guildId:G,channelId:C,flow:{actions:[{type:3,roleId:A}]}};
 createActionStore(file).reserve([entry]);assert.ok(!createActionStore(file).get(entry.customId).messageId);
 createActionStore(file).bind([entry],G,C,M);const reopened=createActionStore(file);assert.equal(reopened.get(entry.customId).messageId,M);
 const component={type:2,custom_id:entry.customId};assert.deepEqual(restoreFlows([component],reopened,G,C,M)[0].flow,entry.flow);assert.ok(!restoreFlows([component],reopened,G,C,'other')[0].flow);
 reopened.bind([],G,C,M);assert.equal(reopened.get(entry.customId),undefined);
 fs.writeFileSync(file,'{broken');assert.throws(()=>createActionStore(file).reserve([entry]));
});
