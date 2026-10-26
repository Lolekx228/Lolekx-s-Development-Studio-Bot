import React from 'react';
import {Modal} from '~/modals/Modal';
export const getQdMessageId=(message:any)=>message._id || (message._id=crypto.randomUUID());
export const getComponentId=(_component:any)=>undefined;
export const getGenericTargetInfo=(target:any)=>({name:target?.webhook?.name || target?.name || 'LDS Bot',avatar:target?.webhook?.avatar?{src:`https://cdn.discordapp.com/avatars/${target.webhook.id}/${target.webhook.avatar}.png`,srcSet:''}:undefined,createdAt:new Date(),checkmark:false});
export function FlowEditModal(props:any){return <Modal {...props} title="Обработчик компонента"><p>В этой версии обработчики выполняет ваш бот. Укажите custom_id и добавьте обработку interactionCreate в боте. Сценарии сервиса Discohook здесь не запускаются.</p></Modal>}
