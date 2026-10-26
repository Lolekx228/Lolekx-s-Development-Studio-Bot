import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,normalize,importBackups,encode,decode,draftOnly,cleanPayload,attachmentPayload,validateWebhook} from '../app/core.ts';
test('imports d2 and classic message drafts without dropping embeds, buttons or extra messages',()=>{
 const source={version:'d2',messages:[{data:{content:'Привет',embeds:[{author:{name:'Автор'}}],components:[{type:1,components:[{type:2,style:5,url:'https://example.com',label:'Ссылка'}]}]}},{data:{flags:32768,components:[{type:10,content:'V2'}]}}]};
 const result=normalize(source);assert.equal(result.messages.length,2);assert.deepEqual(result.messages[0].data,source.messages[0].data);assert.notEqual(result.messages[0],source.messages[0]);
 assert.equal(normalize({data:{content:'.'}}).messages[0].data.content,'.');assert.throws(()=>normalize(null));
});
test('backup imports retain all messages and get independent identities for overwrite',()=>{
 const items=importBackups({version:8,backups:[{name:'Тест',messages:[{data:{content:'один'}},{data:{content:'два'}}]}]});
 assert.equal(items[0].data.messages.length,2);assert.equal(items[0].name,'Тест');assert.ok(items[0].id);assert.notEqual(importBackups({backups:[{name:'Тест',messages:[{data:{content:'x'}}]}]})[0].id,items[0].id);
});
test('share round trips Unicode and excludes webhook targets and credentials metadata',()=>{
 const value={messages:[{data:{content:'Привет 👀'},targets:[{url:'secret'}],webhook:'secret'}],targets:[{url:'secret'}]};
 assert.deepEqual(decode(encode(draftOnly(value))),draftOnly(value));assert.ok(!JSON.stringify(draftOnly(value)).includes('secret'));
});
test('wire payload preserves embed authors and strips only editor metadata',()=>{
 const value=cleanPayload({content:'Test',author:{badge:'fake'},embeds:[{author:{name:'Имя'}}],components:[{type:1,components:[{type:2,style:1,custom_id:'own_handler',flow:{actions:[]}}]}],_id:'internal'});
 assert.equal(value.embeds[0].author.name,'Имя');assert.ok(!value.author);assert.ok(!value._id);assert.equal(value.components[0].components[0].custom_id,'own_handler');assert.ok(!value.components[0].components[0].flow);
});
test('empty, oversized and mixed V2 messages fail before transmission',()=>{
 assert.throws(()=>cleanPayload({}));assert.throws(()=>cleanPayload({content:'x'.repeat(2001)}));
 assert.throws(()=>cleanPayload({flags:32768,content:'text',components:[{type:10,content:'Hello'}]}));
 const m=cleanPayload({flags:32768,components:[{type:10,content:'Hello'}]});assert.ok(!m.content);assert.ok(!m.embeds);
});
test('new local attachments use serial IDs for webhook and are not retained attachments for bot',()=>{
 const file=new File(['abc'],'a.txt'),files=[{id:'local-file',file}];const msg={data:{attachments:[{id:'local-file',filename:'a.txt',url:'blob:local'},{id:'12345678901234567',filename:'old.txt'}]}};
 const hook=attachmentPayload(msg,files,'webhook');assert.deepEqual(hook.attachments.map(a=>a.id),['12345678901234567',0]);assert.equal(hook.files[0],file);
 const bot=attachmentPayload(msg,files,'bot');assert.deepEqual(bot.attachments.map(a=>a.id),['12345678901234567']);assert.throws(()=>attachmentPayload(msg,[],'bot'),/заново/);
});
test('webhook destination rejects non Discord URLs and unsupported protocols',()=>{
 assert.equal(validateWebhook('https://discord.com/api/webhooks/12345678901234567/token').hostname,'discord.com');
 for(const url of ['http://discord.com/api/webhooks/123/token','https://evil.example/api/webhooks/123/token','https://discord.com.evil.example/api/webhooks/123/token'])assert.throws(()=>validateWebhook(url));
});
test('blank variants start with a unique identity and correct Discord message mode',()=>{
 assert.notEqual(blank()._id,blank()._id);assert.equal(blank(true).data.flags,32768);assert.equal(blank(true).data.components[0].type,10);
});
