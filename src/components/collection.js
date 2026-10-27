import {escapeHTML} from '../data/store.js';
export function cards(records){return records.map(r=>`<article class="record-card glass"><div class="record-meta"><span>${{health:'健康',investment:'投资',learning:'学习'}[r.type]}</span><time>${new Date(r.createdAt).toLocaleDateString('zh-CN')}</time></div><h3>${escapeHTML(r.title)}</h3><p>${escapeHTML(r.body)}</p></article>`).join('');}
