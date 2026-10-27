import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import './check-systems.mjs';
for(const file of await readdir('src',{recursive:true}))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',`src/${file}`]);
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
const {readRecords,addRecord,escapeHTML}=await import('../src/data/store.js');
assert.deepEqual(readRecords(),[]);addRecord({type:'learning',title:'测试',body:'<script>'});assert.equal(readRecords()[0].title,'测试');assert.equal(escapeHTML('<script>'),'&lt;script&gt;');
const legacy={type:'ideas',title:'原记录',body:'保留'};values.set('zhongtai.records.v1',JSON.stringify([legacy]));assert.deepEqual(readRecords(),[]);addRecord({type:'health',title:'散步',body:'二十分钟'});assert.ok(JSON.parse(values.get('zhongtai.records.v1')).some(r=>r.title==='原记录'));
values.set('zhongtai.records.v1','broken');assert.deepEqual(readRecords(),[]);assert.throws(()=>addRecord({type:'health',title:'测试',body:''}));assert.equal(values.get('zhongtai.records.v1'),'broken');values.delete('zhongtai.records.v1');
const {renderDomain}=await import('../src/modules/domains/index.js');const {render}=await import('../src/modules/overview/index.js');
const malicious={type:'learning',title:'<script>',body:'<img>',createdAt:new Date().toISOString()};
for(const id of ['health','investment','learning']){assert.ok(renderDomain(id,[]).length>100);assert.ok(!renderDomain(id,[malicious]).includes('<script>'));}
const home=render([malicious]);assert.ok(!home.includes('<script>'));for(const removed of ['富裕人生','近况','灵感','项目'])assert.ok(!home.includes(removed));
const {toggleHabit,readDaily}=await import('../src/components/habits.js');toggleHabit('move');assert.equal(readDaily().move,true);toggleHabit('move');assert.equal(readDaily().move,false);values.set('zhongtai.daily.v1',JSON.stringify({date:'2000-01-01',done:{move:true}}));assert.deepEqual(readDaily(),{});values.set('zhongtai.daily.v1','broken');assert.throws(()=>toggleHabit('move'));assert.equal(values.get('zhongtai.daily.v1'),'broken');
console.log('Syntax, new domain renders, escaping, legacy preservation, corrupt-storage protection and daily rollover passed.');
