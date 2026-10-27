import {collection} from '../../components/collection.js';
export const render=records=>collection({id:'projects',english:'SELECTED WORK',title:'项目',description:'做过的、正在做的，值得被看见的。',action:'添加项目',empty:'好作品，值得一个位置',hint:'从一个你最想留下的项目开始。'},records.filter(r=>r.type==='projects'));
