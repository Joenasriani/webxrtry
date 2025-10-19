// app.js - main three.js WebXR game
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { VRButton } from 'https://unpkg.com/three@0.152.2/examples/jsm/webxr/VRButton.js';
import AISim from './ai_sim.js';

let camera, scene, renderer;
let controller1, controller2;
let raycaster;
let garden, seedsGroup, cardsGroup;
let ai;
let progress = 0;

init();
animate();

function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xCFFFE0);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.set(0,1.6,3);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff,0x8899aa,1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff,0.6);
  dir.position.set(3,10,5);
  scene.add(dir);

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:0x7EE0A9,roughness:0.9}));
  ground.rotation.x = -Math.PI/2; scene.add(ground);

  // garden root
  garden = new THREE.Group(); scene.add(garden);

  seedsGroup = new THREE.Group(); garden.add(seedsGroup);
  cardsGroup = new THREE.Group(); garden.add(cardsGroup);

  // create colorful floating seeds
  const seedColors = [0xFF6B6B,0xFFD93D,0x6BCB77,0x4D96FF,0xAA4DFF];
  for(let i=0;i<10;i++){
    const g = new THREE.SphereGeometry(0.12,12,10);
    const m = new THREE.MeshStandardMaterial({color:seedColors[i%seedColors.length],emissive:0x000000,roughness:0.6});
    const s = new THREE.Mesh(g,m);
    s.position.set((Math.random()-0.5)*6,0.5 + Math.random()*1.8,-1 - Math.random()*4);
    s.userData = {type:'seed', word:randomWord()};
    seedsGroup.add(s);

    // add simple floating motion
    s.userData.floatOffset = Math.random()*Math.PI*2;
  }

  // create example cards
  const labels = ['happy','sad','robot'];
  for(let i=0;i<6;i++){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.5,0.06), new THREE.MeshStandardMaterial({color:0xffffff}));
    box.position.set(-3 + (i%3)*1.8,0.6 + Math.floor(i/3)*0.9,-2.5 - Math.floor(i/3)*0.4);
    box.userData = {type:'card', label: labels[i%labels.length], text: sampleExample(labels[i%labels.length])};
    // tiny label as texture via canvas
    const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFE'; ctx.fillRect(0,0,512,256);
    ctx.fillStyle = '#072'; ctx.font='40px serif'; ctx.fillText(box.userData.label,20,70);
    ctx.font='26px serif'; wrapText(ctx, box.userData.text, 20,120,470,28);
    const tex = new THREE.CanvasTexture(canvas);
    box.material.map = tex; box.material.needsUpdate = true;
    cardsGroup.add(box);
  }

  // renderer
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  raycaster = new THREE.Raycaster();

  controller1 = renderer.xr.getController(0); controller1.addEventListener('selectstart', onSelectStart); controller1.addEventListener('selectend', onSelectEnd); scene.add(controller1);
  controller2 = renderer.xr.getController(1); controller2.addEventListener('selectstart', onSelectStart); controller2.addEventListener('selectend', onSelectEnd); scene.add(controller2);

  // simple controller rays
  const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
  const lineMat = new THREE.LineBasicMaterial({linewidth:2});
  controller1.add(new THREE.Line(lineGeom,lineMat)); controller2.add(new THREE.Line(lineGeom,lineMat));

  // AI sim
  ai = new AISim();

  window.addEventListener('resize', onWindowResize);
}

function randomWord(){
  const pool = ['play','happy','run','ball','moon','blue','sing','fast','robot','sad','puzzle','spark'];
  return pool[Math.floor(Math.random()*pool.length)];
}

function sampleExample(lbl){
  if(lbl==='happy') return 'This is a happy sentence full of sunshine.';
  if(lbl==='sad') return 'This is a quiet, sad sentence.';
  return 'Beep boop says the robot.';
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight){
  const words = text.split(' '); let line='';
  for(let n=0;n<words.length;n++){
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if(metrics.width > maxWidth && n>0){ ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; }
    else { line = testLine; }
  }
  ctx.fillText(line, x, y);
}

let grabbing = null; // currently grabbed mesh
function onSelectStart(event){
  const controller = event.target;
  // cast ray
  const tempMat = new THREE.Matrix4(); tempMat.identity().extractRotation(controller.matrixWorld);
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  const dir = new THREE.Vector3(0,0,-1).applyMatrix4(tempMat);
  raycaster.set(origin, dir);
  const intersects = raycaster.intersectObjects([...seedsGroup.children, ...cardsGroup.children], false);
  if(intersects.length>0){
    const obj = intersects[0].object;
    grabbing = {obj, controller};
    controller.attach(obj);
    obj.userData.wasPosition = obj.position.clone();
  }
}

function onSelectEnd(event){
  const controller = event.target;
  if(grabbing && grabbing.controller === controller){
    const obj = grabbing.obj;
    // if it's a seed and dropped near the 'feeding stump' (center area), feed tokens
    const worldPos = new THREE.Vector3(); obj.getWorldPosition(worldPos);
    if(obj.userData.type === 'seed'){
      if(worldPos.distanceTo(new THREE.Vector3(0,1,-0.5)) < 1.0){
        ai.feedTokens([obj.userData.word]);
        showFloatingText(`fed: ${obj.userData.word}`);
        // remove seed
        seedsGroup.remove(obj);
        progressUp(5);
      } else {
        // return to old spot
        obj.position.copy(obj.userData.wasPosition);
        scene.add(obj);
      }
    }
    if(obj.userData.type === 'card'){
      // dropping card near stump trains example
      if(worldPos.distanceTo(new THREE.Vector3(0,1,-0.5)) < 1.0){
        ai.addExample(obj.userData.label, obj.userData.text);
        showFloatingText(`trained: ${obj.userData.label}`);
        // remove card
        cardsGroup.remove(obj);
        progressUp(10);
      } else {
        obj.position.copy(obj.userData.wasPosition);
        scene.add(obj);
      }
    }
    grabbing = null;
  }
}

function showFloatingText(text){
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=128; const ctx = canvas.getContext('2d');
  ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#063'; ctx.font='36px serif'; ctx.fillText(text,20,72);
  const tex = new THREE.CanvasTexture(canvas);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.45), new THREE.MeshBasicMaterial({map:tex,transparent:true}));
  p.position.set(0,1.9,-0.8); scene.add(p);
  setTimeout(()=>{ scene.remove(p); },1500);
}

function progressUp(val){ progress = Math.min(100, progress + val); document.getElementById('score').textContent = `Progress: ${progress}%`; }

function onWindowResize(){ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); }

function animate(){ renderer.setAnimationLoop(render); }

function render(){
  // float seeds
  seedsGroup.children.forEach((s,i)=>{
    s.position.y = 0.6 + Math.sin((performance.now()/800) + s.userData.floatOffset)*0.15;
    s.rotation.y += 0.01;
  });

  // if no seeds and cards left, prompt response
  if(seedsGroup.children.length === 0 && cardsGroup.children.length === 0){
    const resp = ai.respond();
    showFloatingText(resp);
  }

  renderer.render(scene,camera);
}
