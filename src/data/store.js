const key='zhongtai.records.v1';
export const escapeHTML=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readRecords(){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(x=>x&&['projects','ideas','now'].includes(x.type)&&typeof x.title==='string'&&typeof x.body==='string'):[];}catch{return [];}}
export function addRecord(record){const records=readRecords();records.unshift({...record,id:crypto.randomUUID(),createdAt:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(records));}
