import { camera } from './renderer.js';
import * as THREE from 'https://esm.sh/three@0.162.0';

const keys = {};
const mouse = { x: 0, z: 0, left: false, right: false };
let wallTriggered = false;
let dashTriggered = false;
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouseNDC = new THREE.Vector2();
const intersection = new THREE.Vector3();

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE') wallTriggered = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dashTriggered = true;
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('mousemove', e => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  if (raycaster.ray.intersectPlane(plane, intersection)) {
    mouse.x = intersection.x;
    mouse.z = intersection.z;
  }
});
document.addEventListener('mousedown', e => {
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) mouse.right = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());

export function getInput() {
  let dx = 0, dz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) dz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) dz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) { dx /= len; dz /= len; }
  const dash = dashTriggered;
  dashTriggered = false;
  const wall = wallTriggered;
  wallTriggered = false;
  return { dx, dz, attack: mouse.left, special: mouse.right || keys['Space'], aimX: mouse.x, aimZ: mouse.z, wall, dash };
}

let touchMove = { dx: 0, dz: 0 };
let touchAttack = false;
let touchSpecial = false;

export function isMobile() {
  return navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
}

export function setupMobileControls() {
  const pad = document.createElement('div');
  pad.id = 'mobile-pad';
  pad.style.cssText = 'position:fixed;bottom:30px;left:30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.3);touch-action:none;z-index:100;';
  document.body.appendChild(pad);

  const atkBtn = document.createElement('div');
  atkBtn.textContent = 'ATK';
  atkBtn.style.cssText = 'position:fixed;bottom:50px;right:40px;width:70px;height:70px;border-radius:50%;background:rgba(255,68,68,0.3);border:2px solid #ff4444;color:#ff4444;display:flex;align-items:center;justify-content:center;font-size:14px;font-family:monospace;touch-action:none;z-index:100;';
  document.body.appendChild(atkBtn);

  const specBtn = document.createElement('div');
  specBtn.textContent = 'AOE';
  specBtn.style.cssText = 'position:fixed;bottom:130px;right:40px;width:60px;height:60px;border-radius:50%;background:rgba(255,170,0,0.3);border:2px solid #ffaa00;color:#ffaa00;display:flex;align-items:center;justify-content:center;font-size:12px;font-family:monospace;touch-action:none;z-index:100;';
  document.body.appendChild(specBtn);

  let joystickActive = false;
  let joyCenter = { x: 0, y: 0 };
  pad.addEventListener('touchstart', e => {
    e.preventDefault(); joystickActive = true;
    const r = pad.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  pad.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joystickActive) return;
    const t = e.touches[0];
    const dx = (t.clientX - joyCenter.x) / 60;
    const dz = (t.clientY - joyCenter.y) / 60;
    const len = Math.sqrt(dx * dx + dz * dz);
    touchMove.dx = len > 1 ? dx / len : dx;
    touchMove.dz = len > 1 ? dz / len : dz;
  });
  pad.addEventListener('touchend', () => { joystickActive = false; touchMove.dx = 0; touchMove.dz = 0; });

  atkBtn.addEventListener('touchstart', e => { e.preventDefault(); touchAttack = true; });
  atkBtn.addEventListener('touchend', () => { touchAttack = false; });
  specBtn.addEventListener('touchstart', e => { e.preventDefault(); touchSpecial = true; });
  specBtn.addEventListener('touchend', () => { touchSpecial = false; });
}

export function getMobileInput() {
  return { dx: touchMove.dx, dz: touchMove.dz, attack: touchAttack, special: touchSpecial, aimX: 0, aimZ: 0, dash: false };
}
