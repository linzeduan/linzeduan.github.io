import {shell,navigation} from './layout/shell.js';
import {readRecords,addRecord} from './data/store.js';
import {render as overview} from './modules/overview/index.js';
import {render as projects} from './modules/projects/index.js';
import {render as ideas} from './modules/ideas/index.js';
import {render as now} from './modules/now/index.js';
import {render as systems} from './modules/systems/index.js';
const routes={overview,projects,ideas,now,systems};
document.querySelector('#app').innerHTML=shell();
try{document.documentElement.dataset.theme=localStorage.getItem('zhongtai.theme')||'light';}catch{}
function render(){const [route,selected]=location.hash.slice(1).split('/');const id=Object.hasOwn(routes,route)?route:'overview';document.querySelector('#page').innerHTML=routes[id](readRecords(),selected);document.querySelector('#page-label').textContent=navigation.find(n=>n.id===id).label;document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===id);if(a.dataset.nav===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.body.classList.remove('nav-open');}
window.addEventListener('hashchange',render);window.addEventListener('storage',render);render();
const dialog=document.querySelector('#editor');const form=document.querySelector('#record-form');
document.addEventListener('click',event=>{const add=event.target.closest('[data-add]');if(add){form.reset();form.elements.type.value=add.dataset.add;document.querySelector('#form-error').textContent='';dialog.showModal();form.elements.title.focus();}});
document.querySelector('#close-editor').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
form.onsubmit=event=>{event.preventDefault();const title=form.elements.title.value.trim();if(!title){form.elements.title.setCustomValidity('请输入标题');form.elements.title.reportValidity();return;}try{addRecord({type:form.elements.type.value,title,body:form.elements.body.value.trim()});dialog.close();render();}catch{document.querySelector('#form-error').textContent='未能保存，浏览器存储可能已满或被禁用。请先保留你的内容。';}};
form.elements.title.oninput=()=>form.elements.title.setCustomValidity('');
document.querySelector('#theme-toggle').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('zhongtai.theme',theme);}catch{}};
document.querySelector('#menu-toggle').onclick=()=>document.body.classList.toggle('nav-open');
