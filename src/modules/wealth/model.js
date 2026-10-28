import {readRaw,writeRaw} from '../../data/storage.js';
export const KEY='fuli-monthly-assets-v1';
export const groups=[['cash','现金'],['equity','权益'],['debt','债务']];
export const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
export function empty(){const m=currentMonth();return {version:1,selected:m,months:{[m]:{accounts:[],source:false,updated:null}}};}
export function validate(d){if(!d||d.version!==1||!d.months||typeof d.months!=='object'||Array.isArray(d.months))throw Error('备份格式不正确');const keys=Object.keys(d.months);if(!keys.length||keys.length>1212||!keys.includes(d.selected))throw Error('月份记录不正确');for(const m of keys){if(!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(m))throw Error('月份格式不正确');const a=d.months[m]?.accounts;if(!Array.isArray(a)||a.length>500)throw Error('账户记录不正确');const ids=new Set();for(const x of a){if(!x||typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>40||!groups.some(g=>g[0]===x.group)||!Number.isSafeInteger(x.cents)||x.cents<0||x.cents>1e14||typeof x.reviewed!=='boolean')throw Error('账户金额或名称不正确');ids.add(x.id);}}return d;}
export function load(){const raw=readRaw(KEY);return raw===null?empty():validate(JSON.parse(raw));}
export function save(state){load();validate(state);writeRaw(KEY,JSON.stringify(state));}
export function amount(raw){const s=raw.trim().replaceAll(',','');if(!/^\d+(\.\d{0,2})?$/.test(s))return null;const n=Math.round(Number(s)*100);return Number.isSafeInteger(n)&&n<=1e14?n:null;}
export function totals(accounts){const t={cash:0,equity:0,debt:0};for(const a of accounts)t[a.group]+=a.cents;return {...t,assets:t.cash+t.equity,net:t.cash+t.equity-t.debt};}
export function newMonth(state,m){if(!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(m))throw Error('请选择有效月份');if(state.months[m])throw Error('这个月份已存在');const previous=Object.keys(state.months).sort().filter(k=>k<m).pop();if(!previous)throw Error('请选择已有记录之后的月份');state.months[m]={accounts:structuredClone(state.months[previous].accounts).map(a=>({...a,reviewed:false})),source:false,updated:null};state.selected=m;}
