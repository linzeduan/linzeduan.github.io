import {collection} from '../../components/collection.js';
export const render=records=>collection({id:'ideas',english:'SEEDS OF SOMETHING',title:'灵感',description:'还没成形也没关系，先把那个念头留下。',action:'记录灵感',empty:'下一个想法，从这里发芽',hint:'一个问题、一闪而过的念头，或一个想试试的方向。'},records.filter(r=>r.type==='ideas'));
