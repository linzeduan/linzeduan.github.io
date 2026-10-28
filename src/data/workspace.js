import {KEYS,readJSON,writeRaw} from './storage.js';
export const statuses=['进行中','待开始','暂停','已完成'];
export function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function validateItems(items,kind){if(!Array.isArray(items))throw Error('列表格式不正确');const ids=new Set();for(const x of items){if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id)||typeof x.title!=='string'||!x.title.trim())throw Error('条目名称或 ID 不正确');ids.add(x.id);if(kind==='projects'){if(!statuses.includes(x.status)||['problem','outcome','nextStep','links'].some(k=>typeof x[k]!=='string')||x.links.split('\n').filter(Boolean).some(u=>!safeURL(u.trim())))throw Error('项目字段或链接不正确');}else if(typeof x.url!=='string'||!safeURL(x.url)||typeof x.description!=='string')throw Error('应用链接不正确');}return items;}
export function readItems(kind){return validateItems(readJSON(KEYS[kind],[]),kind);}
export function saveItem(kind,item,original=null){const items=readItems(kind);const i=original?items.findIndex(x=>x.id===original.id):-1;if(original&&(i<0||JSON.stringify(items[i])!==JSON.stringify(original)))throw Error('条目已变化，请刷新后重试。');const next={...item,id:original?.id||crypto.randomUUID(),updatedAt:new Date().toISOString()};if(i<0)items.unshift(next);else items[i]=next;validateItems(items,kind);writeRaw(KEYS[kind],JSON.stringify(items));return next;}
export function removeItem(kind,original){const items=readItems(kind),i=items.findIndex(x=>JSON.stringify(x)===JSON.stringify(original));if(i<0)throw Error('条目已变化');items.splice(i,1);writeRaw(KEYS[kind],JSON.stringify(items));}
export function readFocus(){const x=readJSON(KEYS.focus,{text:''});if(!x||typeof x.text!=='string')throw Error('优先事项无法读取');return x;}
export function saveFocus(text){readFocus();writeRaw(KEYS.focus,JSON.stringify({text:text.trim()}));}
export const validRoute=route=>/^(health|investment|learning|projects|apps|systems(?:\/(beliefs|discipline))?)$/.test(route);
export function readProgress(){const x=readJSON(KEYS.progress,null);if(x!==null&&(!x||!validRoute(x.route)||!Number.isFinite(x.scroll)||x.scroll<0))throw Error('进度无法读取');return x;}
export function saveProgress(route,scroll){if(!validRoute(route))return;readProgress();writeRaw(KEYS.progress,JSON.stringify({route,scroll,updatedAt:new Date().toISOString()}));}
