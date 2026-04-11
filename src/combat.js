import * as THREE from 'three/webgpu';
import { scene } from './renderer.js';
import { spawnAoeRing, spawnFloatingText, spawnSparks } from './particles.js';

const effects = [];

export function showGunShot(px, pz, angle, weaponType) {
  const fx = px + Math.cos(angle) * 0.8;
  const fz = pz + Math.sin(angle) * 0.8;
  weaponType = weaponType || 'pistol';

  if (weaponType === 'flamethrower') {
    // Cone of fire particles
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

  // Pistol and Shotgun: standard muzzle flash
  const flashScale = weaponType === 'shotgun' ? 1.5 : 1;
  const flashGeo = new THREE.SphereGeometry(0.3 * flashScale, 8, 8);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 1 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(fx, 1.2, fz);
  scene.add(flash);
  effects.push({ mesh: flash, mat: flashMat, life: 0.06, maxLife: 0.06 });

  const groundGeo = new THREE.CircleGeometry(0.6 * flashScale, 8);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(fx, 0.05, fz);
  scene.add(ground);
  effects.push({ mesh: ground, mat: groundMat, life: 0.05, maxLife: 0.05 });

  if (weaponType === 'shotgun') {
    for (let i = 0; i < 5; i++) {
      const sa = angle + (i - 2) * 0.3;
      spawnSparks(px + Math.cos(sa) * 1, pz + Math.sin(sa) * 1, 0xffdd44, 2);
    }
  } else {
    spawnSparks(fx, fz, 0xffdd44, 3);
  }
}

export function showSpecialAttack(x, z) {
  spawnAoeRing(x, z, 6, 0xffaa00);
  // Shockwave disc -- expands fast
  const waveGeo = new THREE.CircleGeometry(1, 32);
  waveGeo.rotateX(-Math.PI / 2);
  const waveMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(waveGeo, waveMat);
  wave.position.set(x, 0.12, z);
  scene.add(wave);
  effects.push({ mesh: wave, mat: waveMat, life: 0.4, maxLife: 0.4, expandRate: 14 });
  // Inner flash
  const flashGeo = new THREE.CircleGeometry(2, 16);
  flashGeo.rotateX(-Math.PI / 2);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffdd, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(x, 0.25, z);
  scene.add(flash);
  effects.push({ mesh: flash, mat: flashMat, life: 0.15, maxLife: 0.15, expandRate: 6 });
  // Radial energy beams -- 12 spinning outward
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const beamGeo = new THREE.PlaneGeometry(6, 0.25);
    const color = i % 2 === 0 ? 0xffcc33 : 0xff8800;
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, 0.3 + (i % 3) * 0.15, z);
    beam.rotation.set(Math.PI / 2, 0, a);
    scene.add(beam);
    effects.push({ mesh: beam, mat: beamMat, life: 0.3, maxLife: 0.3 });
  }
  // Vertical pillar
  const pillarGeo = new THREE.CylinderGeometry(0.8, 1.5, 8, 12, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.set(x, 4, z);
  scene.add(pillar);
  effects.push({ mesh: pillar, mat: pillarMat, life: 0.5, maxLife: 0.5, expandRate: 3, disposeGeo: true });
  // Ground cracks -- radial lines
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
    const len = 3 + Math.random() * 3;
    const crackGeo = new THREE.PlaneGeometry(len, 0.08);
    crackGeo.rotateX(-Math.PI / 2);
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const crack = new THREE.Mesh(crackGeo, crackMat);
    crack.position.set(x + Math.cos(a) * len * 0.5, 0.03, z + Math.sin(a) * len * 0.5);
    crack.rotation.y = a;
    scene.add(crack);
    effects.push({ mesh: crack, mat: crackMat, life: 0.6, maxLife: 0.6, disposeGeo: true });
  }
  // Spark ring burst
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
  const geo = new THREE.CircleGeometry(radius, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  effects.push({ mesh, mat, life: 0.3, maxLife: 0.3, expandRate: 5 });
}

export function showSwordSlash(x, z, angle, combo) {
  const arcAngle = 1.8;
  const radius = 3;
  const geo = new THREE.RingGeometry(0.5, radius, 16, 1, angle - arcAngle / 2, arcAngle);
  geo.rotateX(-Math.PI / 2);
  const colors = [0xffffff, 0xffcc44, 0xff4444];
  const color = colors[combo] || 0xffffff;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  effects.push({ mesh, mat, life: 0.2, maxLife: 0.2, disposeGeo: true });
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
      scene.remove(e.mesh);
      e.mat.dispose();
      if (e.disposeGeo) e.mesh.geometry.dispose();
      effects.splice(i, 1);
    }
  }
}
