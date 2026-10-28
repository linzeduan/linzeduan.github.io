import {cards} from '../../components/collection.js';
export const searchMarkup=()=>`<label class="record-search">搜索记录<input type="search" data-record-search placeholder="搜索标题或内容" autocomplete="off"></label><p class="muted" data-search-count role="status"></p>`;
export function render(records){return `<section class="page-heading"><div><span class="page-kicker">随时找回自己的积累</span><h1>全部记录</h1><p>搜索健康、投资、学习的标题和全文内容。</p></div></section>${searchMarkup()}<div class="record-grid">${cards(records)}</div>${records.length?'':'<p>还没有记录，点击右上角记一笔。</p>'}`;}
