const test=require('node:test'),assert=require('node:assert/strict'),format=require('./format.js');
test('Version 8 preserves V2, legacy rows, embeds, reference and missing-file metadata',()=>{
 const value={version:8,backups:[{name:'Duplicate',messages:[{data:{flags:32768,components:[{type:10,content:'Text'}],attachments:[{id:'123',url:'blob:https://discohook.app/fixture'}]},reference:'123'}]},{name:'Duplicate',messages:[{data:{embeds:[{title:'Embed'}],components:[{type:1,components:[{type:2,label:'Link',style:5,url:'https://example.test/'}]}]}}]}]};
 const parsed=format.parseModern(value);assert.equal(parsed.length,2);assert.deepEqual(parsed[0].messages,value.backups[0].messages);assert.deepEqual(parsed[1].messages,value.backups[1].messages);assert.deepEqual(parsed[0].targets,[]);assert.equal(format.isV2(parsed[0].messages[0].data),true);assert.equal(format.isV2(parsed[1].messages[0].data),false);assert.ok(format.mediaWarnings(parsed[0].messages[0].data).some(s=>s.includes('blob')));
});
test('Unknown versions and malformed backups report errors instead of silent success',()=>{
 assert.throws(()=>format.parseModern({version:99,backups:[]}));assert.throws(()=>format.parseModern({version:8,backups:[{name:'Bad',messages:[{}]}]}));assert.throws(()=>format.parseModern({version:8,backups:'bad'}));
 assert.equal(format.parseModern({version:7,backups:[{name:'Legacy',messages:[{data:{content:'Hello'}}],targets:[]}]}).length,1);
});
