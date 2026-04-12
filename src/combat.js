import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';
import { spawnAoeRing, spawnFloatingText, spawnSparks } from './particles.js';

const effects = [];

// Pre-allocated shared geometries (never recreated)
const muzzleFlashGeo = new THREE.SphereGeometry(0.3, 8, 8);
const muzzleFlashGeoLarge = new THREE.SphereGeometry(0.45, 8, 8);
const groundFlashGeo = (() => { const g = new THREE.CircleGeometry(0.6, 8); g.rotateX(-Math.PI / 2); return g; })();
const groundFlashGeoLarge = (() => { const g = new THREE.CircleGeometry(0.9, 8); g.rotateX(-Math.PI / 2); return g; })();
const explosionGeos = [8, 12, 16].map(r => { const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI / 2); return g; });

// Special attack shared geometries
const specialWaveGeo = (() => { const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2); return g; })();
const specialFlashGeo = (() => { const g = new THREE.CircleGeometry(2, 16); g.rotateX(-Math.PI / 2); return g; })();
const specialBeamGeo = new THREE.PlaneGeometry(6, 0.25);
const specialPillarGeo = new THREE.CylinderGeometry(0.8, 1.5, 8, 12, 1, true);
const specialCrackGeos = [3, 4, 5, 6].map(len => {
  const g = new THREE.PlaneGeometry(len, 0.08);
  g.rotateX(-Math.PI / 2);
  return g;
});

// Sword slash geometries (pre-built for 3 combo levels)
const swordSlashGeos = [0, 1, 2].map(() => {
  const g = new THREE.RingGeometry(0.5, 3, 16, 1, 0, 1.8);
  g.rotateX(-Math.PI / 2);
  return g;
});

// Mesh pool for combat effects (created on demand, recycled)
const flashPool = [];
const groundPool = [];

function createPooledMesh(geo, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.position.y = -100;
  scene.add(mesh);
  return { mesh, mat };
}

function acquireFromPool(pool, geo, color) {
  for (const p of pool) {
    if (!p.mesh.visible) return p;
  }
  // Create new on demand
  const entry = createPooledMesh(geo, color);
  pool.push(entry);
  return entry;
}

export function showGunShot(px, pz, angle, weaponType) {
  const fx = px + Math.cos(angle) * 0.8;
  const fz = pz + Math.sin(angle) * 0.8;
  weaponType = weaponType || 'pistol';

  if (weaponType === 'flamethrower') {
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const a = angle + spread;
      const dist = 1 + Math.random() * 2;
      const pxf = px + Math.cos(a) * dist;
      const pzf = pz + Math.sin(a) * dist;
      const color = Math.random() > 0.5 ? 0xff6600 : 0xff3300;
      spawnSparks(pxf, pzf, color, 1);
    }
    return;
  }

  const isShotgun = weaponType === 'shotgun';

  // Muzzle flash from pool
  const fp = acquireFromPool(flashPool, isShotgun ? muzzleFlashGeoLarge : muzzleFlashGeo, 0xffffcc);
  if (fp) {
    fp.mesh.geometry = isShotgun ? muzzleFlashGeoLarge : muzzleFlashGeo;
    fp.mesh.position.set(fx, 1.2, fz);
    fp.mat.color.set(0xffffcc);
    fp.mat.opacity = 1;
    fp.mesh.visible = true;
    effects.push({ mesh: fp.mesh, mat: fp.mat, life: 0.06, maxLife: 0.06, pooled: true });
  }

  // Ground flash from pool
  const gp = acquireFromPool(groundPool, isShotgun ? groundFlashGeoLarge : groundFlashGeo, 0xffffaa);
  if (gp) {
    gp.mesh.geometry = isShotgun ? groundFlashGeoLarge : groundFlashGeo;
    gp.mesh.position.set(fx, 0.05, fz);
    gp.mat.color.set(0xffffaa);
    gp.mat.opacity = 0.5;
    gp.mesh.visible = true;
    effects.push({ mesh: gp.mesh, mat: gp.mat, life: 0.05, maxLife: 0.05, pooled: true });
  }

  if (isShotgun) {
    for (let i = 0; i < 5; i++) {
      const sa = angle + (i - 2) * 0.3;
      spawnSparks(px + Math.cos(sa) * 1, pz + Math.sin(sa) * 1, 0xffdd44, 2);
    }
  } else {
    spawnSparks(fx, fz, 0xffdd44, 3);
  }
}

// Special attack pool (on demand)
const specialPool = [];
function acquireSpecial() {
  return acquireFromPool(specialPool, specialWaveGeo, 0xffcc44);
}

export function showSpecialAttack(x, z) {
  spawnAoeRing(x, z, 6, 0xffaa00);

  // Shockwave disc
  const wave = acquireSpecial();
  if (wave) {
    wave.mesh.geometry = specialWaveGeo;
    wave.mesh.position.set(x, 0.12, z);
    wave.mesh.rotation.set(0, 0, 0);
    wave.mesh.scale.set(1, 1, 1);
    wave.mat.color.set(0xffcc44);
    wave.mat.opacity = 0.9;
    wave.mat.side = THREE.DoubleSide;
    wave.mesh.visible = true;
    effects.push({ mesh: wave.mesh, mat: wave.mat, life: 0.4, maxLife: 0.4, expandRate: 14, pooled: true });
  }

  // Inner flash
  const flash = acquireSpecial();
  if (flash) {
    flash.mesh.geometry = specialFlashGeo;
    flash.mesh.position.set(x, 0.25, z);
    flash.mesh.rotation.set(0, 0, 0);
    flash.mesh.scale.set(1, 1, 1);
    flash.mat.color.set(0xffffdd);
    flash.mat.opacity = 1;
    flash.mat.side = THREE.DoubleSide;
    flash.mesh.visible = true;
    effects.push({ mesh: flash.mesh, mat: flash.mat, life: 0.15, maxLife: 0.15, expandRate: 6, pooled: true });
  }

  // Radial energy beams
  for (let i = 0; i < 12; i++) {
    const beam = acquireSpecial();
    if (!beam) break;
    const a = (i / 12) * Math.PI * 2;
    const color = i % 2 === 0 ? 0xffcc33 : 0xff8800;
    beam.mesh.geometry = specialBeamGeo;
    beam.mesh.position.set(x, 0.3 + (i % 3) * 0.15, z);
    beam.mesh.rotation.set(Math.PI / 2, 0, a);
    beam.mesh.scale.set(1, 1, 1);
    beam.mat.color.set(color);
    beam.mat.opacity = 0.8;
    beam.mat.side = THREE.DoubleSide;
    beam.mesh.visible = true;
    effects.push({ mesh: beam.mesh, mat: beam.mat, life: 0.3, maxLife: 0.3, pooled: true });
  }

  // Vertical pillar (non-pooled due to unique geometry transform needs)
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const pillar = new THREE.Mesh(specialPillarGeo, pillarMat);
  pillar.position.set(x, 4, z);
  scene.add(pillar);
  effects.push({ mesh: pillar, mat: pillarMat, life: 0.5, maxLife: 0.5, expandRate: 3 });

  // Ground cracks
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
    const lenIdx = Math.floor(Math.random() * specialCrackGeos.length);
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const crack = new THREE.Mesh(specialCrackGeos[lenIdx], crackMat);
    const len = 3 + lenIdx;
    crack.position.set(x + Math.cos(a) * len * 0.5, 0.03, z + Math.sin(a) * len * 0.5);
    crack.rotation.y = a;
    scene.add(crack);
    effects.push({ mesh: crack, mat: crackMat, life: 0.6, maxLife: 0.6 });
  }

  spawnSparks(x, z, 0xffcc44, 6);
  spawnSparks(x + 2, z, 0xff8800, 4);
  spawnSparks(x - 2, z, 0xff8800, 4);
  spawnSparks(x, z + 2, 0xffaa00, 4);
  spawnSparks(x, z - 2, 0xffaa00, 4);
}

let dmgSlot = 0;
const DMG_OFFSETS = [
  [-1.5, -1], [1.5, -0.5], [-0.5, 1.2], [1.2, 0.8],
  [-1.8, 0.3], [0.3, -1.5], [1.8, 1.2], [-1, 1.5],
];

const CRIT_FONTS = [
  '700 48px "Bangers"', '700 48px "Permanent Marker"', '700 48px "Bungee"',
  '700 24px "Press Start 2P"', '700 48px "Creepster"', '700 48px "Russo One"',
  '700 48px "Black Ops One"', '700 48px "Righteous"', '700 48px "Orbitron"',
  '700 48px "Alfa Slab One"',
];
let critStreak = 0;
let lastCritTime = 0;

export function showDamageNumber(x, z, dmg, crit) {
  const color = crit ? '#ffff44' : '#ffffff';
  const text = crit ? 'CRIT ' + dmg + '!' : '' + dmg;
  const off = DMG_OFFSETS[dmgSlot % DMG_OFFSETS.length];
  dmgSlot++;
  let scale = crit ? 4 : 2.5;
  let fontOverride = null;
  if (crit) {
    const now = performance.now();
    if (now - lastCritTime < 3000) { critStreak++; } else { critStreak = 1; }
    lastCritTime = now;
    scale = 4 + Math.min(critStreak - 1, 6) * 1.5;
    fontOverride = CRIT_FONTS[Math.floor(Math.random() * CRIT_FONTS.length)];
    spawnSparks(x, z, 0xffff44, 12);
  }
  spawnFloatingText(x + off[0], z + off[1], text, color, scale, fontOverride);
}

export function showExplosion(x, z, radius) {
  spawnAoeRing(x, z, radius * 1.5, 0xff4400);
  spawnSparks(x, z, 0xff6600, 20);
  // Pick closest pre-allocated explosion geo
  const idx = radius <= 10 ? 0 : radius <= 14 ? 1 : 2;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(explosionGeos[idx], mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  effects.push({ mesh, mat, life: 0.3, maxLife: 0.3, expandRate: 5 });
}

export function showSwordSlash(x, z, angle, combo) {
  const geoIdx = Math.min(combo, 2);
  const colors = [0xffffff, 0xffcc44, 0xff4444];
  const color = colors[combo] || 0xffffff;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(swordSlashGeos[geoIdx], mat);
  mesh.position.set(x, 0.8, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  effects.push({ mesh, mat, life: 0.2, maxLife: 0.2 });
  spawnSparks(x + Math.cos(angle) * 1.5, z + Math.sin(angle) * 1.5, color, 4);
}

export function showHitImpact(x, z) {
  spawnSparks(x, z, 0xffffff, 8);
}

export function updateCombatVisuals(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const t = Math.max(0, e.life / e.maxLife);
    e.mat.opacity = t;
    if (e.expandRate) {
      const s = 1 + (1 - t) * e.expandRate;
      e.mesh.scale.set(s, s, 1);
    }
    if (e.life <= 0) {
      if (e.pooled) {
        // Return to pool: hide instead of removing
        e.mesh.visible = false;
        e.mesh.position.y = -100;
        e.mesh.scale.set(1, 1, 1);
      } else {
        scene.remove(e.mesh);
        e.mat.dispose();
      }
      effects.splice(i, 1);
    }
  }
}
