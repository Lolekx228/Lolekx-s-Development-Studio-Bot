'use strict';
const backupDialog=document.createElement('dialog');backupDialog.id='backupPicker';
backupDialog.innerHTML='<h2>Импорт бекапов Discohook</h2><p>Выберите сообщение. Оно заменит текущий черновик.</p><label>Бекап<select id="backupChoice"></select></label><p id="backupWarning" class="hint"></p><div class="login-actions"><button id="openBackup" class="primary">Открыть сообщение</button><button id="cancelBackup">Отмена</button></div>';
document.body.append(backupDialog);let importedMessages=[];
function selectBackupFile(value){
 const backups=LDSBackupFormat.parseModern(value);importedMessages=[];const select=document.getElementById('backupChoice');select.textContent='';
 backups.forEach((backup,backupIndex)=>backup.messages.forEach((message,messageIndex)=>{
  const option=document.createElement('option');option.value=String(importedMessages.length);option.textContent=`${backupIndex+1}. ${backup.name}${backup.messages.length>1?' · сообщение '+(messageIndex+1):''} · ${LDSBackupFormat.isV2(message.data)?'Components V2':'Embeds / обычное сообщение'}`;
  select.append(option);importedMessages.push(message.data);
 }));
 if(!importedMessages.length)throw Error('Файл не содержит сообщений.');
 select.onchange=()=>document.getElementById('backupWarning').textContent=LDSBackupFormat.mediaWarnings(importedMessages[Number(select.value)]).join(' ');
 select.onchange();backupDialog.showModal();
}
document.getElementById('openBackup').onclick=()=>{
 try{const payload=normalize(JSON.parse(JSON.stringify(importedMessages[Number(document.getElementById('backupChoice').value)])));apply(payload);rawMode=false;dirty=false;$('#visualTab').click();backupDialog.close();toast('Бекап открыт без удаления компонентов и вложений.')}catch(error){document.getElementById('backupWarning').textContent=error.message}
};
document.getElementById('cancelBackup').onclick=()=>backupDialog.close();
$('#file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{if(file.size>10*1024*1024)throw Error('Максимальный размер файла: 10 МБ.');const value=JSON.parse(await file.text());if(Array.isArray(value.backups))selectBackupFile(value);else{const payload=normalize(value);if(confirm('Заменить текущее сообщение импортированным?'))apply(payload)}}catch(error){toast('Не удалось импортировать: '+error.message)}event.target.value='';
};
try{const transfer=sessionStorage.getItem('lds-v2-backup-import');if(transfer){selectBackupFile(JSON.parse(transfer));sessionStorage.removeItem('lds-v2-backup-import')}}catch(error){toast('Не удалось открыть бекап: '+error.message)}
