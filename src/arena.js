import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';

const ARENA_RADIUS = 40;
let floorMesh, barrierMesh, shrinkRingMesh, shrinkRingMat;
let currentRadius = 40;

const BIOMES = {
  stone:   { floor: 0x444444, wall: 0x777777 },
  inferno: { floor: 0x553322, wall: 0xaa4433 },
  frozen:  { floor: 0x3a5566, wall: 0x7799aa },
  toxic:   { floor: 0x2a4a2a, wall: 0x448844 },
  void:    { floor: 0x222244, wall: 0x554477 },
};

let currentBiome = 'stone';
let targetBiome = 'stone';
let biomeTransition = 0;

export function createArena() {
  const floorGeo = new THREE.CircleGeometry(ARENA_RADIUS, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
  floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const gridGeo = new THREE.BufferGeometry();
  const gridPoints = [];
  for (let i = -ARENA_RADIUS; i <= ARENA_RADIUS; i += 4) {
    const halfLen = Math.sqrt(Math.max(0, ARENA_RADIUS * ARENA_RADIUS - i * i));
    gridPoints.push(i, 0.01, -halfLen, i, 0.01, halfLen);
    gridPoints.push(-halfLen, 0.01, i, halfLen, 0.01, i);
  }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 });
  scene.add(new THREE.LineSegments(gridGeo, gridMat));

  const barrierGeo = new THREE.TorusGeometry(ARENA_RADIUS, 0.5, 8, 64);
  barrierGeo.rotateX(Math.PI / 2);
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });
  barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
  barrierMesh.position.y = 0.5;
  scene.add(barrierMesh);

  // Danger zone ring
  const shrinkGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.8, ARENA_RADIUS + 0.8, 64);
  shrinkGeo.rotateX(-Math.PI / 2);
  shrinkRingMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  shrinkRingMesh = new THREE.Mesh(shrinkGeo, shrinkRingMat);
  shrinkRingMesh.position.y = 0.08;
  scene.add(shrinkRingMesh);
}

export function setBiome(wave) {
  const biomes = ['stone', 'inferno', 'frozen', 'toxic', 'void'];
  const idx = Math.floor((wave - 1) / 5);
  targetBiome = biomes[Math.min(idx, biomes.length - 1)];
  if (targetBiome !== currentBiome) biomeTransition = 0;
}

export function updateArenaRadius(radius) {
  if (Math.abs(radius - currentRadius) < 0.1) return;
  currentRadius = radius;
  const scale = radius / ARENA_RADIUS;
  barrierMesh.scale.set(scale, 1, scale);
  shrinkRingMesh.scale.set(scale, 1, scale);
  shrinkRingMat.opacity = 0.2 + Math.sin(Date.now() / 400) * 0.15;
}

export function updateBiome(dt) {
  if (targetBiome === currentBiome) return;
  biomeTransition += dt / 2;
  if (biomeTransition >= 1) { biomeTransition = 1; currentBiome = targetBiome; }
  const from = BIOMES[currentBiome];
  const to = BIOMES[targetBiome];
  const c = new THREE.Color();
  c.copy(new THREE.Color(from.floor)).lerp(new THREE.Color(to.floor), biomeTransition);
  floorMesh.material.color.copy(c);
  c.copy(new THREE.Color(from.wall)).lerp(new THREE.Color(to.wall), biomeTransition);
  barrierMesh.material.color.copy(c);
}
