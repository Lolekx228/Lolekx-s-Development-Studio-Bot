'use strict';
(() => {
 const byId=id=>document.getElementById(id);
 const activeKey='lds-components-active-backup-v1';let activeBackup=null;
 try{activeBackup=JSON.parse(sessionStorage.getItem(activeKey)||'null')}catch{}
 function setActive(value){activeBackup=value;try{if(value)sessionStorage.setItem(activeKey,JSON.stringify(value));else sessionStorage.removeItem(activeKey)}catch{}byId('classicOverwriteBackup').hidden=!value;byId('classicOverwriteBackup').textContent=value?'Перезаписать бекап: '+value.backup.name:'Перезаписать бекап';if(value)byId('classicBackupName').value=value.backup.name}
 setActive(activeBackup);
 window.LDSOpenClassicEditor=(payload,options={})=>{
  if(window.ldsDeliveryHasFiles?.())throw Error('Перед переходом удалите новые файлы из текущего редактора и прикрепите их в Files классического редактора.');
  if(LDSBackupFormat.isV2(payload))throw Error('Components V2 используют отдельную структуру Discord. Для embeds откройте обычное сообщение.');
  const selection=options.openedBackup===undefined?activeBackup:options.openedBackup;
  const reference=options.reference===undefined?(selection?.backup.messages[selection.messageIndex]?.reference||byId('deliveryMessageLink')?.value||''):options.reference;
  const targets=options.targets||selection?.backup.targets||[];
  const transfer={messages:[{data:JSON.parse(JSON.stringify(payload)),reference}],targets,openedBackup:selection||undefined,deliveryMode:byId('deliveryWebhookPanel')?.hidden===false?'webhook':'bot'};
  sessionStorage.setItem('lds-classic-editor-import',JSON.stringify(transfer));location.assign(new URL('../',location.href).href);
 };
 window.addEventListener('lds-backup-opened',event=>setActive(event.detail));
 window.addEventListener('lds-backup-detached',()=>setActive(null));
 document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>byId(button.dataset.close).close());
 byId('classicSettings').onclick=()=>byId('classicSettingsDialog').showModal();
 byId('help').addEventListener('click',()=>byId('classicSettingsDialog').close());
 byId('classicMenu').onclick=()=>{const open=byId('classicNavigation').classList.toggle('open');byId('classicMenu').setAttribute('aria-expanded',String(open))};
 for(const pane of ['Editor','Preview'])byId('pane'+pane).onclick=()=>{document.body.dataset.pane=pane.toLowerCase();for(const name of ['Editor','Preview'])byId('pane'+name).setAttribute('aria-selected',String(name===pane))};
 const expanded=new Map();
 byId('blocks').addEventListener('toggle',event=>{if(event.target.dataset.block)expanded.set(event.target.dataset.block,event.target.open)},true);
 byId('blocks').addEventListener('click',event=>{if(event.target.closest('.block-head button'))event.preventDefault()},true);
 new MutationObserver(()=>{byId('blocks').querySelectorAll('details[data-block]').forEach(el=>{if(expanded.has(el.dataset.block))el.open=expanded.get(el.dataset.block)})}).observe(byId('blocks'),{childList:true});
 function snapshot(){if(dirty)throw Error('Сначала примените изменения JSON');return JSON.parse(JSON.stringify(state))}
 function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 byId('classicShare').onclick=()=>{try{const bytes=new TextEncoder().encode(JSON.stringify({messages:[{data:snapshot()}]}));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const encoded=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');byId('classicShareUrl').value=location.origin+location.pathname+'?data='+encoded;byId('classicShareDialog').showModal()}catch(error){toast(error.message)}};
 byId('classicCopyLink').onclick=async()=>{try{await navigator.clipboard.writeText(byId('classicShareUrl').value);toast('Ссылка скопирована')}catch{byId('classicShareUrl').select();toast('Скопируйте выделенную ссылку')}};
 const localKey='lds-components-backups-v1';let rows=[];
 function openDatabase(){return new Promise(resolve=>{const request=indexedDB.open('lds-studio-classic');request.onupgradeneeded=()=>request.transaction.abort();request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('backup')){db.close();resolve(null)}else resolve(db)}})}
 async function readBackups(){let local=[];try{local=JSON.parse(localStorage.getItem(localKey)||'[]');if(!Array.isArray(local))local=[]}catch{}const db=await openDatabase();if(!db)return local;try{return [...await new Promise((resolve,reject)=>{const tx=db.transaction('backup');const req=tx.objectStore('backup').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}),...local]}finally{db.close()}}
 async function refresh(){rows=await readBackups();const list=byId('classicBackupList');list.textContent='';for(const record of rows){const row=document.createElement('div');row.className='backup-row';const label=document.createElement('span');label.textContent=record.name;const load=document.createElement('button');load.textContent='Load';load.onclick=()=>{try{byId('classicBackupsDialog').close();selectBackupFile({version:8,backups:[record]})}catch(error){toast(error.message)}};row.append(label,load);list.append(row)}if(!rows.length)list.textContent='Нет сохранённых бекапов.'}
 byId('classicBackups').onclick=async()=>{byId('classicBackupStatus').textContent='';byId('classicBackupsDialog').showModal();try{await refresh()}catch(error){byId('classicBackupStatus').textContent=error.message}};
 async function saveRecord(record,overwrite){
  const db=await openDatabase();
  if(db){try{return await new Promise((resolve,reject)=>{const tx=db.transaction('backup','readwrite'),store=tx.objectStore('backup');let saved;const req=store.index('name').get(record.name);req.onsuccess=()=>{const previous=req.result;if(previous&&!overwrite){tx.abort();return}if(previous&&record.id!==undefined&&previous.id!==record.id){tx.abort();return}const value=previous?LDSBackupEdit.replaceMessage(previous,activeBackup.messageIndex,snapshot()):{...record};if(!previous)delete value.id;const put=store.put(value);put.onsuccess=()=>{saved={...value,id:put.result}}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error||Error('Не удалось сохранить'));tx.onabort=()=>reject(Error('Бекап изменился. Откройте его заново или сохраните копию.'))})}finally{db.close()}}
  const existing=JSON.parse(localStorage.getItem(localKey)||'[]'),index=existing.findIndex(item=>item.name===record.name);let value={...record};delete value.id;if(index>=0){if(!overwrite)throw Error('Бекап с таким именем уже существует');value=LDSBackupEdit.replaceMessage(existing[index],activeBackup.messageIndex,snapshot());existing[index]=value}else existing.push(value);localStorage.setItem(localKey,JSON.stringify(existing));return value;
 }
 byId('classicSaveBackup').onclick=async()=>{try{const data=snapshot();await refresh();const base=byId('classicBackupName').value.trim()||'Untitled backup';let name=base,n=1;while(rows.some(record=>record.name===name))name=base+' ('+(n++)+')';const record=await saveRecord({name,messages:[{data}],targets:[]},false);setActive({backup:record,messageIndex:0});await refresh();byId('classicBackupStatus').textContent='Сохранено: '+name}catch(error){byId('classicBackupStatus').textContent=error.message}};
 byId('classicOverwriteBackup').onclick=async()=>{const button=byId('classicOverwriteBackup');button.disabled=true;try{if(!activeBackup)throw Error('Сначала откройте бекап');const record=LDSBackupEdit.replaceMessage(activeBackup.backup,activeBackup.messageIndex,snapshot());const saved=await saveRecord(record,true);setActive({backup:saved,messageIndex:activeBackup.messageIndex});toast('Бекап перезаписан: '+saved.name)}catch(error){toast(error.message)}finally{button.disabled=false}};
 byId('classicExportBackups').onclick=async()=>{try{await refresh();download({version:8,backups:rows.map(record=>{const copy=JSON.parse(JSON.stringify(record));delete copy.id;return copy})},'lds-backups.json')}catch(error){byId('classicBackupStatus').textContent=error.message}};
 byId('file').addEventListener('change',event=>{if(event.target.files.length)byId('classicBackupsDialog').close()});
 try{const encoded=new URLSearchParams(location.search).get('data');if(encoded){setActive(null);if(encoded.length>200000)throw Error('Ссылка слишком большая');const base64=encoded.replace(/-/g,'+').replace(/_/g,'/');const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64),c=>c.charCodeAt(0))));if(!Array.isArray(data.messages)||!data.messages.length)throw Error('В ссылке нет сообщений');if(data.messages.length===1)apply(normalize(data.messages[0].data));else selectBackupFile({version:8,backups:[{name:'Shared message',messages:data.messages,targets:[]}]})}}catch(error){toast('Не удалось открыть ссылку: '+error.message)}
 if(!LDSBackupFormat.isV2(state)&&!backupDialog.open)window.LDSOpenClassicEditor(state);
})();
