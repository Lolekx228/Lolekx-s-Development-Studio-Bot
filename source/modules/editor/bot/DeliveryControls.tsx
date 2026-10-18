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
import { useBotAccount } from './BotAccount'

const Select = styled.select`width:100%;padding:10px;border:1px solid ${({theme})=>theme.backgroundModifier.accent};border-radius:3px;background:${({theme})=>theme.background.secondary};color:${({theme})=>theme.text.normal};font:inherit;`
const Note = styled.div`font-size:13px;line-height:1.4;color:${({theme})=>theme.text.muted};`
type Item = {id:string;name:string;category?:string}
export function DeliveryControls(props: WebhookControlsProps) {
  const {deliveryMode:mode,setDeliveryMode:setMode}=useBotAccount()
  return <Stack gap={12}>
    <ButtonList><SecondaryButton aria-pressed={mode==='bot'} onClick={()=>setMode('bot')}>LDS Bot</SecondaryButton><SecondaryButton aria-pressed={mode==='webhook'} onClick={()=>setMode('webhook')}>Webhook</SecondaryButton></ButtonList>
    <div style={{display:mode==='bot'?'block':'none'}}><BotControls /></div>
    {mode==='webhook' && <WebhookControls {...props} />}
  </Stack>
}
function BotControls() {
  const manager=useRequiredContext(EditorManagerContext)
  const account=useBotAccount()
  const {client,url,setUrl}=account
  const connected=!!account.connection
  const generation=useRef(0)
  const [sending,setSending]=useState(false)
  const busy=sending||account.busy
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
    catch(error) {setStatus((error as Error).message);if(!client.token)account.invalidate()}
  }
  useEffect(()=>{
    ++generation.current;
    setGuilds(account.connection?.guilds||[]);setGuild('');setChannels([]);setChannel('');setManual('');setResults([]);
    if(account.connection){setStatus('Бот: '+account.connection.bot.name);if(account.connection.guilds.length===1)loadChannels(account.connection.guilds[0].id)}
    else setStatus('Войдите через кнопку справа вверху. Редактор работает без входа.');
  },[account.connection])
  async function send() {
    setSending(true);setResults([])
    try {
      const messages=manager.messages.map(message=>({...message.data,reference:message.reference}))
      const data=await client.send(messages,manual.trim()||channel,pings,(done:number,total:number)=>setStatus(`Отправлено ${done} / ${total}`))
      setResults(data);data.forEach((item:any,index:number)=>{const message=manager.messages[index];if(item.url){message.set('reference',item.url);message.set('files',[]);message.set('retainedAttachments',item.attachments||[])}});if(data.length&&data.every((item:any)=>item.channel_id===data[0].channel_id))setManual(data[0].channel_id);setStatus('Сообщения отправлены.')
    }catch(error){setStatus((error as Error).message);if(!client.token)account.invalidate()}
    finally{setSending(false)}
  }
  return useObserver(()=><Stack gap={10}>
    {!connected ? <><Note>Вход в аккаунт — справа вверху.</Note><details><summary>Адрес API</summary><InputField id="bot-api-url" label="Bot API URL" value={url} onChange={setUrl} disabled={busy}/></details></> : <>
    <label>Server<Select aria-label="Server" value={guild} onChange={event=>loadChannels(event.target.value)} disabled={busy}><option value="">Select server</option>{guilds.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
    <label>Channel<Select aria-label="Channel" value={channel} onChange={event=>{setChannel(event.target.value);setManual('')}} disabled={busy||!guild}><option value="">Select channel</option>{channels.map(item=><option key={item.id} value={item.id}># {item.name}{item.category?' · '+item.category:''}</option>)}</Select></label>
    <details><summary>Channel / Thread ID</summary><InputField id="bot-channel-id" label="Channel ID" value={manual} onChange={setManual} disabled={busy}/></details>
    <label><input type="checkbox" checked={pings} onChange={event=>setPings(event.target.checked)} disabled={busy}/> Allow user and role mentions</label>
    <ButtonList><PrimaryButton disabled={busy||!/^\d{17,20}$/.test(manual.trim()||channel)||!manager.messages.length} onClick={send}>{busy?'Sending…':manager.messages.every(message=>message.reference)?'Edit':'Send / Edit'}</PrimaryButton><SecondaryButton disabled={busy} onClick={()=>loadChannels(guild)}>Refresh</SecondaryButton></ButtonList></>}
    <Note role="status" aria-live="polite">{account.error||status}</Note>
    {results.map((result,index)=>result.url?.startsWith('https://discord.com/channels/')?<a key={index} href={result.url} target="_blank" rel="noopener noreferrer">Open Message {index+1} ↗</a>:null)}
    <details><summary>Отправка через бота и Webhook</summary><Note>Бот отправляет текст, embeds и файлы; Message Link → Load загружает сообщение. Собственные сообщения бот редактирует, чужие можно загрузить как основу для нового. Thread Name создаёт пост в выбранном форуме. Имя и аватар отдельного сообщения меняются через Webhook. @everyone и @here у бота отключены.</Note></details>
  </Stack>)
}
