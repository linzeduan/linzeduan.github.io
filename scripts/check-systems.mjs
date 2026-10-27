import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
import {systems,render} from '../src/modules/systems/index.js';
for(const item of systems){
 const html=await readFile(`public/modules/${item.id}/index.html`,'utf8');
 for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 for(const match of html.matchAll(/href="([^"#][^"]*)"/g)){if(!/^(https?:|mailto:)/.test(match[1]))await access(new URL(match[1],new URL(`../public/modules/${item.id}/index.html`,import.meta.url)));}
 assert.ok(render([],item.id).includes(`src="${item.path}"`));
}
const wealth=await readFile('public/modules/wealth/index.html','utf8');
assert.ok(wealth.includes('const seedRows=[];'));
const seedScript=wealth.slice(wealth.indexOf('const initialMonth='),wealth.indexOf('const clone='));
assert.equal(vm.runInNewContext(`${seedScript}seed.months[seed.selected].accounts.length`),0);
assert.ok(!render([],'unknown').includes('<iframe'));
console.log('Module scripts, local links, routes and empty public ledger passed.');
