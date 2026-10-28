// Recovery changes the active copy, never the original unreadable value.
export const KEYS={records:'zhongtai.records.v1',daily:'zhongtai.daily.v1',projects:'zhongtai.projects.v2',apps:'zhongtai.apps.v2',focus:'zhongtai.focus.v2',progress:'zhongtai.progress.v2',wealth:'fuli-monthly-assets-v1',theme:'zhongtai.theme'};
export const POINTER='zhongtai.active.v2',BACKUP='zhongtai.backup.v2';
export function pointers(){const raw=localStorage.getItem(POINTER);if(raw===null)return {};const p=JSON.parse(raw);if(!p||Array.isArray(p)||typeof p!=='object'||Object.entries(p).some(([k,v])=>!Object.values(KEYS).includes(k)||typeof v!=='string'||!v.startsWith('zhongtai.copy.')))throw Error('数据索引无法读取，请先导出原始数据。');return p;}
export function readRaw(key){const p=pointers(),raw=localStorage.getItem(p[key]||key);if(p[key]&&raw===null)throw Error('数据副本缺失，请导出并恢复。');return raw;}
export function writeRaw(key,value){localStorage.setItem(pointers()[key]||key,value);}
export function readJSON(key,fallback){const raw=readRaw(key);return raw===null?structuredClone(fallback):JSON.parse(raw);}
export function activate(data){const p=pointers(),next={...p},staged=[];try{for(const [key,raw] of Object.entries(data)){const copy='zhongtai.copy.'+crypto.randomUUID();localStorage.setItem(copy,raw);staged.push(copy);next[key]=copy;}localStorage.setItem(POINTER,JSON.stringify(next));}catch(error){for(const key of staged)try{localStorage.removeItem(key);}catch{}throw error;}}
