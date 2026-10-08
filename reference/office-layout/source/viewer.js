import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eceee9');
const canvas=document.querySelector('#view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(14.5,14.8,18.9);
const controls=new OrbitControls(camera,canvas);controls.target.set(5.5,0,4.5);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=8;controls.maxDistance=40;
scene.add(new THREE.HemisphereLight(0xffffff,0xc1b6a4,2.2));
const sun=new THREE.DirectionalLight(0xfff7e8,3);sun.position.set(-3,17,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17});sun.shadow.normalBias=.035;scene.add(sun);
const model=new THREE.Group();model.name='Office_99sqm_concept_meters';scene.add(model);
const outer=[];
let activeStyle=null;
for(const o of window.LAYOUT){
 const mat=new THREE.MeshStandardMaterial({color:o.color,roughness:.76,transparent:o.opacity<1,opacity:o.opacity,depthWrite:o.opacity>=1});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w,o.h,o.d),mat);mesh.name=o.name;mesh.position.set(o.x+o.w/2,o.z+o.h/2,9-o.y-o.d/2);mesh.castShadow=o.kind!=='glass';mesh.receiveShadow=true;mesh.userData={...o};model.add(mesh);
 if(o.kind==='outer')outer.push(mesh);
}
// Low perimeter cutaway keeps furniture visible; all design coordinates are shared with the plan.
function walls(full){for(const m of outer){const o=m.userData;const h=full||o.name==='후면 벽'?o.h:.24;m.scale.y=h/o.h;m.position.y=o.z+h/2;}}
walls(false);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#eceee9',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;scene.add(ground);
const tags=new THREE.Group();scene.add(tags);
function tag(text,x,z,width=2.7){
 const c=document.createElement('canvas');c.width=700;c.height=140;const ctx=c.getContext('2d');ctx.fillStyle='rgba(250,250,245,.94)';ctx.beginPath();ctx.roundRect(4,4,692,132,25);ctx.fill();ctx.fillStyle='#2d493d';ctx.font='600 48px "Apple SD Gothic Neo", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,350,72);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));s.scale.set(width,width*.2,1);s.position.set(x,1.1,z);s.renderOrder=10;tags.add(s);
}
tag('01  대표실',1.65,3.1,2);tag('02  회의실 · 6인',5.5,3.1,2.6);tag('03  탕비실',9.4,3.1,2);tag('04  직원 8석',4.4,8.5,2.5);
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
function frame(){requestAnimationFrame(frame);controls.update();renderer.render(scene,camera);}frame();
function reset(){camera.position.set(14.5,14.8,18.9);controls.target.set(5.5,0,4.5);controls.update();}
document.querySelector('#reset').onclick=reset;
document.querySelector('#top').onclick=()=>{camera.position.set(5.5,23,4.501);controls.target.set(5.5,0,4.5);controls.update();};
document.querySelector('#walls').onchange=e=>walls(e.target.checked);
document.querySelector('#labels').onchange=e=>tags.visible=e.target.checked;
document.querySelector('#plan').onclick=()=>{document.querySelector('#planModal').showModal();};
document.querySelector('#closePlan').onclick=()=>document.querySelector('#planModal').close();
document.querySelector('#save').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='사무실_'+(activeStyle?.name||'내추럴')+'_3D.png';a.href=renderer.domElement.toDataURL('image/png');a.click();};
window.setTheme=(id)=>{
 const style=window.STYLES?.find(s=>s.id===id);if(!style)return;
 activeStyle=style;
 for(const mesh of model.children){
  const original=mesh.userData.color;
  mesh.material.color.set(style.colors[original]||original);
  mesh.material.roughness=style.id==='chic'?.58:.76;
  mesh.material.metalness=style.id==='lovely'&&original==='#344943'?.35:0;
 }
 scene.background.set(style.background);ground.material.color.set(style.background);
 document.documentElement.style.setProperty('--style-accent',style.accent);
 const heading=document.querySelector('#styleName');if(heading)heading.textContent=style.code+' · '+style.name;
 const description=document.querySelector('#styleDescription');if(description)description.textContent=style.description;
 const chips=document.querySelector('#stylePalette');if(chips)chips.innerHTML=style.palette.map(([name,color])=>`<span><i style="background:${color}"></i>${name}</span>`).join('');
 document.querySelectorAll('[data-theme]').forEach(b=>{b.classList.toggle('active',b.dataset.theme===id);b.setAttribute('aria-pressed',b.dataset.theme===id?'true':'false');});
 const plan=document.querySelector('#themePlan');if(plan)plan.innerHTML=window.THEME_PLANS[id];
 window.activeTheme=id;renderer.render(scene,camera);
};
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>window.setTheme(b.dataset.theme));
window.exportGLB=async()=>{
 const full=new THREE.Group();full.name='Office_99sqm_meters';
 for(const m of model.children){const c=m.clone();const o=m.userData;c.scale.set(1,1,1);c.position.y=o.z+o.h/2;full.add(c);}
 const data=await new GLTFExporter().parseAsync(full,{binary:true});
 let s='';for(const b of new Uint8Array(data))s+=String.fromCharCode(b);return btoa(s);
};
window.setTheme(window.DEFAULT_THEME||'natural');
window.ready=true;
