import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import ru from '../upstream/public/i18n/ru.json';
import en from '../upstream/public/i18n/en.json';
import {MessageEditor} from '~/components/editor/MessageEditor.client';
import {Message} from '~/components/preview/Message.client';
import {Button} from '~/components/Button';
import {Modal,ModalFooter} from '~/modals/Modal';
import {JsonEditorModal} from '~/modals/JsonEditorModal';
import {CodeGeneratorModal} from '~/modals/CodeGeneratorModal';
import {ImageModal} from '~/modals/ImageModal';
import i18nConfig from '~/i18n';
import {ComponentEditModal} from '~/modals/ComponentEditModal';
import {MessageFlagsEditModal} from '~/modals/MessageFlagsEditModal';
import {MessageAllowedMentionsModal} from '~/modals/MessageAllowedMentionsModal';
import {useDragManager} from '~/util/drag';
import {useCache} from '~/util/cache/CacheManager';
import {ZodQueryDataMessage} from '~/types/QueryData';
import {blank,normalize,importBackups,encode,decode,draftOnly,attachmentPayload,readLegacyBackups,validateWebhook,uid} from './core';
import botApi from './bot/client.cjs';
import '../upstream/app/styles/app.css';
import '../upstream/app/styles/coolicons.css';
import './studio.css';

i18n.use(initReactI18next).init({...i18nConfig,resources:{ru:{translation:ru},en:{translation:en}},lng:'ru',returnNull:false});
const DRAFT='lds-app-draft-v2',BACKUPS='lds-app-backups-v2',HISTORY='lds-app-history-v2',OPENED='lds-app-opened-backup';
const initial=()=>{try{const q=new URL(location.href).searchParams.get('data');return normalize(q?decode(q):JSON.parse(localStorage.getItem(DRAFT)||'null'));}catch{return {version:'d2',messages:[blank()]};}};
const readList=(key:string)=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];}catch{return [];}};
function download(value:any,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function App(){
 const [data,rawSetData]=useState<any>(initial),[files,setFiles]=useState<any[]>([]),[tab,setTab]=useState('editor');
 const [dialog,setDialog]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [jsonEditor,setJsonEditor]=useState<any>(),[component,setComponent]=useState<any>(),[flags,setFlags]=useState<number>(),[mentions,setMentions]=useState<number>(),[setLinkIndex,setSetLinkIndex]=useState<number>();
 const [codeGenerator,setCodeGenerator]=useState<any>();
 const [link,setLink]=useState(''),[share,setShare]=useState(''),[apiUrl,setApiUrl]=useState('https://lolekx-api.wispbyte.app');
 const [account,setAccount]=useState<any>(null),[authBusy,setAuthBusy]=useState(true),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<'webhook'|'bot'>('webhook'),[webhooks,setWebhooks]=useState<any[]>([]),[hookInput,setHookInput]=useState('');
 const [guild,setGuild]=useState(''),[channel,setChannel]=useState(''),[channels,setChannels]=useState<any[]>([]),[pings,setPings]=useState(false);
 const [selected,setSelected]=useState<Record<string,boolean>>({}),[chosenHooks,setChosenHooks]=useState<Record<string,boolean>>({});
 const [backups,setBackups]=useState<any[]>(()=>readList(BACKUPS)),[opened,setOpened]=useState(()=>localStorage.getItem(OPENED)||''),[backupName,setBackupName]=useState(''),[importText,setImportText]=useState('');
 const [history,setHistory]=useState<any[]>(()=>readList(HISTORY)),[light,setLight]=useState(()=>localStorage.getItem('lds-app-theme')==='light'),[linkImage,setLinkImage]=useState<any>();
 const client=useRef(new botApi.BotClient()).current;
 const drag=useDragManager();const cache=useCache();const found=useState({});const mounted=useRef(false);
 const setData=(next:any)=>rawSetData({...next});
 useEffect(()=>{document.documentElement.classList.toggle('dark',!light);localStorage.setItem('lds-app-theme',light?'light':'dark');},[light]);
 useEffect(()=>{try{localStorage.setItem(DRAFT,JSON.stringify(draftOnly(data)));}catch{setError('Не удалось сохранить черновик: хранилище браузера заполнено. Экспортируйте JSON.');}},[data]);
 useEffect(()=>{try{localStorage.setItem(BACKUPS,JSON.stringify(backups));}catch{setError('Не удалось сохранить бекапы. Экспортируйте их в файл.');}},[backups]);
 useEffect(()=>{localStorage.setItem(OPENED,opened);},[opened]);
 useEffect(()=>{let active=true;(async()=>{try{const value=await client.finishDiscord()||await client.restoreSession();if(active&&value){setAccount(value);setApiUrl(client.origin);}}catch(e){if(active)setError((e as Error).message);}finally{if(active)setAuthBusy(false);}})();return()=>{active=false;};},[]);
 useEffect(()=>{if(!account||!guild)return;let active=true;setChannels([]);client.channels(guild).then((v:any)=>{if(active)setChannels(v.channels||v);}).catch((e:Error)=>{if(active)setError(e.message);});return()=>{active=false;};},[account,guild]);
 async function guarded(fn:()=>any){setError('');try{return await fn();}catch(e){setError((e as Error).message);}}
 function snapshot(label:string){const item={id:uid(),name:label,date:Date.now(),data:draftOnly(data)};setHistory(prev=>{const next=[item,...prev].slice(0,30);try{localStorage.setItem(HISTORY,JSON.stringify(next));}catch{}return next;});}
 function replaceDraft(value:any){snapshot('Перед загрузкой');setData(normalize(value));setFiles([]);}
 function showSend(){setSelected(Object.fromEntries(data.messages.map((m:any)=>[m._id,true])));setChosenHooks(Object.fromEntries(webhooks.map(h=>[h.id,true])));setDialog('send');setError('');}
 async function login(){if(files.length)throw Error('Перед входом сохраните черновик; вложения после перехода нужно выбрать заново.');setAuthBusy(true);try{location.assign(await client.startDiscord(apiUrl,location.href));}catch(e){setAuthBusy(false);throw e;}}
 async function addWebhook(){const url=validateWebhook(hookInput);setBusy(true);try{const res=await fetch(url,{credentials:'omit'});const info=await res.json();if(!res.ok)throw Error(info.message||'Webhook недоступен.');const hook={id:info.id,name:info.name,url:url.href,guildId:info.guild_id,channelId:info.channel_id};setWebhooks(old=>[...old.filter(h=>h.id!==hook.id),hook]);setHookInput('');setDialog('');setMode('webhook');}finally{setBusy(false);}}
 function messageFiles(m:any){return files.filter(f=>m.data.attachments?.some((a:any)=>a.id===f.id)).map(f=>f.file);}
 async function send(){
  const messages=data.messages.filter((m:any)=>selected[m._id]);if(!messages.length)throw Error('Выберите хотя бы одно сообщение.');
  const prepared=messages.map((m:any)=>attachmentPayload(m,files,mode));
  for(const m of messages)if(m.reference&&!/^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}\/?$/.test(m.reference))throw Error('Неверная ссылка сообщения. Очистите Set Link, чтобы отправить новое.');
  setBusy(true);try{
   if(mode==='bot'){
    if(!account)throw Error('Сначала войдите через Discord.');
    if(prepared.some((m:any)=>m.allowed_mentions&&Object.keys(m.allowed_mentions).length))throw Error('В режиме бота настройте пинги переключателем в окне отправки; индивидуальные Allowed Mentions поддерживаются через Webhook.');
    const results=await client.send(prepared,channel,pings,(done:number,total:number)=>setNotice(`Отправлено ${done}/${total}`));
    results.forEach((r:any,i:number)=>{if(r.url)messages[i].reference=r.url;});
   }else{
    const hooks=webhooks.filter(h=>chosenHooks[h.id]);if(!hooks.length)throw Error('Добавьте и выберите webhook.');
    // Preflight every destination before the first write.
    for(const h of hooks)validateWebhook(h.url);
    for(const hook of hooks)for(let i=0;i<messages.length;i++){
     const m=messages[i],payload={...prepared[i]};delete payload.files;delete payload.reference;delete payload.thread_id;
     if(!payload.allowed_mentions)payload.allowed_mentions={parse:pings?['users','roles']:[]};
     const url=validateWebhook(hook.url);url.searchParams.set('wait','true');url.searchParams.set('with_components','true');
     const ref=m.reference?.match(/\/channels\/\d+\/(\d+)\/(\d+)\/?$/);if(m.reference&&!ref)throw Error('Некорректная ссылка сообщения.');
     if(ref){url.pathname+='/messages/'+ref[2];if(ref[1]!==hook.channelId)url.searchParams.set('thread_id',ref[1]);}else if(m.thread_id)url.searchParams.set('thread_id',m.thread_id);
     let body:any=JSON.stringify(payload);let headers:any={'Content-Type':'application/json'};
     if(prepared[i].files.length){body=new FormData();body.set('payload_json',JSON.stringify(payload));prepared[i].files.forEach((file:File,j:number)=>body.append(`files[${j}]`,file,file.name));headers={};}
     const response=await fetch(url,{method:ref?'PATCH':'POST',body,headers,credentials:'omit'});const result=await response.json();
     if(!response.ok)throw Error(result.message||`Discord: ${response.status}`);
     if(result.id&&hooks.length===1&&hook.guildId)m.reference=`https://discord.com/channels/${hook.guildId}/${result.channel_id}/${result.id}`;
     setNotice(`Отправлено: ${hook.name}, сообщение ${i+1}/${messages.length}`);
    }
   }
   setData(data);snapshot('Отправлено');setNotice('Сообщения отправлены.');setDialog('');
  }finally{setBusy(false);}
 }
 function saveBackup(overwrite=false){const current=backups.find(b=>b.id===opened);if(overwrite&&!current)throw Error('Сначала откройте бекап.');const name=backupName.trim()||current?.name||'Без названия';const item={id:overwrite?current.id:uid(),name,updatedAt:Date.now(),data:draftOnly(data)};setBackups(old=>overwrite?old.map(b=>b.id===item.id?item:b):[item,...old]);setOpened(item.id);setBackupName(name);setNotice('Бекап сохранён.');}
 function importBackupText(text:string){const incoming=importBackups(JSON.parse(text));setBackups(old=>[...incoming,...old]);setImportText('');setNotice(`Импортировано бекапов: ${incoming.length}`);}
 const actionButton=(label:string,onClick:()=>void)=> <Button discordstyle={2} onClick={()=>guarded(onClick)}>{label}</Button>;
 return <><header className="studio-header"><a className="studio-brand" href={import.meta.env.BASE_URL}><img src={import.meta.env.BASE_URL+'lds.svg'} alt=""/>LDS Studio</a><nav>{actionButton('Настройки',()=>setDialog('settings'))}{actionButton('История',()=>setDialog('history'))}{actionButton('Помощь',()=>setDialog('help'))}</nav><div className="studio-account">{account?<><span>{account.user?.name||account.bot?.name}</span>{actionButton('Выйти',async()=>{await client.disconnect();setAccount(null);})}</>:<Button disabled={authBusy} onClick={()=>guarded(login)}>{authBusy?'Проверяем вход…':'Войти через Discord'}</Button>}</div></header>
 <div className="pane-tabs"><button onClick={()=>setTab('editor')} aria-pressed={tab==='editor'}>Редактор</button><button onClick={()=>setTab('preview')} aria-pressed={tab==='preview'}>Предварительный просмотр</button></div>
 <main className={'studio-layout pane-'+tab}><section className="studio-editor" aria-label="Редактор сообщений"><div className="studio-toolbar">{actionButton('Поделиться',()=>{setShare(location.origin+import.meta.env.BASE_URL+'?data='+encode(draftOnly(data)));setDialog('share');})}{actionButton('Бекапы',()=>{setBackupName(backups.find(b=>b.id===opened)?.name||'');setDialog('backups');})}{actionButton('Очистить всё',()=>setDialog('clear'))}{opened&&backups.some(b=>b.id===opened)&&actionButton('Перезаписать бекап',()=>saveBackup(true))}</div>
 <div className="studio-destinations"><div className="studio-modes"><button aria-pressed={mode==='webhook'} onClick={()=>setMode('webhook')}>Webhook</button><button aria-pressed={mode==='bot'} onClick={()=>setMode('bot')}>LDS Bot</button></div><div className="studio-targets">{mode==='webhook'?<>{webhooks.map(h=><div className="target-chip" key={h.id}><span>{h.name}</span><button title="Изменить webhook" onClick={()=>{setHookInput(h.url);setDialog('webhook');}}>✎</button><button title="Убрать webhook" onClick={()=>setWebhooks(old=>old.filter(x=>x.id!==h.id))}>×</button></div>)}<Button discordstyle={1} onClick={()=>setDialog('webhook')}>Добавить вебхук</Button></>:<span>{account?account.bot?.name||'Бот подключён':'Войдите через Discord для отправки от бота'}</span>}<Button discordstyle={1} onClick={showSend}>Отправить ▾</Button></div></div>
 {error&&<div className="studio-error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}{notice&&<p className="studio-notice" role="status">{notice}</p>}
 <div className="message-editors">{data.messages.map((m:any,i:number)=><MessageEditor key={m._id} data={data} index={i} files={files} setFiles={setFiles} setData={setData} discordApplicationId="lds-local" setSettingMessageIndex={(index:any)=>{setSetLinkIndex(index);setLink(data.messages[index]?.reference||'');}} setEditingMessageFlags={setFlags} setEditingAllowedMentions={setMentions} setEditingComponent={setComponent} setJsonEditor={setJsonEditor} setCodeGenerator={setCodeGenerator} componentFoundBackupsHook={found as any} drag={drag} cache={cache}/>)}</div>
 <div className="studio-add"><Button onClick={()=>{setData({...data,messages:[...data.messages,blank()]});}}>＋ Добавить сообщение</Button><Button onClick={()=>setData({...data,messages:[...data.messages,blank(true)]})}>＋ Сообщение Components V2</Button></div>
 <footer><span>Сохранено в этом браузере</span><a href="https://github.com/Lolekx228/Lolekx-s-Development-Studio-Bot" target="_blank" rel="noreferrer">Исходный код · AGPL</a></footer></section>
 <section className="studio-preview" aria-label="Предварительный просмотр"><div className="preview-title">Предварительный просмотр <span>Виден только вам</span></div>{data.messages.map((m:any,i:number)=><div key={m._id} className="preview-message"><Message message={m.data} previousMessageData={data.messages[i-1]?.data} discordApplicationId="lds-local" cache={cache} forceSeparateAuthor date={new Date()} setImageModalData={setLinkImage}/></div>)}</section></main>
 <Modal open={dialog==='webhook'} setOpen={()=>setDialog('')} title="Добавить вебхук"><label className="studio-field">Webhook URL<input type="password" autoComplete="off" value={hookInput} onChange={e=>setHookInput(e.target.value)} placeholder="https://discord.com/api/webhooks/…"/></label><p className="studio-hint">Ссылка хранится только в памяти вкладки. Создайте webhook в настройках канала Discord → Интеграции.</p>{error&&<p className="studio-error">{error}</p>}<ModalFooter><Button disabled={busy} discordstyle={1} onClick={()=>guarded(addWebhook)}>Добавить вебхук</Button></ModalFooter></Modal>
 <Modal open={dialog==='send'} setOpen={()=>{if(!busy)setDialog('');}} title="Отправить сообщения"><div className="send-mode"><button aria-pressed={mode==='webhook'} onClick={()=>setMode('webhook')}>Webhook</button><button aria-pressed={mode==='bot'} onClick={()=>setMode('bot')}>LDS Bot</button></div>{mode==='bot'?<>{!account?<Button onClick={()=>guarded(login)}>Войти через Discord</Button>:<><label className="studio-field">Сервер<select value={guild} onChange={e=>{setGuild(e.target.value);setChannel('');}}><option value="">Выберите сервер</option>{account.guilds?.map((g:any)=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><label className="studio-field">Канал<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Выберите канал</option>{channels.map((c:any)=><option key={c.id} value={c.id}># {c.name}</option>)}</select></label><label className="studio-field">ID канала или ветки<input value={channel} onChange={e=>setChannel(e.target.value)} inputMode="numeric"/></label></>}</>:<>{webhooks.length?webhooks.map(h=><label className="check-row" key={h.id}><input type="checkbox" checked={!!chosenHooks[h.id]} onChange={e=>setChosenHooks({...chosenHooks,[h.id]:e.target.checked})}/>{h.name}</label>):<Button onClick={()=>setDialog('webhook')}>Добавить вебхук</Button>}</>}
 <hr/><strong>Сообщения</strong>{data.messages.map((m:any,i:number)=><label className="check-row" key={m._id}><input type="checkbox" checked={!!selected[m._id]} onChange={e=>setSelected({...selected,[m._id]:e.target.checked})}/>Сообщение {i+1}{m.reference?' · редактирование':''}</label>)}<label className="check-row"><input type="checkbox" checked={pings} onChange={e=>setPings(e.target.checked)}/>Разрешить пинги пользователей и ролей</label><p className="studio-hint">Для webhook индивидуальные настройки Allowed Mentions имеют приоритет. Для бота @everyone и @here отключены.</p>{error&&<p className="studio-error">{error}</p>}<p role="status">{notice}</p><ModalFooter><Button disabled={busy} discordstyle={1} onClick={()=>guarded(send)}>{busy?'Отправляем…':'Отправить'}</Button></ModalFooter></Modal>
 <Modal open={dialog==='backups'} setOpen={()=>setDialog('')} title="Бекапы"><div className="backup-list">{backups.length?backups.map(b=><article key={b.id} className={opened===b.id?'active':''}><div><strong>{b.name}</strong><small>{b.data.messages.length} сообщений{opened===b.id?' · открыт':''}</small></div><Button onClick={()=>guarded(()=>{replaceDraft(b.data);setOpened(b.id);setBackupName(b.name);setDialog('');})}>Открыть</Button><Button onClick={()=>{setOpened(b.id);setBackupName(b.name);setDialog('delete-backup');}}>Удалить</Button></article>):<p>Здесь появятся сохранённые бекапы.</p>}</div><label className="studio-field">Название<input value={backupName} onChange={e=>setBackupName(e.target.value)}/></label><div className="studio-toolbar">{actionButton('Сохранить новый',()=>saveBackup())}{opened&&actionButton('Перезаписать открытый',()=>saveBackup(true))}</div><details><summary>Импорт из файла / JSON</summary><input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)guarded(async()=>importBackupText(await file.text()));e.target.value='';}}/><textarea aria-label="JSON бекапов" value={importText} onChange={e=>setImportText(e.target.value)}/>{actionButton('Импортировать JSON',()=>importBackupText(importText))}</details>{error&&<p className="studio-error">{error}</p>}<ModalFooter>{actionButton('Перенести старые бекапы',async()=>{const old=await readLegacyBackups();if(!old.length)throw Error('Старых бекапов в этом браузере нет. Можно импортировать JSON-файл.');setBackups(list=>[...old,...list]);setNotice('Старые бекапы перенесены.');})}{actionButton('Экспорт всех',()=>download({version:8,backups:backups.map(b=>({name:b.name,messages:b.data.messages,targets:[]}))},'lds-backups.json'))}{actionButton('Экспорт сообщения',()=>download(draftOnly(data),'lds-message.json'))}</ModalFooter></Modal>
 <Modal open={dialog==='delete-backup'} setOpen={()=>setDialog('backups')} title="Удалить бекап?"><p>{backupName}</p><ModalFooter>{actionButton('Отмена',()=>setDialog('backups'))}{actionButton('Удалить',()=>{setBackups(old=>old.filter(b=>b.id!==opened));setOpened('');setDialog('backups');})}</ModalFooter></Modal>
 <Modal open={dialog==='clear'} setOpen={()=>setDialog('')} title="Очистить всё?"><p>Перед очисткой текущий черновик попадёт в локальную историю.</p><ModalFooter>{actionButton('Очистить',()=>{replaceDraft({messages:[blank()]});setOpened('');setDialog('');})}</ModalFooter></Modal>
 <Modal open={dialog==='share'} setOpen={()=>setDialog('')} title="Поделиться"><p>Ссылка содержит сообщения. Доступна каждому, у кого есть ссылка. Webhook и сессия в неё не включаются. Локальные файлы нужно приложить заново.</p><textarea aria-label="Ссылка на черновик" readOnly value={share}/><ModalFooter>{actionButton('Копировать ссылку',async()=>{await navigator.clipboard.writeText(share);setNotice('Ссылка скопирована.');})}</ModalFooter></Modal>
 <Modal open={dialog==='settings'} setOpen={()=>setDialog('')} title="Настройки"><label className="check-row"><input type="checkbox" checked={light} onChange={e=>setLight(e.target.checked)}/>Светлая тема</label><label className="studio-field">HTTPS-адрес API бота<input type="url" value={apiUrl} onChange={e=>setApiUrl(e.target.value)}/></label><p>Черновики, бекапы и история хранятся в этом браузере. Webhook — только в памяти вкладки. Сессия Discord сохраняется в текущей вкладке до истечения срока API.</p></Modal>
 <Modal open={dialog==='history'} setOpen={()=>setDialog('')} title="История">{history.map(h=><article className="history-row" key={h.id}><span>{h.name} · {new Date(h.date).toLocaleString('ru')}</span><Button onClick={()=>{replaceDraft(h.data);setOpened('');setDialog('');}}>Восстановить</Button></article>)}{!history.length&&<p>История появится после загрузки, очистки или отправки черновика.</p>}</Modal>
 <Modal open={dialog==='help'} setOpen={()=>setDialog('')} title="LDS Studio"><p>Редактор адаптирован из открытого Discohook.app, а не классического discohook.org. Используются оригинальные поля сообщений, embeds, компонентов и предпросмотр.</p><p>Добавьте webhook или войдите через Discord для отправки от LDS Bot. Соберите сообщение, нажмите «Отправить», выберите сообщения и канал.</p><p>Кнопки-ссылки открывают URL. Для действий кнопок и меню с custom_id нужен обработчик в вашем боте. Облачные сценарии и хранилище сервиса Discohook не подключены.</p><a href="https://github.com/discohook/discohook" target="_blank" rel="noreferrer">Исходный проект Discohook · AGPL v3+</a></Modal>
 <Modal open={setLinkIndex!==undefined} setOpen={()=>setSetLinkIndex(undefined)} title="Ссылка сообщения"><label className="studio-field">Message Link<input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://discord.com/channels/…"/></label><p className="studio-hint">Установленная ссылка переключает отправку этого сообщения на редактирование. Очистите её, чтобы отправить новое.</p><ModalFooter>{actionButton('Установить',()=>{if(setLinkIndex===undefined)return;if(link&&!/^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}\/?$/.test(link))throw Error('Неверная ссылка сообщения Discord.');data.messages[setLinkIndex].reference=link||undefined;setData(data);setSetLinkIndex(undefined);})}{actionButton('Загрузить',async()=>{if(setLinkIndex===undefined)return;let loaded:any;if(mode==='bot'){loaded=await client.loadMessage(link);loaded=loaded.payload||loaded.message||loaded;}else{const h=webhooks[0];if(!h)throw Error('Добавьте webhook.');const ids=link.match(/\/channels\/\d+\/(\d+)\/(\d+)/);if(!ids)throw Error('Неверная ссылка.');const url=validateWebhook(h.url);url.pathname+='/messages/'+ids[2];if(ids[1]!==h.channelId)url.searchParams.set('thread_id',ids[1]);const res=await fetch(url,{credentials:'omit'});loaded=await res.json();if(!res.ok)throw Error(loaded.message||'Не удалось загрузить сообщение.');}snapshot('Перед загрузкой сообщения');data.messages[setLinkIndex].data={content:loaded.content,embeds:loaded.embeds,components:loaded.components,flags:loaded.flags,attachments:loaded.attachments};data.messages[setLinkIndex].reference=link;setData(data);setSetLinkIndex(undefined);})}</ModalFooter>{error&&<p className="studio-error">{error}</p>}</Modal>
 <JsonEditorModal open={!!jsonEditor} setOpen={()=>{setJsonEditor(undefined);setData(data);}} {...jsonEditor}/>
 {codeGenerator&&<CodeGeneratorModal open setOpen={()=>setCodeGenerator(undefined)} {...codeGenerator}/>}
 <ImageModal clear={()=>setLinkImage(undefined)} {...linkImage}/>
 <ComponentEditModal open={!!component} setOpen={()=>{setComponent(undefined);setData(data);}} {...component} componentFoundBackupsHook={found as any} cache={cache}/>
 <MessageFlagsEditModal open={flags!==undefined} setOpen={()=>setFlags(undefined)} data={data} setData={setData} messageIndex={flags}/>
 <MessageAllowedMentionsModal open={mentions!==undefined} setOpen={()=>setMentions(undefined)} data={data} setData={setData} messageIndex={mentions} cache={cache}/>
 </>;
}
class ErrorBoundary extends React.Component<any,{error:string}>{state={error:''};static getDerivedStateFromError(error:Error){return {error:error.message};}render(){return this.state.error?<main className="fatal"><h1>Не удалось открыть редактор</h1><p>{this.state.error}</p><button onClick={()=>download(readList(BACKUPS),'lds-backups-recovery.json')}>Скачать бекапы</button><button onClick={()=>{localStorage.removeItem(DRAFT);location.reload();}}>Сбросить черновик</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><BrowserRouter><App/></BrowserRouter></ErrorBoundary>);
