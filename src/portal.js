import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

// Parse URL params for portal entry
const urlParams = new URLSearchParams(window.location.search);
export const isPortalEntry = urlParams.get('portal') === 'true';
export const portalRef = urlParams.get('ref') || '';
export const portalUsername = urlParams.get('username') || '';
export const portalColor = urlParams.get('color') || '';
export const portalHp = parseInt(urlParams.get('hp')) || 0;

const PORTAL_RADIUS = 2.5;
const COLLISION_RADIUS = 3.5;

let exitPortalGroup = null;
let entryPortalGroup = null;
let portalTime = 0;
let exitRedirected = false;
let entryRedirected = false;

// Portal arrow indicator element
const portalArrowEl = document.getElementById('portal-arrow');

function createPortalMesh(color, label) {
  const group = new THREE.Group();

  // Main torus ring (vertical)
  const torusGeo = new THREE.TorusGeometry(PORTAL_RADIUS, 0.18, 16, 32);
  const torusMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.5,
    transparent: true, opacity: 0.9,
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.name = 'portalRing';
  group.add(torus);

  // Inner swirl disc
  const discGeo = new THREE.CircleGeometry(PORTAL_RADIUS - 0.3, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.name = 'portalDisc';
  group.add(disc);

  // Second inner ring for depth
  const innerGeo = new THREE.TorusGeometry(PORTAL_RADIUS * 0.55, 0.08, 8, 24);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.35,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.name = 'innerRing';
  group.add(inner);

  // Ground glow ring
  const groundGeo = new THREE.RingGeometry(PORTAL_RADIUS - 0.5, PORTAL_RADIUS + 0.8, 24);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -PORTAL_RADIUS + 0.05;
  ground.name = 'groundGlow';
  group.add(ground);

  // Point light
  const light = new THREE.PointLight(color, 6, 18);
  group.add(light);

  // Label sprite
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6993a';
  ctx.fillText(label, 256, 44);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = PORTAL_RADIUS + 1.5;
  sprite.scale.set(8, 1, 1);
  group.add(sprite);

  return group;
}

export function createExitPortal() {
  if (exitPortalGroup) return;
  // Place at arena edge, facing center
  const angle = Math.PI * 0.75;
  const dist = 30;
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;
  exitPortalGroup = createPortalMesh(0xe6993a, 'VIBE JAM PORTAL');
  exitPortalGroup.position.set(x, PORTAL_RADIUS, z);
  exitPortalGroup.lookAt(0, PORTAL_RADIUS, 0);
  exitRedirected = false;
  scene.add(exitPortalGroup);
}

export function createEntryPortal() {
  if (!isPortalEntry || !portalRef || entryPortalGroup) return;
  // Place near spawn, opposite side from exit
  const x = -6;
  const z = -6;
  entryPortalGroup = createPortalMesh(0x44aaff, 'RETURN');
  entryPortalGroup.position.set(x, PORTAL_RADIUS, z);
  entryPortalGroup.lookAt(0, PORTAL_RADIUS, 0);
  entryRedirected = false;
  scene.add(entryPortalGroup);
}

function animatePortal(group, dt, reverse) {
  const disc = group.getObjectByName('portalDisc');
  if (disc) disc.rotation.z = portalTime * (reverse ? -2 : 2);
  const inner = group.getObjectByName('innerRing');
  if (inner) inner.rotation.z = portalTime * (reverse ? 3 : -3);
  const ring = group.getObjectByName('portalRing');
  if (ring) ring.material.emissiveIntensity = 1.0 + Math.sin(portalTime * 2) * 0.5;
  const glow = group.getObjectByName('groundGlow');
  if (glow) glow.material.opacity = 0.15 + Math.sin(portalTime * 3) * 0.1;
}

export function updatePortals(dt, playerX, playerZ, camera) {
  portalTime += dt;

  if (exitPortalGroup) {
    animatePortal(exitPortalGroup, dt, false);
    const ex = exitPortalGroup.position.x;
    const ez = exitPortalGroup.position.z;
    const dx = playerX - ex;
    const dz = playerZ - ez;
    if (dx * dx + dz * dz < COLLISION_RADIUS * COLLISION_RADIUS && !exitRedirected) {
      exitRedirected = true;
      redirectToVibeJam();
    }
    // Off-screen arrow indicator
    if (portalArrowEl && camera) {
      updatePortalArrow(portalArrowEl, ex, ez, camera);
    }
  } else if (portalArrowEl) {
    portalArrowEl.style.display = 'none';
  }

  if (entryPortalGroup) {
    animatePortal(entryPortalGroup, dt, true);
    const rx = entryPortalGroup.position.x;
    const rz = entryPortalGroup.position.z;
    const dx = playerX - rx;
    const dz = playerZ - rz;
    if (dx * dx + dz * dz < COLLISION_RADIUS * COLLISION_RADIUS && !entryRedirected) {
      entryRedirected = true;
      redirectToRef();
    }
  }
}

function updatePortalArrow(el, worldX, worldZ, cam) {
  const v = new THREE.Vector3(worldX, 0.5, worldZ);
  v.project(cam);
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const sx = v.x * hw + hw;
  const sy = -v.y * hh + hh;
  const margin = 60;
  if (sx > margin && sx < window.innerWidth - margin && sy > margin && sy < window.innerHeight - margin && v.z < 1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const angle = Math.atan2(sy - cy, sx - cx);
  const edgePad = 40;
  const maxX = window.innerWidth - edgePad;
  const maxY = window.innerHeight - edgePad;
  let ex = cx + Math.cos(angle) * maxX;
  let ey = cy + Math.sin(angle) * maxY;
  ex = Math.max(edgePad, Math.min(maxX, ex));
  ey = Math.max(edgePad, Math.min(maxY, ey));
  el.style.left = ex + 'px';
  el.style.top = ey + 'px';
  const arrowAngle = angle - Math.PI / 2;
  el.style.transform = 'translate(-50%, -50%) rotate(' + (arrowAngle * 180 / Math.PI) + 'deg)';
}

function redirectToVibeJam() {
  const params = new URLSearchParams();
  params.set('ref', window.location.hostname);
  const nameInput = document.getElementById('name-input');
  const name = portalUsername || (nameInput && nameInput.value.trim()) || '';
  if (name) params.set('username', name);
  if (portalColor) params.set('color', portalColor);
  window.location.href = 'https://vibejam.cc/portal/2026?' + params.toString();
}

function redirectToRef() {
  if (!portalRef) return;
  const params = new URLSearchParams();
  params.set('portal', 'true');
  params.set('ref', window.location.hostname);
  if (portalUsername) params.set('username', portalUsername);
  if (portalColor) params.set('color', portalColor);
  const refUrl = portalRef.startsWith('http') ? portalRef : 'https://' + portalRef;
  window.location.href = refUrl + (refUrl.includes('?') ? '&' : '?') + params.toString();
}

export function removePortals() {
  if (exitPortalGroup) { scene.remove(exitPortalGroup); exitPortalGroup = null; }
  if (entryPortalGroup) { scene.remove(entryPortalGroup); entryPortalGroup = null; }
  if (portalArrowEl) portalArrowEl.style.display = 'none';
}

export function getPortalName() {
  if (portalUsername) return portalUsername.slice(0, 12);
  return '';
}

export function portalGameOverRedirect() {
  redirectToVibeJam();
}
