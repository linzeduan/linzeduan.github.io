import {icon} from './icons.js';
const key='zhongtai.daily.v1';
export const habits=[{id:'move',label:'让身体动一动',detail:'散步、拉伸，或喜欢的运动',icon:'health'},{id:'pause',label:'给判断留一点时间',detail:'行动之前，回看自己的理由',icon:'investment'},{id:'read',label:'学一点新东西',detail:'读几页书，或弄懂一个问题',icon:'learning'}];
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
export function readDaily(){const raw=localStorage.getItem(key);if(!raw)return {};const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid daily data');return data.date===today()?data.done||{}:{};}
export function toggleHabit(id){if(!habits.some(h=>h.id===id))throw new Error('Unknown habit');const done={...readDaily()};done[id]=!done[id];localStorage.setItem(key,JSON.stringify({date:today(),done}));}
export function habitsMarkup(){let done={};try{done=readDaily();}catch{}return `<div class="habits">${habits.map(h=>`<button class="habit${done[h.id]?' complete':''}" data-habit="${h.id}" aria-pressed="${!!done[h.id]}"><span class="habit-check">${done[h.id]?icon('check'):''}</span><span class="habit-copy"><strong>${h.label}</strong><small>${h.detail}</small></span>${icon(h.icon)}</button>`).join('')}</div><p class="habit-status" role="status"></p>`;}
