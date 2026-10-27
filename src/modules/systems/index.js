import {icon} from '../../components/icons.js';
import * as beliefs from '../beliefs/index.js';
import * as discipline from '../discipline/index.js';
import * as wealth from '../wealth/index.js';
export const systems=[
 {id:'beliefs',title:'人生信念',subtitle:'内在的方向',description:'关于选择、自由、身体、成长与长期主义。',icon:'ideas'},
 {id:'discipline',title:'投资纪律',subtitle:'决策的边界',description:'先保证生活，再追求收益。给投资决策留一道边界。',icon:'projects'},
 {id:'wealth',title:'富裕人生',subtitle:'每月的积累',description:'记录账户、资产与债务，为生活留出更多选择。',icon:'now'}
];
const modules={beliefs,discipline,wealth};
export function entries(){return `<div class="record-grid">${systems.map(s=>`<a class="record-card glass system-card" href="#systems/${s.id}"><span class="module-icon ${s.icon}">${icon(s.icon)}</span><div class="record-meta"><span>${s.subtitle}</span>${icon('arrow')}</div><h3>${s.title}</h3><p>${s.description}</p></a>`).join('')}</div>`;}
export function render(records,selected){const active=systems.find(s=>s.id===selected);return `<section class="page-heading"><div><span class="eyebrow">${active?active.subtitle:'A SYSTEM FOR LIVING'}</span><h1>${active?active.title:'生活系统'}<span class="heading-dot">.</span></h1><p>${active?active.description:'相信什么，如何决定，以及怎样一点点积累。'}</p></div></section>${active?modules[active.id].render():entries()}`;}
export function mount(root,selected){if(Object.hasOwn(modules,selected))modules[selected].mount(root);}
