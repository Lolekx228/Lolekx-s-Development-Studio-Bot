// LDS Studio adaptation, 2026-10-14. See THIRD-PARTY-NOTICES.txt.
import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useObserver } from 'mobx-react-lite'
import { InputField } from '../../../common/input/text/InputField'
import { PrimaryButton } from '../../../common/input/button/PrimaryButton'
import { SecondaryButton } from '../../../common/input/button/SecondaryButton'
import { ButtonList } from '../../../common/layout/ButtonList'
import { Stack } from '../../../common/layout/Stack'
import { useRequiredContext } from '../../../common/state/useRequiredContext'
import { EditorManagerContext } from '../EditorManagerContext'
import { WebhookControls, WebhookControlsProps } from '../webhook/WebhookControls'
import clientApi from './client'
import { getEditorUrl } from '../getEditorUrl'

const Select = styled.select`width:100%;padding:10px;border:1px solid ${({theme})=>theme.backgroundModifier.accent};border-radius:3px;background:${({theme})=>theme.background.secondary};color:${({theme})=>theme.text.normal};font:inherit;`
const Note = styled.div`font-size:13px;line-height:1.4;color:${({theme})=>theme.text.muted};`
type Item = {id:string;name:string;category?:string}
export function DeliveryControls(props: WebhookControlsProps) {
  const [mode,setMode]=useState<'bot'|'webhook'>('bot')
  return <Stack gap={12}>
    <ButtonList><SecondaryButton aria-pressed={mode==='bot'} onClick={()=>setMode('bot')}>LDS Bot</SecondaryButton><SecondaryButton aria-pressed={mode==='webhook'} onClick={()=>setMode('webhook')}>Webhook</SecondaryButton></ButtonList>
    <div style={{display:mode==='bot'?'block':'none'}}><BotControls /></div>
    {mode==='webhook' && <WebhookControls {...props} />}
  </Stack>
}
function BotControls() {
  const manager=useRequiredContext(EditorManagerContext)
  const client=useRef(new clientApi.BotClient()).current
  const generation=useRef(0)
  const [url,setUrl]=useState('https://lolekx-api.wispbyte.app')
  const [connected,setConnected]=useState(false)
  const [busy,setBusy]=useState(false)
  const [guilds,setGuilds]=useState<Item[]>([])
  const [channels,setChannels]=useState<Item[]>([])
  const [guild,setGuild]=useState('')
  const [channel,setChannel]=useState('')
  const [manual,setManual]=useState('')
  const [pings,setPings]=useState(false)
  const [status,setStatus]=useState('Войдите через Discord для отправки. Редактор работает без входа.')
  const [results,setResults]=useState<{url?:string}[]>([])
  async function loadChannels(id:string) {
    const sequence=++generation.current;setChannels([]);setChannel('');setManual('');setGuild(id)
    if (!id) return
    try { const data=await client.channels(id);if(sequence===generation.current)setChannels(data.channels) }
    catch(error) {setStatus((error as Error).message);if(!client.token)setConnected(false)}
  }
  async function connect() {
    if(manager.messages.some(message=>message.files.length)){setStatus('Войдите перед загрузкой файлов, чтобы не потерять выбранные вложения. Или отправьте их в режиме Webhook.');return}
    setBusy(true);setResults([])
    try {const target=await client.startDiscord(url,getEditorUrl(manager));location.assign(target)}
    catch(error){setStatus((error as Error).message);setConnected(false)}
    finally{setBusy(false)}
  }
  useEffect(()=>{
    let active=true;
    async function finish(){
      setBusy(true);
      try{const data=await client.finishDiscord();if(!active||!data)return;setConnected(true);setGuilds(data.guilds);setUrl(client.origin);setStatus('Вы вошли как '+data.user.name+' · Бот: '+data.bot.name);if(data.guilds.length===1)await loadChannels(data.guilds[0].id)}
      catch(error){if(active)setStatus((error as Error).message)}
      finally{if(active)setBusy(false)}
    }
    finish();return ()=>{active=false};
  },[client])
  async function send() {
    setBusy(true);setResults([])
    try {
      const messages=manager.messages.map(message=>({...message.data,reference:message.reference}))
      const data=await client.send(messages,manual.trim()||channel,pings,(done:number,total:number)=>setStatus(`Отправлено ${done} / ${total}`))
      setResults(data);setStatus('Сообщения отправлены.')
    }catch(error){setStatus((error as Error).message);if(!client.token)setConnected(false)}
    finally{setBusy(false)}
  }
  return useObserver(()=><Stack gap={10}>
    {!connected ? <><div><PrimaryButton disabled={busy} onClick={connect}>{busy?'Подключаемся…':'Войти через Discord'}</PrimaryButton></div><Note>Discord подтвердит ваш аккаунт. Отправка доступна владельцу LDS Bot.</Note><details><summary>Адрес API</summary><InputField id="bot-api-url" label="Bot API URL" value={url} onChange={setUrl} disabled={busy}/></details></> : <>
    <label>Server<Select aria-label="Server" value={guild} onChange={event=>loadChannels(event.target.value)} disabled={busy}><option value="">Select server</option>{guilds.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
    <label>Channel<Select aria-label="Channel" value={channel} onChange={event=>{setChannel(event.target.value);setManual('')}} disabled={busy||!guild}><option value="">Select channel</option>{channels.map(item=><option key={item.id} value={item.id}># {item.name}{item.category?' · '+item.category:''}</option>)}</Select></label>
    <details><summary>Channel / Thread ID</summary><InputField id="bot-channel-id" label="Channel ID" value={manual} onChange={setManual} disabled={busy}/></details>
    <label><input type="checkbox" checked={pings} onChange={event=>setPings(event.target.checked)} disabled={busy}/> Allow user and role mentions</label>
    <ButtonList><PrimaryButton disabled={busy||!/^\d{17,20}$/.test(manual.trim()||channel)||!manager.messages.length} onClick={send}>{busy?'Sending…':'Send'}</PrimaryButton><SecondaryButton disabled={busy} onClick={()=>loadChannels(guild)}>Refresh</SecondaryButton><SecondaryButton disabled={busy} onClick={async()=>{++generation.current;try{await client.disconnect()}catch{}setConnected(false);setChannels([]);setGuilds([]);setChannel('');setGuild('');setManual('');setResults([]);setStatus('Отключено.')}}>Disconnect</SecondaryButton></ButtonList></>}
    <Note role="status" aria-live="polite">{status}</Note>
    {results.map((result,index)=>result.url?.startsWith('https://discord.com/channels/')?<a key={index} href={result.url} target="_blank" rel="noopener noreferrer">Open Message {index+1} ↗</a>:null)}
    <details><summary>Отправка через бота и Webhook</summary><Note>Бот отправляет текст и embeds в выбранный канал. Имя и аватар берутся из профиля бота. Файлы, изменение профиля, создание форумной ветки и редактирование сообщений доступны в режиме Webhook. @everyone и @here отключены при отправке через бота.</Note></details>
  </Stack>)
}
