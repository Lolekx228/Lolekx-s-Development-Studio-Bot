(function(root){
 'use strict';
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 function parseModern(value){
  if(!object(value)||![7,8].includes(value.version)||!Array.isArray(value.backups))throw Error('Нужен файл бекапов Discohook версии 7 или 8.');
  if(value.backups.length>1000)throw Error('Слишком много бекапов в одном файле.');
  return value.backups.map((backup,index)=>{
   if(!object(backup)||typeof backup.name!=='string'||!Array.isArray(backup.messages)||!backup.messages.length)throw Error('Неверный формат бекапа '+(index+1)+'.');
   if(backup.messages.some(message=>!object(message)||!object(message.data)))throw Error('Бекап '+(index+1)+' содержит неверное сообщение.');
   const copy=JSON.parse(JSON.stringify(backup));delete copy.id;
   copy.targets=Array.isArray(copy.targets)?copy.targets.filter(object).map(target=>({...target,url:typeof target.url==='string'?target.url:''})):[];
   return copy;
  });
 }
 function isV2(data){return !!(Number(data?.flags)&32768)||Array.isArray(data?.components)&&data.components.some(component=>component.type!==1);}
 function mediaWarnings(value){
  const text=JSON.stringify(value)||'';const warnings=[];
  if(text.includes('blob:'))warnings.push('В бекапе есть временные blob-ссылки. Изображения нужно загрузить заново или заменить постоянными HTTPS-ссылками.');
  if(text.includes('attachment://')||value?.attachments?.length)warnings.push('Ссылки на вложения сохранены, но сами файлы JSON не содержит. Для отправки через бота замените их HTTPS-ссылками.');
  return warnings;
 }
 const api={parseModern,isV2,mediaWarnings};if(typeof module==='object'&&module.exports)module.exports=api;else root.LDSBackupFormat=api;
})(typeof globalThis!=='undefined'?globalThis:this);
