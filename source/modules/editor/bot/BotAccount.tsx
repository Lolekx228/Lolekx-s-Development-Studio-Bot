import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../../common/input/button/PrimaryButton'
import { SecondaryButton } from '../../../common/input/button/SecondaryButton'
import { useRequiredContext } from '../../../common/state/useRequiredContext'
import { EditorManagerContext } from '../EditorManagerContext'
import { getEditorUrl } from '../getEditorUrl'
import clientApi from './client'
type Connection={bot:{name:string};guilds:{id:string;name:string}[];user:{id:string;name:string}}
type Account={client:InstanceType<typeof clientApi.BotClient>;url:string;setUrl:(url:string)=>void;connection:Connection|null;busy:boolean;error:string;login:()=>Promise<void>;logout:()=>Promise<void>;invalidate:()=>void}
const Context=createContext<Account|null>(null)
export function useBotAccount(){const value=useContext(Context);if(!value)throw Error('Bot account provider missing');return value}
export function BotAccountProvider({children}:{children:React.ReactNode}){
 const manager=useRequiredContext(EditorManagerContext)
 const client=useRef(new clientApi.BotClient()).current
 const [url,setUrl]=useState('https://lolekx-api.wispbyte.app'),[connection,setConnection]=useState<Connection|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let active=true;(async()=>{
  try{const data=await client.finishDiscord()||await client.restoreSession();if(active&&data){setConnection(data);setUrl(client.origin)}}catch(e){if(active)setError((e as Error).message)}finally{if(active)setBusy(false)}
 })();return()=>{active=false}},[client])
 async function login(){
  if(manager.messages.some(message=>message.files.length)){setError('Войдите до загрузки вложений или отправьте их через Webhook.');return}
  setBusy(true);setError('');try{location.assign(await client.startDiscord(url,getEditorUrl(manager)))}catch(e){setError((e as Error).message);setBusy(false)}
 }
 async function logout(){setBusy(true);try{await client.disconnect()}catch{}finally{setConnection(null);setBusy(false);setError('')}}
 return <Context.Provider value={{client,url,setUrl,connection,busy,error,login,logout,invalidate:()=>setConnection(null)}}>{children}</Context.Provider>
}
export function AccountButton(){const account=useBotAccount();return <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
 {account.connection?<><span title={account.connection.user.name} style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{account.connection.user.name} ✓</span><SecondaryButton disabled={account.busy} onClick={account.logout}>Выйти</SecondaryButton></>:<PrimaryButton disabled={account.busy} onClick={account.login}>{account.busy?'Проверяем вход…':'Войти через Discord'}</PrimaryButton>}
 </div>}
