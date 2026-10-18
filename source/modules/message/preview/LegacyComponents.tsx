import React from 'react'
export function LegacyComponents({components}:{components:readonly unknown[]}){
 return <>{components.map((item:any,index)=>item?.type===1&&Array.isArray(item.components)?<div key={index} style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>{item.components.map((control:any,n:number)=>control.type===2?<button type="button" key={n} disabled style={{background:control.style===1?'#5865f2':control.style===3?'#248046':control.style===4?'#da373c':'#4e5058',color:'#fff',border:0,borderRadius:3,padding:'8px 14px',font:'inherit',opacity:control.disabled ? 0.5 : 1}}>{control.emoji?.name||''} {control.label||'Button'}{control.style===5?' ↗':''}</button>:<select disabled key={n} aria-label={control.placeholder||'Select'} style={{padding:8,minWidth:180}}><option>{control.placeholder||'Select an option'}</option></select>)}</div>:null)}</>
}

