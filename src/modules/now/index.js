import {collection} from '../../components/collection.js';
export const render=records=>collection({id:'now',english:'HERE & NOW',title:'近况',description:'关于此刻的我，以及最近在关注的事。',action:'更新近况',empty:'为当下留一张快照',hint:'最近在做什么、学习什么，或对什么充满好奇？'},records.filter(r=>r.type==='now'));
