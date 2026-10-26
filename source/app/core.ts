import embedCore from './bot/embed-core.cjs';
export const uid=()=>crypto.randomUUID();
export const blank=(components=false)=>({_id:uid(),data:components?{flags:32768,components:[{type:10,content:''}]}:{content:'',embeds:[]}});
const object=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value);
export function normalize(value:any){
 const input=Array.isArray(value?.messages)?value.messages:object(value?.data)?[value]:object(value)?[{data:value}]:null;
 if(!input?.length||input.length>100)throw Error('Нужно от 1 до 100 сообщений.');
 const messages=input.map((m:any)=>{
  if(!object(m)||!object(m.data))throw Error('Некорректное сообщение.');
  return {...m,_id:m._id||uid(),data:structuredClone(m.data)};
 });
 return {version:'d2',messages};
}
export function importBackups(value:any){
 if([1,2].includes(value?.version)&&object(value.message))value={version:3,backups:[{name:value.name,message:value.version===1?snake(value.message):value.message}]};
 if([3,4,5].includes(value?.version)&&Array.isArray(value.backups))value={backups:value.backups.map((b:any)=>({...b,messages:(b.messages||[b.message]).map((m:any)=>({data:m})),targets:[]}))};
 if(Array.isArray(value?.backups))return value.backups.map((b:any)=>({id:uid(),name:String(b.name||'Бекап'),data:normalize(b.data?.messages?b.data:b),updatedAt:Date.now()}));
 if(Array.isArray(value))return value.map((b:any)=>({id:uid(),name:String(b.name||'Бекап'),data:normalize(b.data?.messages?b.data:b),updatedAt:Date.now()}));
 return [{id:uid(),name:String(value.name||'Импорт'),data:normalize(value),updatedAt:Date.now()}];
}
function snake(value:any):any{if(Array.isArray(value))return value.map(snake);if(!object(value))return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),snake(v)]));}
export function encode(value:any){const bytes=new TextEncoder().encode(JSON.stringify(value));let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decode(value:string){const raw=atob(value.replaceAll('-','+').replaceAll('_','/'));return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));}
export function draftOnly(data:any){return {version:'d2',messages:data.messages.map((m:any)=>{const copy=structuredClone(m);delete copy.targets;delete copy.webhook;return copy;})};}
export function cleanPayload(data:any,files:any[]=[]){
 const copy=structuredClone(data);
 const strip=(value:any):any=>{
  if(Array.isArray(value))return value.map(strip);
  if(!object(value))return value;
  return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='_id').map(([k,v])=>[k,strip(v)]));
 };
 const result=strip(copy);
 delete result.author;
 if(!result.content&&!result.embeds?.length&&!result.components?.length&&!result.attachments?.length&&!files.length)throw Error('Сообщение пустое.');
 if((result.content||'').length>2000)throw Error('Содержимое: максимум 2000 символов.');
 if(result.embeds?.length>10)throw Error('Максимум 10 embeds.');
 if(Number(result.flags)&32768){if(result.content||result.embeds?.length)throw Error('Components V2 нельзя смешивать с content или embeds. Перенесите текст в текстовый компонент.');delete result.content;delete result.embeds;}
 if(result.embeds?.length)result.embeds=embedCore.prepare(result.embeds);
 return result;
}
export function hasActions(value:any):boolean {if(!value||typeof value!=='object')return false;if(value.flow?.actions?.length||value.flows&&Object.values(value.flows).some((v:any)=>v?.actions?.length))return true;return Object.values(value).some(hasActions);}
export function stripActions(value:any):any {if(Array.isArray(value))return value.map(stripActions);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='flow'&&k!=='flows').map(([k,v])=>[k,stripActions(v)]));}
export function validateWebhook(value:string){const url=new URL(value);if(url.protocol!=='https:'||!['discord.com','canary.discord.com','ptb.discord.com','discordapp.com'].includes(url.hostname)||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname))throw Error('Нужна HTTPS-ссылка webhook Discord.');url.hash='';return url;}
export function attachmentPayload(message:any,allFiles:any[],mode:string){
 const attached=message.data.attachments||[];
 const selected=allFiles.filter(f=>attached.some((a:any)=>a.id===f.id));
 if(attached.some((a:any)=>String(a.url||'').startsWith('blob:')&&!selected.some(f=>f.id===a.id)))throw Error('Локальные файлы недоступны после перезагрузки. Прикрепите их заново.');
 const payload=cleanPayload(message.data,selected);
 const retained=attached.filter((a:any)=>!selected.some(f=>f.id===a.id)).map((a:any)=>({id:String(a.id),filename:a.filename,...(a.description?{description:a.description}:{})}));
 const attachments=mode==='bot'?retained:[...retained,...selected.map((f,i)=>({id:i,filename:f.file.name,description:attached.find((a:any)=>a.id===f.id)?.description}))];
 if(attachments.length)payload.attachments=attachments;else delete payload.attachments;
 return {...payload,files:selected.map(f=>f.file),reference:message.reference,thread_id:message.thread_id};
}
export async function readLegacyBackups(){
 const databases=await indexedDB.databases();if(!databases.some(d=>d.name==='lds-studio-classic'))return [];
 return new Promise<any[]>((resolve,reject)=>{const request=indexedDB.open('lds-studio-classic');
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('backup')){db.close();resolve([]);return;}const tx=db.transaction('backup','readonly'),query=tx.objectStore('backup').getAll();query.onsuccess=()=>{db.close();resolve(importBackups({backups:query.result}));};query.onerror=()=>{db.close();reject(query.error);};};});
}
