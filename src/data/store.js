const key='zhongtai.records.v1';
const activeTypes=['health','investment','learning'];
export const escapeHTML=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stored(){const data=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(data))throw new Error('Invalid records');return data;}
export function readRecords(){try{return stored().filter(x=>x&&activeTypes.includes(x.type)&&typeof x.title==='string'&&typeof x.body==='string');}catch{return [];}}
export function addRecord(record){if(!activeTypes.includes(record.type)||typeof record.title!=='string'||!record.title.trim()||typeof record.body!=='string')throw new Error('Invalid record');const records=stored();records.unshift({type:record.type,title:record.title.trim(),body:record.body,id:crypto.randomUUID(),createdAt:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(records));}
