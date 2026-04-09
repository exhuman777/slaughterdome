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
let touchAimActive = false;

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
    rotateMsg.style.display = window.innerHeight > window.innerWidth ? 'flex' : 'none';
  }
  window.addEventListener('resize', checkOrientation);
  checkOrientation();

  function makeJoystick(id, x, side, color) {
    const pad = document.createElement('div');
    pad.id = id;
    pad.style.cssText = 'position:fixed;bottom:15px;' + side + ':' + x + 'px;width:120px;height:120px;border-radius:50%;' +
      'background:rgba(' + color + ',0.08);border:2px solid rgba(' + color + ',0.3);touch-action:none;z-index:100;';
    document.body.appendChild(pad);
    const knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;width:46px;height:46px;border-radius:50%;background:rgba(' + color + ',0.25);' +
      'border:2px solid rgba(' + color + ',0.5);top:37px;left:37px;pointer-events:none;transition:none;';
    pad.appendChild(knob);
    const label = document.createElement('div');
    label.textContent = id === 'mobile-pad' ? 'MOVE' : 'AIM';
    label.style.cssText = 'position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:700;' +
      'font-family:monospace;color:rgba(' + color + ',0.5);letter-spacing:2px;pointer-events:none;';
    pad.appendChild(label);
    return { pad, knob };
  }

  // Left stick: MOVE
  const left = makeJoystick('mobile-pad', 15, 'left', '255,255,255');
  // Right stick: AIM (red tinted -- aiming fires automatically)
  const right = makeJoystick('mobile-aim', 15, 'right', '255,100,100');

  // Ability buttons -- compact row above right stick
  const dashBtn = mobileBtn('DASH', '68,200,255', 44);
  dashBtn.style.bottom = '145px'; dashBtn.style.right = '110px';
  document.body.appendChild(dashBtn);

  const swordBtn = mobileBtn('Q', '255,255,255', 44);
  swordBtn.style.bottom = '145px'; swordBtn.style.right = '60px';
  document.body.appendChild(swordBtn);

  const specBtn = mobileBtn('AOE', '255,170,0', 44);
  specBtn.style.bottom = '145px'; specBtn.style.right = '10px';
  document.body.appendChild(specBtn);

  // Left side abilities -- above move stick
  const wallBtn = mobileBtn('WALL', '68,136,255', 44);
  wallBtn.style.bottom = '145px'; wallBtn.style.left = '15px';
  document.body.appendChild(wallBtn);

  // Joystick logic -- multitouch aware
  const padR = 60;
  let leftTouchId = null, rightTouchId = null;
  let leftCenter = { x: 0, y: 0 }, rightCenter = { x: 0, y: 0 };

  function processStick(touch, center, isAim) {
    const dx = (touch.clientX - center.x) / padR;
    const dz = (touch.clientY - center.y) / padR;
    const len = Math.sqrt(dx * dx + dz * dz);
    const clampedLen = Math.min(len, 1);
    if (len > 0) {
      const nx = (dx / len) * clampedLen;
      const nz = (dz / len) * clampedLen;
      if (isAim) {
        touchAimDx = dx / len;
        touchAimDz = dz / len;
        touchAimActive = true;
        touchAttack = true;
      } else {
        touchMove.dx = nx;
        touchMove.dz = nz;
      }
      return { kx: nx * padR * 0.5, kz: nz * padR * 0.5 };
    }
    return { kx: 0, kz: 0 };
  }

  left.pad.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    leftTouchId = t.identifier;
    const r = left.pad.getBoundingClientRect();
    leftCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { passive: false });

  right.pad.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    rightTouchId = t.identifier;
    const r = right.pad.getBoundingClientRect();
    rightCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    touchAimActive = true;
    touchAttack = true;
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === leftTouchId) {
        const k = processStick(t, leftCenter, false);
        left.knob.style.transform = 'translate(' + k.kx + 'px,' + k.kz + 'px)';
      }
      if (t.identifier === rightTouchId) {
        const k = processStick(t, rightCenter, true);
        right.knob.style.transform = 'translate(' + k.kx + 'px,' + k.kz + 'px)';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === leftTouchId) {
        leftTouchId = null;
        touchMove.dx = 0; touchMove.dz = 0;
        left.knob.style.transform = 'translate(0,0)';
      }
      if (t.identifier === rightTouchId) {
        rightTouchId = null;
        touchAimActive = false;
        touchAttack = false;
        right.knob.style.transform = 'translate(0,0)';
      }
    }
  });

  // Button events
  function tapBtn(el, onTap) {
    el.addEventListener('touchstart', e => {
      e.preventDefault(); onTap(); el.style.filter = 'brightness(1.5)';
      setTimeout(() => { el.style.filter = ''; }, 150);
    }, { passive: false });
  }
  function holdBtn(el, onDown, onUp) {
    el.addEventListener('touchstart', e => { e.preventDefault(); onDown(); el.style.filter = 'brightness(1.5)'; }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); onUp(); el.style.filter = ''; });
    el.addEventListener('touchcancel', () => { onUp(); el.style.filter = ''; });
  }

  holdBtn(specBtn, () => { touchSpecial = true; }, () => { touchSpecial = false; });
  tapBtn(dashBtn, () => { touchDash = true; });
  tapBtn(swordBtn, () => { touchSword = true; });
  tapBtn(wallBtn, () => { touchWall = true; });
}

export function getMobileInput() {
  const dash = touchDash; touchDash = false;
  const sword = touchSword; touchSword = false;
  const wall = touchWall; touchWall = false;
  // When aim stick active, use its direction; otherwise fall back to move direction
  let aimDx = touchAimDx, aimDz = touchAimDz;
  if (!touchAimActive && (touchMove.dx !== 0 || touchMove.dz !== 0)) {
    const mLen = Math.sqrt(touchMove.dx * touchMove.dx + touchMove.dz * touchMove.dz);
    if (mLen > 0) { aimDx = touchMove.dx / mLen; aimDz = touchMove.dz / mLen; }
  }
  return {
    dx: touchMove.dx, dz: touchMove.dz,
    attack: touchAttack, special: touchSpecial,
    aimX: aimDx * 20, aimZ: aimDz * 20,
    dash, sword, wall, mobileAimRelative: true,
  };
}
