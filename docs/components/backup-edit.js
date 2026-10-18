(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LDSBackupEdit=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function replaceMessage(backup,index,data){
  if(!backup||!Array.isArray(backup.messages)||!Number.isInteger(index)||index<0||index>=backup.messages.length)throw Error('Сообщение в бекапе изменилось. Откройте бекап заново.');
  const result=JSON.parse(JSON.stringify(backup));
  result.messages[index]={...result.messages[index],data:JSON.parse(JSON.stringify(data))};
  return result;
 }
 return {replaceMessage};
});
