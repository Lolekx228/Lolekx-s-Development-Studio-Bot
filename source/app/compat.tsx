import React from 'react';
export {FlowEditModal} from './ActionFlowModal';
export const getQdMessageId=(message:any)=>message._id || (message._id=crypto.randomUUID());
export const getComponentId=(_component:any)=>undefined;
export const getGenericTargetInfo=(target:any)=>({name:target?.webhook?.name || target?.name || 'LDS Bot',avatar:target?.webhook?.avatar?{src:`https://cdn.discordapp.com/avatars/${target.webhook.id}/${target.webhook.avatar}.png`,srcSet:''}:undefined,createdAt:new Date(),checkmark:false});
