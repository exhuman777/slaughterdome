import { camera } from './renderer.js';
import * as THREE from 'https://esm.sh/three@0.162.0';

const keys = {};
const mouse = { x: 0, z: 0, left: false, right: false };
let wallTriggeredFrames = 0;
let dashTriggered = false;
let swordTriggered = false;
let wallMode = false;
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouseNDC = new THREE.Vector2();
const intersection = new THREE.Vector3();

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && !e.repeat) {
    wallMode = !wallMode;
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) dashTriggered = true;
  if (e.code === 'KeyQ' && !e.repeat) swordTriggered = true;
  if (e.code === 'Escape' && wallMode) { wallMode = false; e.stopImmediatePropagation(); }
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
  if (e.button === 0) {
    mouse.left = true;
    if (wallMode) wallTriggeredFrames = 6;
  }
  if (e.button === 2) {
    mouse.right = true;
    if (wallMode) wallMode = false;
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());

export function isWallMode() { return wallMode; }
export function exitWallMode() { wallMode = false; }
export function resetInput() {
  wallMode = false;
  wallTriggeredFrames = 0;
  dashTriggered = false;
  swordTriggered = false;
  for (const k in keys) keys[k] = false;
  mouse.left = false;
  mouse.right = false;
}

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
  const wall = wallTriggeredFrames > 0;
  if (wallTriggeredFrames > 0) wallTriggeredFrames--;
  const sword = swordTriggered;
  swordTriggered = false;
  // In wall mode, suppress attack -- LMB places walls instead
  const attack = wallMode ? false : mouse.left;
  return { dx, dz, attack, special: mouse.right || keys['Space'], aimX: mouse.x, aimZ: mouse.z, wall, dash, sword };
}

let touchMove = { dx: 0, dz: 0 };
let touchAttack = false;
let touchSpecial = false;
let touchDash = false;
let touchSword = false;
let touchWall = false;
let touchAimDx = 0, touchAimDz = 1;

export function isMobile() {
  return navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
}

function mobileBtn(text, color, size) {
  const btn = document.createElement('div');
  btn.textContent = text;
  const s = size || 60;
  btn.style.cssText = 'position:fixed;width:' + s + 'px;height:' + s + 'px;border-radius:50%;' +
    'background:rgba(' + color + ',0.25);border:2px solid rgba(' + color + ',0.8);' +
    'color:rgba(' + color + ',0.9);display:flex;align-items:center;justify-content:center;' +
    'font-size:' + (s > 55 ? 13 : 10) + 'px;font-weight:700;font-family:monospace;touch-action:none;z-index:100;' +
    'user-select:none;-webkit-user-select:none;';
  return btn;
}

export function setupMobileControls() {
  // Force landscape prompt
  const rotateMsg = document.createElement('div');
  rotateMsg.id = 'rotate-msg';
  rotateMsg.innerHTML = 'ROTATE TO LANDSCAPE';
  rotateMsg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0d0b0a;color:#e6993a;' +
    'display:none;align-items:center;justify-content:center;font-size:20px;font-family:monospace;z-index:9999;letter-spacing:4px;';
  document.body.appendChild(rotateMsg);
  function checkOrientation() {
    if (window.innerHeight > window.innerWidth) {
      rotateMsg.style.display = 'flex';
    } else {
      rotateMsg.style.display = 'none';
    }
  }
  window.addEventListener('resize', checkOrientation);
  checkOrientation();

  // Left side: joystick
  const pad = document.createElement('div');
  pad.id = 'mobile-pad';
  pad.style.cssText = 'position:fixed;bottom:20px;left:20px;width:130px;height:130px;border-radius:50%;' +
    'background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.25);touch-action:none;z-index:100;';
  document.body.appendChild(pad);
  const padKnob = document.createElement('div');
  padKnob.style.cssText = 'position:absolute;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.2);' +
    'border:2px solid rgba(255,255,255,0.4);top:40px;left:40px;pointer-events:none;transition:none;';
  pad.appendChild(padKnob);

  // Right side: button cluster (landscape layout)
  // ATK - large, bottom right
  const atkBtn = mobileBtn('ATK', '255,68,68', 68);
  atkBtn.style.bottom = '20px'; atkBtn.style.right = '20px';
  document.body.appendChild(atkBtn);

  // DASH - left of ATK
  const dashBtn = mobileBtn('DASH', '68,200,255', 56);
  dashBtn.style.bottom = '25px'; dashBtn.style.right = '100px';
  document.body.appendChild(dashBtn);

  // SWORD - above DASH
  const swordBtn = mobileBtn('Q', '255,255,255', 52);
  swordBtn.style.bottom = '90px'; swordBtn.style.right = '105px';
  document.body.appendChild(swordBtn);

  // AOE - above ATK
  const specBtn = mobileBtn('AOE', '255,170,0', 52);
  specBtn.style.bottom = '95px'; specBtn.style.right = '25px';
  document.body.appendChild(specBtn);

  // WALL - top right corner, smaller
  const wallBtn = mobileBtn('WALL', '136,136,170', 46);
  wallBtn.style.bottom = '150px'; wallBtn.style.right = '55px';
  document.body.appendChild(wallBtn);

  // Joystick logic
  let joystickActive = false;
  let joyCenter = { x: 0, y: 0 };
  const padR = 65;

  pad.addEventListener('touchstart', e => {
    e.preventDefault(); joystickActive = true;
    const r = pad.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { passive: false });

  pad.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joystickActive) return;
    const t = e.touches[0];
    const dx = (t.clientX - joyCenter.x) / padR;
    const dz = (t.clientY - joyCenter.y) / padR;
    const len = Math.sqrt(dx * dx + dz * dz);
    const clampedLen = Math.min(len, 1);
    if (len > 0) {
      touchMove.dx = (dx / len) * clampedLen;
      touchMove.dz = (dz / len) * clampedLen;
      touchAimDx = dx / len;
      touchAimDz = dz / len;
    }
    // Move knob visual
    const knobX = (touchMove.dx * padR * 0.6);
    const knobZ = (touchMove.dz * padR * 0.6);
    padKnob.style.transform = 'translate(' + knobX + 'px,' + knobZ + 'px)';
  }, { passive: false });

  pad.addEventListener('touchend', () => {
    joystickActive = false;
    touchMove.dx = 0; touchMove.dz = 0;
    padKnob.style.transform = 'translate(0,0)';
  });

  // Button events
  function holdBtn(el, onDown, onUp) {
    el.addEventListener('touchstart', e => { e.preventDefault(); onDown(); el.style.filter = 'brightness(1.5)'; }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); onUp(); el.style.filter = ''; });
    el.addEventListener('touchcancel', () => { onUp(); el.style.filter = ''; });
  }
  function tapBtn(el, onTap) {
    el.addEventListener('touchstart', e => {
      e.preventDefault(); onTap(); el.style.filter = 'brightness(1.5)';
      setTimeout(() => { el.style.filter = ''; }, 150);
    }, { passive: false });
  }

  holdBtn(atkBtn, () => { touchAttack = true; }, () => { touchAttack = false; });
  holdBtn(specBtn, () => { touchSpecial = true; }, () => { touchSpecial = false; });
  tapBtn(dashBtn, () => { touchDash = true; });
  tapBtn(swordBtn, () => { touchSword = true; });
  tapBtn(wallBtn, () => { touchWall = true; });
}

export function getMobileInput() {
  const dash = touchDash; touchDash = false;
  const sword = touchSword; touchSword = false;
  const wall = touchWall; touchWall = false;
  return {
    dx: touchMove.dx, dz: touchMove.dz,
    attack: touchAttack, special: touchSpecial,
    aimX: touchAimDx * 20, aimZ: touchAimDz * 20,
    dash, sword, wall, mobileAimRelative: true,
  };
}
