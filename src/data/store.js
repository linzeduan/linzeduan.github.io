import {readJSON,writeRaw} from './storage.js';
const key='zhongtai.records.v1';
const activeTypes=['health','investment','learning'];
export const escapeHTML=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateRecords(data){if(!Array.isArray(data)||data.some(x=>!x||typeof x!=='object'||Array.isArray(x)||typeof x.type!=='string'||typeof x.title!=='string'||typeof x.body!=='string'))throw new Error('Invalid records');return data;}
function stored(){return validateRecords(readJSON(key,[]));}
export function readRecords(){try{return stored().filter(x=>x&&activeTypes.includes(x.type)&&typeof x.title==='string'&&typeof x.body==='string');}catch{return [];}}
export function addRecord(record){validateRecord(record);const records=stored();records.unshift({...record,title:record.title.trim(),id:crypto.randomUUID(),createdAt:new Date().toISOString()});writeRaw(key,JSON.stringify(records));}
function validateRecord(r){if(!activeTypes.includes(r.type)||typeof r.title!=='string'||!r.title.trim()||typeof r.body!=='string')throw Error('Invalid record');}
// Compare the whole original row: prevents stale tabs and duplicate legacy IDs from editing another row.
export const recordToken=r=>JSON.stringify(r);
function target(records,token){const matches=records.map((r,i)=>recordToken(r)===token?i:-1).filter(i=>i>=0);if(matches.length!==1)throw Error('记录已变化或存在重复，请刷新后重试。');return matches[0];}
export function updateRecord(token,patch){validateRecord(patch);const records=stored(),i=target(records,token);records[i]={...records[i],type:patch.type,title:patch.title.trim(),body:patch.body,updatedAt:new Date().toISOString()};writeRaw(key,JSON.stringify(records));}
export function deleteRecord(token){const records=stored();records.splice(target(records,token),1);writeRaw(key,JSON.stringify(records));}
export function searchRecords(records,query){const q=query.trim().toLocaleLowerCase();return records.filter(r=>(r.title+'\n'+r.body).toLocaleLowerCase().includes(q));}
