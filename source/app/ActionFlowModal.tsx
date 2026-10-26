import React,{useEffect,useState} from 'react';
import {Modal,ModalFooter} from '~/modals/Modal';
import {Button} from '~/components/Button';
const options=[{type:3,label:'Выдать роль'},{type:4,label:'Снять роль'},{type:5,label:'Переключить роль'},{type:12,label:'Ответить сообщением'}];
export function FlowEditModal({open,setOpen,flow,setFlow}:any){
 const [actions,setActions]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(open){setActions(structuredClone(flow?.actions||[]));setError('');}},[open,flow]);
 const update=(index:number,value:any)=>setActions(old=>old.map((a,i)=>i===index?value:a));
 function save(){
  for(const a of actions){if([3,4,5].includes(a.type)&&!/^\d{17,20}$/.test(a.roleId||'')){setError('Укажите ID роли: правый клик по роли в Discord → Копировать ID.');return;}
   if(a.type===12&&(!a.message?.content?.trim()||a.message.content.length>2000)){setError('Ответ должен содержать от 1 до 2000 символов.');return;}
   if(!options.some(o=>o.type===a.type)){setError('В этом сценарии есть неподдерживаемое действие. Замените или удалите его.');return;}}
  setFlow?.({...flow,actions:structuredClone(actions)});setOpen(false);
 }
 return <Modal open={open} setOpen={setOpen} title="Действия компонента" size="lg"><p className="studio-hint">Действия выполняются по порядку для нажавшего участника. Для каждого варианта строкового меню можно настроить свой сценарий. Работает при отправке через LDS Bot после обновления Wispbyte.</p>
 {actions.map((a,i)=><article className="action-card" key={i}><div className="studio-field"><label>Действие {i+1}<select value={a.type} onChange={e=>{const type=Number(e.target.value);update(i,type===12?{type,message:{content:''},flags:64}:{type,roleId:''});}}>{!options.some(o=>o.type===a.type)&&<option value={a.type}>Неподдерживаемое действие {a.type}</option>}{options.map(o=><option key={o.type} value={o.type}>{o.label}</option>)}</select></label></div>
 {[3,4,5].includes(a.type)&&<label className="studio-field">ID роли<input inputMode="numeric" value={a.roleId||''} onChange={e=>update(i,{...a,roleId:e.target.value.trim()})} placeholder="1564024370064662618"/></label>}
 {a.type===12&&<><label className="studio-field">Текст ответа<textarea maxLength={2000} value={a.message?.content||''} onChange={e=>update(i,{...a,message:{content:e.target.value}})} placeholder="{user}, роль выдана!"/></label><p className="studio-hint">{'{user}'} — пинг автора; {'{username}'} — имя; {'{values}'} — выбранные значения меню.</p><label className="check-row"><input type="checkbox" checked={!!((a.flags??64)&64)} onChange={e=>update(i,{...a,flags:e.target.checked?64:0})}/>Ответ виден только нажавшему</label></>}
 <div className="studio-toolbar"><Button discordstyle={2} disabled={i===0} onClick={()=>setActions(old=>{const copy=[...old];[copy[i-1],copy[i]]=[copy[i],copy[i-1]];return copy;})}>↑</Button><Button discordstyle={2} disabled={i===actions.length-1} onClick={()=>setActions(old=>{const copy=[...old];[copy[i+1],copy[i]]=[copy[i],copy[i+1]];return copy;})}>↓</Button><Button discordstyle={2} onClick={()=>setActions(old=>old.filter((_,n)=>n!==i))}>Удалить</Button></div></article>)}
 <Button discordstyle={2} disabled={actions.length>=10} onClick={()=>setActions(old=>[...old,{type:3,roleId:''}])}>＋ Добавить действие</Button>{error&&<p className="studio-error" role="alert">{error}</p>}<ModalFooter><Button discordstyle={2} onClick={()=>setOpen(false)}>Отмена</Button><Button onClick={save}>Сохранить</Button></ModalFooter></Modal>;
}
