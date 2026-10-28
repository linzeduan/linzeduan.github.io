// A small CSS 3D room. No remote models, textures, or runtime dependencies.
export function arrivalMarkup(){return `<dialog id="arrival" aria-labelledby="arrival-title"><div class="arrival-top"><a class="room-brand" href="#overview">LZ<span>一处留下足迹的地方</span></a><button type="button" class="room-skip" data-enter-garden>直接进入 ↗</button></div><div class="arrival-heading"><span class="room-eyebrow">A ROOM FOR THOUGHTS</span><h2 id="arrival-title">世界很大。<br>这里，留一点自己。</h2><p>走近书桌，打开正在生长的花园。</p></div><div class="room-camera"><div class="room-world"><div class="room-floor"></div><div class="room-wall room-wall-back"><div class="wall-art"><span></span><i></i></div><div class="room-window"><i></i><i></i></div></div><div class="room-wall room-wall-side"></div><div class="room-rug"></div><div class="room-desk"><div class="desk-top"></div><div class="desk-front"></div><div class="desk-leg leg-one"></div><div class="desk-leg leg-two"></div></div><div class="room-laptop"><div class="laptop-lid"><button class="laptop-screen" data-enter-garden aria-label="聚焦笔记本屏幕，进入花园"><span class="screen-bar"><i></i><i></i><i></i></span><span class="screen-sprout">✳</span><strong>我的花园</strong><span class="screen-caption">THOUGHTS · WORK · LIFE</span><span class="screen-enter">点击进入 ↗</span></button></div><div class="laptop-base"><div class="laptop-keys"></div><div class="laptop-trackpad"></div></div></div><div class="room-books"><i></i><i></i><i></i></div><div class="room-cup"><i></i></div><div class="room-lamp"><i class="lamp-base"></i><i class="lamp-stem"></i><i class="lamp-head"></i><i class="lamp-light"></i></div><div class="room-plant"><div class="plant-pot"></div><i class="plant-stem"></i><i class="plant-leaf leaf-one"></i><i class="plant-leaf leaf-two"></i><i class="plant-leaf leaf-three"></i><i class="plant-leaf leaf-four"></i></div></div></div><div class="arrival-bottom"><span>01 / 进入我的空间</span><button type="button" class="button room-enter" data-enter-garden>打开花园 <span>↗</span></button><span>记录 · 思考 · 创造</span></div></dialog>`;}

export function mountArrival(){
 const dialog=document.querySelector('#arrival'),camera=dialog.querySelector('.room-camera'),world=dialog.querySelector('.room-world'),page=document.querySelector('#page'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let busy=false,animation=null,returnFocus=null,savedScroll=0;
 function show(source){if(busy||dialog.open)return;returnFocus=source||null;savedScroll=window.scrollY;dialog.showModal();document.body.classList.add('in-room');dialog.querySelector('.room-enter').focus({preventScroll:true});}
 async function enter(){if(busy||!dialog.open)return;busy=true;const screen=dialog.querySelector('.laptop-screen').getBoundingClientRect(),bounds=camera.getBoundingClientRect();
  if(!reduce.matches&&typeof camera.animate==='function'){
   const scale=Math.max(innerWidth/screen.width,innerHeight/screen.height)*1.15,dx=innerWidth/2-(screen.left+screen.width/2),dy=innerHeight/2-(screen.top+screen.height/2);
   dialog.classList.add('entering');animation=camera.animate([{transform:'none',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:1,offset:.78},{transform:`translate(${dx}px,${dy}px) scale(${scale*1.04})`,opacity:0}],{duration:1150,easing:'cubic-bezier(.65,0,.25,1)',fill:'forwards'});
   camera.style.transformOrigin=`${screen.left+screen.width/2-bounds.left}px ${screen.top+screen.height/2-bounds.top}px`;
   try{await animation.finished;}catch{}
  }
  dialog.close();document.body.classList.remove('in-room');animation?.cancel();dialog.classList.remove('entering');world.style.removeProperty('--look-x');world.style.removeProperty('--look-y');busy=false;
  try{const old=sessionStorage.getItem('zhongtai.arrival.v1');if(old===null||old==='entered')sessionStorage.setItem('zhongtai.arrival.v1','entered');}catch{}
  (returnFocus?.isConnected?returnFocus:page).focus({preventScroll:true});window.scrollTo({top:savedScroll,behavior:'instant'});
 }
 dialog.querySelectorAll('[data-enter-garden]').forEach(b=>b.addEventListener('click',enter));dialog.addEventListener('cancel',e=>{e.preventDefault();enter();});
 document.querySelector('#return-scene').addEventListener('click',e=>show(e.currentTarget));
 // Pointer movement only adds a subtle look-around; it never changes modes.
 camera.addEventListener('pointermove',e=>{if(busy||reduce.matches||e.pointerType!=='mouse')return;world.style.setProperty('--look-x',((e.clientY/innerHeight-.5)*-3).toFixed(2)+'deg');world.style.setProperty('--look-y',((e.clientX/innerWidth-.5)*4).toFixed(2)+'deg');});
 camera.addEventListener('pointerleave',()=>{world.style.removeProperty('--look-x');world.style.removeProperty('--look-y');});
 reduce.addEventListener('change',()=>{if(reduce.matches)animation?.finish();});
 let visited=false;try{visited=sessionStorage.getItem('zhongtai.arrival.v1')==='entered';}catch{}
 if(!visited&&['','#overview'].includes(location.hash)&&typeof dialog.showModal==='function')show();
}
