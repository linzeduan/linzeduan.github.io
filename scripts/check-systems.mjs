import assert from 'node:assert/strict';
import beliefs from '../src/modules/beliefs/content.js';
import discipline from '../src/modules/discipline/content.js';
import {systems,render} from '../src/modules/systems/index.js';
import {empty,validate,newMonth,amount,totals} from '../src/modules/wealth/model.js';
assert.equal(beliefs.chapters.length,5);assert.equal(beliefs.chapters.flatMap(c=>c.items).length,18);assert.equal(discipline.chapters.length,6);
for(const item of systems){const html=render([],item.id);assert.ok(!html.includes('<iframe'));assert.ok(html.includes(item.title));}
const state=empty();assert.deepEqual(state.months[state.selected].accounts,[]);assert.equal(amount('10.01'),1001);assert.equal(amount('1.001'),null);assert.equal(amount('-1'),null);
state.selected='2026-01';state.months={'2026-01':{accounts:[{id:'a',name:'旧账本',group:'cash',cents:1001,reviewed:true}]}};validate(state);newMonth(state,'2026-02');assert.equal(state.months['2026-02'].accounts[0].reviewed,false);state.months['2026-02'].accounts[0].cents=2000;assert.equal(state.months['2026-01'].accounts[0].cents,1001);assert.equal(totals([{group:'cash',cents:1000},{group:'debt',cents:300}]).net,700);assert.throws(()=>validate({...state,selected:'missing'}));assert.throws(()=>newMonth(state,'2026-02'));
console.log('Native content, routes, legacy ledger compatibility, amounts and month isolation passed.');
