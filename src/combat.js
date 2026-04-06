import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { spawnAoeRing, spawnFloatingText, spawnSparks } from './particles.js';

const effects = [];

export function showGunShot(px, pz, angle, weaponType) {
  const fx = px + Math.cos(angle) * 0.8;
  const fz = pz + Math.sin(angle) * 0.8;
  weaponType = weaponType || 'pistol';

  if (weaponType === 'railgun') {
    // Long beam line
    const len = 40;
    const ex = px + Math.cos(angle) * len;
    const ez = pz + Math.sin(angle) * len;
    const mx = (px + ex) / 2, mz = (pz + ez) / 2;
    const beamGeo = new THREE.PlaneGeometry(len, 0.15);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(mx, 1.2, mz);
    beam.rotation.set(-Math.PI / 2, angle, 0);
    scene.add(beam);
    effects.push({ mesh: beam, mat: beamMat, life: 0.5, maxLife: 0.5 });
    // Bright origin flash
    const flashGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0x88eeff, transparent: true, opacity: 1 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(fx, 1.2, fz);
    scene.add(flash);
    effects.push({ mesh: flash, mat: flashMat, life: 0.15, maxLife: 0.15 });
    return;
  }

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
  spawnAoeRing(x, z, 5, 0xffaa00);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const beamGeo = new THREE.PlaneGeometry(5, 0.2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, 0.3, z);
    beam.rotation.set(Math.PI / 2, 0, a);
    scene.add(beam);
    effects.push({ mesh: beam, mat: beamMat, life: 0.25, maxLife: 0.25 });
  }
  const flashGeo = new THREE.CircleGeometry(1.5, 16);
  flashGeo.rotateX(-Math.PI / 2);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(x, 0.2, z);
  scene.add(flash);
  effects.push({ mesh: flash, mat: flashMat, life: 0.2, maxLife: 0.2, expandRate: 8 });
}

let dmgSlot = 0;
const DMG_OFFSETS = [
  [-1.5, -1], [1.5, -0.5], [-0.5, 1.2], [1.2, 0.8],
  [-1.8, 0.3], [0.3, -1.5], [1.8, 1.2], [-1, 1.5],
];

export function showDamageNumber(x, z, dmg, crit) {
  const color = crit ? '#ffff44' : '#ffffff';
  const text = crit ? 'CRIT ' + dmg + '!' : '' + dmg;
  const off = DMG_OFFSETS[dmgSlot % DMG_OFFSETS.length];
  dmgSlot++;
  spawnFloatingText(x + off[0], z + off[1], text, color, crit ? 4 : 2.5);
  if (crit) spawnSparks(x, z, 0xffff44, 12);
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
      effects.splice(i, 1);
    }
  }
}
