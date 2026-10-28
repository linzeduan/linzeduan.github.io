import * as T from './vendor/three.module.js';

export async function applyMaterials(walnut,chair){
 const loader=new T.TextureLoader();
 async function material(target,folder,prefix,strength,color){
  const maps=await Promise.all(['Color','NormalGL','Roughness'].map(type=>loader.loadAsync(new URL(`./assets/${folder}/${prefix}_${type}.jpg`,import.meta.url).href)));
  maps.forEach((t,i)=>{t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;if(i===0)t.colorSpace=T.SRGBColorSpace;});
  [target.map,target.normalMap,target.roughnessMap]=maps;target.normalScale=new T.Vector2(strength,strength);target.color.set(color);target.needsUpdate=true;
 }
 return Promise.allSettled([material(walnut,'wood','Wood051_1K-JPG',.16,'#f5e9d4'),material(chair,'fabric','Fabric030_1K-JPG',.3,'#c5bba8')]);
}

export function sceneryTexture(){
 const c=document.createElement('canvas');c.width=1024;c.height=768;const x=c.getContext('2d');
 const sky=x.createLinearGradient(0,0,0,768);sky.addColorStop(0,'#b6c6c2');sky.addColorStop(.53,'#e1e1cc');sky.addColorStop(1,'#aab2a0');x.fillStyle=sky;x.fillRect(0,0,1024,768);
 for(let layer=0;layer<5;layer++){
  x.fillStyle=['#aab8ad','#99ab9a','#879b85','#768d73','#637e63'][layer];x.beginPath();x.moveTo(0,768);
  for(let i=0;i<=1024;i+=8){const y=380+layer*58+Math.sin(i*.004+layer*1.6)*47+Math.sin(i*.011+layer)*13;x.lineTo(i,y);}x.lineTo(1024,768);x.fill();
 }
 x.filter='blur(3px)';x.globalAlpha=.32;for(let i=0;i<65;i++){const px=(i*179)%1050,py=510+Math.sin(i*1.3)*50;x.fillStyle='#41634c';x.beginPath();x.ellipse(px,py,12+i%4*6,48+i%5*8,-.2,0,Math.PI*2);x.fill();}x.filter='none';
 const haze=x.createLinearGradient(0,100,0,768);haze.addColorStop(0,'#e9e1c52b');haze.addColorStop(1,'#e9e1c500');x.globalAlpha=1;x.fillStyle=haze;x.fillRect(0,0,1024,768);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

export function contactShadows(scene){
 const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,4,64,64,63);g.addColorStop(0,'rgba(24,19,12,.48)');g.addColorStop(.35,'rgba(24,19,12,.23)');g.addColorStop(1,'rgba(24,19,12,0)');x.fillStyle=g;x.fillRect(0,0,128,128);const map=new T.CanvasTexture(c);
 const add=(px,pz,w,d,y,opacity)=>{const o=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,opacity}));o.rotation.x=-Math.PI/2;o.position.set(px,y,pz);scene.add(o);};
 add(0,-.2,3.5,2,.043,.42);add(1.85,-1.45,.9,.9,.044,.8);add(-.46,1.05,1.4,1.4,.048,.4);add(.87,.12,.36,.34,1.077,.6);add(-1,-.24,.74,.6,1.077,.38);add(1.1,-.65,.52,.5,1.077,.5);
}

export function mugGeometry(){
 const profile=[[0,0],[.075,0],[.083,.012],[.096,.145],[.096,.17],[.093,.175],[.087,.172],[.086,.15],[.075,.02],[0,.02]];
 return new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),64);
}
