import { initRenderer, render, clock, updateCamera, setCamDt, camera } from './renderer.js';
import { createArena, setBiome, updateBiome, updateArenaRadius } from './arena.js';
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, setPlayerDashing, removePlayerMesh, markLocalPlayer, flashPlayer, updateAfterimages, loadCharacters } from './player.js';
import { createEnemyMesh, updateEnemyMesh, flashEnemy, removeEnemyMesh, removeAllEnemies, updateDyingEnemies, loadMonsterModels } from './enemy.js';
import { updatePickups as updatePickupMeshes, syncPickups, loadPickupModels } from './pickups.js';
import { updateParticles, spawnKillParticles, spawnSparks, spawnBloodDrops, spawnDustPuff, spawnSpeedTrail, spawnFloatingText, spawnGoreChunks, setParticleLimit } from './particles.js';
import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { showGunShot, showSpecialAttack, showDamageNumber, showExplosion, showHitImpact, updateCombatVisuals, showSwordSlash } from './combat.js';
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio, playShot, playWallPlace, playDash, playWallDestroy, playWaveClear, playSword } from './audio.js';
import { getInput, getMobileInput, isMobile, setupMobileControls, isWallMode, exitWallMode, resetInput } from './input.js';
import { connect, sendInput, sendPing, getState, getMyId, getPing, drainEvents, disconnect } from './network.js';
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName, updateUpgradeDisplay, updateWeaponHUD, showControlsHint, hideControlsHint, updateCountdown, updateAbilities, updateInfo, updatePlayers, showYouDied, hideYouDied, updateWallMode, showGameTip, showArenaWarn, updateFlagHUD } from './ui.js';
import { showUpgradeShop, hideUpgradeShop } from './upgrades.js';
import { loadModels, modelsReady, cloneTree } from './models.js';
import { loadDecorations, buildArenaDecorations, clearDecorations } from './decorations.js';

// Screen edge damage pulse
const flashOverlay = document.getElementById('flash-overlay');
function pulseDamageOverlay() {
  if (!flashOverlay) return;
  flashOverlay.style.background = 'radial-gradient(ellipse at center, transparent 50%, rgba(255,0,0,0.4) 100%)';
  flashOverlay.style.transition = 'none';
  flashOverlay.style.opacity = '1';
  flashOverlay.offsetHeight; // Force reflow so browser registers opacity:1
  flashOverlay.style.transition = 'opacity 0.3s ease-out';
  flashOverlay.style.opacity = '0';
}

initRenderer();
createArena();
showTitle();

let gameActive = false;
let lastPing = 0;
let playerIndex = 0;
const knownPlayers = new Map();
const knownEnemies = new Set();
let lastAttackTime = 0;
let lastSpecialTime = 0;
let lastInput = { dx: 0, dz: 0, attack: false, special: false, aimX: 0, aimZ: 0, wall: false };

// Projectile rendering
const knownProjectiles = new Map();
const bulletGeo = new THREE.SphereGeometry(0.2, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
const spitGeo = new THREE.SphereGeometry(0.25, 6, 6);
const spitMat = new THREE.MeshBasicMaterial({ color: 0x33ff33 });

// Async model loaders (fire-and-forget with fallbacks)
loadModels().catch(e => console.warn('Tree models failed:', e));
loadCharacters().catch(e => console.warn('Character models failed:', e));
loadDecorations().catch(e => console.warn('Decoration models failed:', e));
loadMonsterModels().catch(e => console.warn('Monster models failed:', e));
loadPickupModels().catch(e => console.warn('Pickup models failed:', e));
loadFlagModel().catch(e => console.warn('Flag model failed:', e));

// Wall rendering
const knownWalls = new Map();
const wallGeo = new THREE.BoxGeometry(4, 2.5, 0.5);
const WALL_COLORS = [0x4488ff, 0x44aaff, 0x6644cc, 0x3399ff, 0x5577ee, 0x2266dd, 0x7744bb, 0x3388cc];
const _dmgColor = new THREE.Color(0xff2222);
let wallColorIdx = 0;

// Wall placement preview ghost
const ghostWallMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
const ghostWall = new THREE.Mesh(wallGeo.clone(), ghostWallMat);
ghostWall.visible = false;
ghostWall.position.y = 1.25;

// Flag capture meshes
let flagGroup = null;
let deliveryMesh = null;
let flagAnimTime = 0;
let flagTemplate = null;

// Off-screen indicator arrows
const flagArrowEl = document.getElementById('flag-arrow');
const deliveryArrowEl = document.getElementById('delivery-arrow');

function updateOffscreenIndicators(state, myId) {
  if (!flagArrowEl || !deliveryArrowEl) return;
  if (!state || !state.flag || state.flagDelivered) {
    flagArrowEl.style.display = 'none';
    deliveryArrowEl.style.display = 'none';
    return;
  }
  const carrying = state.flag.carriedBy === myId;
  // Flag arrow: show when flag is free (not carried by anyone)
  if (!state.flag.carriedBy && flagGroup) {
    positionArrow(flagArrowEl, flagGroup.position.x, flagGroup.position.z);
  } else {
    flagArrowEl.style.display = 'none';
  }
  // Delivery arrow: show when local player is carrying
  if (carrying && deliveryMesh && deliveryMesh.visible) {
    positionArrow(deliveryArrowEl, deliveryMesh.position.x, deliveryMesh.position.z);
  } else {
    deliveryArrowEl.style.display = 'none';
  }
}

function positionArrow(el, worldX, worldZ) {
  const v = new THREE.Vector3(worldX, 0.5, worldZ);
  v.project(camera);
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const sx = v.x * hw + hw;
  const sy = -v.y * hh + hh;
  // If on-screen (with margin), hide
  const margin = 60;
  if (sx > margin && sx < window.innerWidth - margin && sy > margin && sy < window.innerHeight - margin && v.z < 1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  // Calculate angle from screen center to target
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const angle = Math.atan2(sy - cy, sx - cx);
  // Place on screen edge
  const edgePad = 40;
  const maxX = window.innerWidth - edgePad;
  const maxY = window.innerHeight - edgePad;
  let ex = cx + Math.cos(angle) * maxX;
  let ey = cy + Math.sin(angle) * maxY;
  // Clamp to screen bounds
  ex = Math.max(edgePad, Math.min(maxX, ex));
  ey = Math.max(edgePad, Math.min(maxY, ey));
  el.style.left = ex + 'px';
  el.style.top = ey + 'px';
  // Rotate arrow to point toward target
  const arrowAngle = angle - Math.PI / 2; // CSS triangle points up by default
  el.style.transform = 'translate(-50%, -50%) rotate(' + (arrowAngle * 180 / Math.PI) + 'deg)';
}

// Load flag OBJ model
async function loadFlagModel() {
  try {
    const { OBJLoader } = await import('https://esm.sh/three@0.162.0/addons/loaders/OBJLoader.js');
    const flagLoader = new OBJLoader();
    const obj = await new Promise(r => flagLoader.load('models/flag.obj', r, null, () => r(null)));
    if (!obj) return;
    // Scale to ~3 units tall
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const targetH = 3.5;
    obj.scale.multiplyScalar(targetH / sz.y);
    obj.updateWorldMatrix(true, true);
    box.setFromObject(obj);
    obj.position.y = -box.min.y;
    // Apply game materials by mesh name / material name
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xe6993a, emissive: 0xe6993a, emissiveIntensity: 0.5, roughness: 0.6, side: THREE.DoubleSide });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x444444, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.3 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, emissive: 0x1a0f00, emissiveIntensity: 0.1, roughness: 0.8 });
    obj.traverse(c => {
      if (!c.isMesh) return;
      const mname = (c.material && c.material.name) || '';
      if (mname === 'Flag') c.material = flagMat;
      else if (mname === 'Metal') c.material = metalMat;
      else if (mname === 'Wood') c.material = woodMat;
      else c.material = flagMat;
      c.castShadow = true;
    });
    const g = new THREE.Group();
    g.add(obj);
    flagTemplate = g;
  } catch (e) { console.warn('Flag model failed:', e); }
}

function createFlagMesh() {
  const group = new THREE.Group();
  if (flagTemplate) {
    const clone = flagTemplate.clone();
    clone.traverse(c => { if (c.isMesh) c.material = c.material.clone(); });
    group.add(clone);
  } else {
    // Fallback procedural flag -- thick pole + big cloth
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x444444, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2;
    group.add(pole);
    const clothGeo = new THREE.PlaneGeometry(1.8, 1.2);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xe6993a, emissive: 0xe6993a, emissiveIntensity: 0.8, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.position.set(0.95, 3.2, 0);
    group.add(cloth);
  }
  // Bright point light
  const light = new THREE.PointLight(0xe6993a, 4, 12);
  light.position.y = 3;
  group.add(light);
  // Ground glow ring under flag
  const ringGeo = new THREE.RingGeometry(1.0, 1.5, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe6993a, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  ring.name = 'flagRing';
  group.add(ring);
  // Vertical beam
  const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 10, 6);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xe6993a, transparent: true, opacity: 0.15 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 5;
  beam.name = 'flagBeam';
  group.add(beam);
  return group;
}

function createDeliveryMesh() {
  const group = new THREE.Group();
  // Outer ring
  const geo = new THREE.TorusGeometry(2.5, 0.2, 8, 32);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcc44, emissiveIntensity: 1.0, transparent: true, opacity: 0.8 });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 0.1;
  group.add(ring);
  // Inner ring
  const geo2 = new THREE.TorusGeometry(1.5, 0.1, 8, 24);
  geo2.rotateX(Math.PI / 2);
  const mat2 = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.3 });
  const ring2 = new THREE.Mesh(geo2, mat2);
  ring2.position.y = 0.08;
  group.add(ring2);
  // Vertical beam at delivery
  const beamGeo = new THREE.CylinderGeometry(0.2, 0.2, 12, 6);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.1 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 6;
  group.add(beam);
  // Point light
  const light = new THREE.PointLight(0xffcc44, 3, 10);
  light.position.y = 1;
  group.add(light);
  group.userData.mat = mat;
  return group;
}

function removeFlagMeshes() {
  if (flagGroup) { scene.remove(flagGroup); flagGroup = null; }
  if (deliveryMesh) { scene.remove(deliveryMesh); deliveryMesh = null; }
}

// Client-side prediction
const PREDICTED_SPEED = 10;
let predictedX = 0, predictedZ = 0;
let hasPrediction = false;
let predDashTimer = 0, predDashDirX = 0, predDashDirZ = 0;
const DASH_SPEED = 30;
const DASH_DURATION = 200;
let currentArenaRadius = 40;
let predVelX = 0, predVelZ = 0;
let prevInputDx = 0, prevInputDz = 0;
let speedTrailCounter = 0;

// Performance scaling for multiplayer
let perfMode = false; // true when 2 players
function setPerfMode(playerCount) {
  const was = perfMode;
  perfMode = playerCount >= 2;
  if (perfMode !== was) setParticleLimit(perfMode ? 100 : 200);
}

// Persistent corpses / blood pools
const corpses = [];
const MAX_CORPSES = 60;
const corpseGeos = [
  (() => { const g = new THREE.CircleGeometry(0.6, 8); g.rotateX(-Math.PI / 2); return g; })(),
  (() => { const g = new THREE.CircleGeometry(0.8, 10); g.rotateX(-Math.PI / 2); return g; })(),
  (() => { const g = new THREE.CircleGeometry(1.0, 12); g.rotateX(-Math.PI / 2); return g; })(),
];
const BLOOD_COLORS = [0x660000, 0x550000, 0x440000, 0x3a0000, 0x771111];

// Environment obstacles
const obstacleMeshes = new Map();
let cachedObstacles = [];

// Track server overheated state for visual sync
let serverOverheated = false;
let wasAlive = true;
let lastComboTier = 0;
const COMBO_TIER_THRESHOLDS = [5, 10, 15, 20, 30, 50];

// Time scaling for dramatic slow-mo
let timeScale = 1.0;
let slowMoReturn = 2.0;
function triggerSlowMo(scale, speed) {
  timeScale = scale || 0.3;
  slowMoReturn = speed || 2.0;
}

// Projectile object pool
const projPool = { bullet: [], spit: [] };
for (let i = 0; i < 40; i++) {
  const b = new THREE.Mesh(bulletGeo, bulletMat);
  b.visible = false; b.position.y = -100;
  scene.add(b);
  projPool.bullet.push(b);
}
for (let i = 0; i < 15; i++) {
  const s = new THREE.Mesh(spitGeo, spitMat);
  s.visible = false; s.position.y = -100;
  scene.add(s);
  projPool.spit.push(s);
}
function acquireProj(isBullet) {
  const pool = isBullet ? projPool.bullet : projPool.spit;
  if (pool.length > 0) { const m = pool.pop(); m.visible = true; return m; }
  const m = new THREE.Mesh(isBullet ? bulletGeo : spitGeo, isBullet ? bulletMat : spitMat);
  scene.add(m);
  return m;
}
function releaseProj(mesh, isBullet) {
  mesh.visible = false; mesh.position.y = -100;
  (isBullet ? projPool.bullet : projPool.spit).push(mesh);
}

// Near-miss detection (triggers during dashes for skill reward)
const nearMissed = new Set();

if (isMobile()) setupMobileControls();

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', quitToMenu);
document.getElementById('go-menu-btn').addEventListener('click', quitToMenu);

// ESC during gameplay = quit to menu (only when NOT in wall mode)
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && gameActive && !isWallMode()) quitToMenu();
});

function quitToMenu() {
  gameActive = false;
  hasPrediction = false;
  disconnect();
  hideUpgradeShop();
  hideControlsHint();
  hideYouDied();
  resetInput();
  updateWallMode(false);
  ghostWall.visible = false;
  removeAllEnemies();
  for (const [id, data] of knownProjectiles) { releaseProj(data.mesh, data.isBullet); }
  knownProjectiles.clear();
  for (const [id, data] of knownWalls) { scene.remove(data.mesh); data.mat.dispose(); }
  knownWalls.clear();
  for (const [id] of knownPlayers) { removePlayerMesh(id); }
  knownPlayers.clear();
  knownEnemies.clear();
  nearMissed.clear();
  removeFlagMeshes();
  timeScale = 1.0;
  for (const c of corpses) { scene.remove(c); c.material.dispose(); }
  corpses.length = 0;
  for (const [, mesh] of obstacleMeshes) { scene.remove(mesh); }
  obstacleMeshes.clear();
  cachedObstacles = [];
  clearDecorations();
  showTitle();
}

async function startGame() {
  resumeAudio();
  hideUpgradeShop();
  const name = getPlayerName();
  try {
    await connect(name);
    resetInput();
    gameActive = true;
    showHUD();
    showControlsHint();
    playerIndex = 0;
    knownPlayers.clear();
    knownEnemies.clear();
    removeAllEnemies();
    for (const [id, data] of knownProjectiles) { releaseProj(data.mesh, data.isBullet); }
    knownProjectiles.clear();
    for (const [id, data] of knownWalls) { scene.remove(data.mesh); data.mat.dispose(); }
    knownWalls.clear();
    for (const c of corpses) { scene.remove(c); c.material.dispose(); }
    corpses.length = 0;
    for (const [, mesh] of obstacleMeshes) { scene.remove(mesh); }
    obstacleMeshes.clear();
    cachedObstacles = [];
    nearMissed.clear();
    removeFlagMeshes();
    timeScale = 1.0;
      hasPrediction = false;
    predDashTimer = 0;
    serverOverheated = false;
    wasAlive = true;
    lastComboTier = 0;
    hideYouDied();
    markLocalPlayer(getMyId());
    scene.add(ghostWall);
    buildArenaDecorations(40);
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

let treeIdx = 0;
function syncObstacleMeshes(obstacles) {
  for (const ob of obstacles) {
    const key = ob.type + '_' + ob.pos[0] + '_' + ob.pos[2];
    if (obstacleMeshes.has(key)) continue;
    if (ob.type === 'tree') {
      let group = cloneTree(treeIdx++);
      if (!group) {
        // Fallback: procedural tree if models not loaded yet
        group = new THREE.Group();
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
        const trunkMat2 = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat2);
        trunk.position.y = 1.5; trunk.castShadow = true;
        group.add(trunk);
        const canopyGeo = new THREE.SphereGeometry(1.4, 8, 6);
        const canopyMat2 = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat2);
        canopy.position.y = 3.5; canopy.castShadow = true;
        group.add(canopy);
      }
      // Random scale variation for natural look
      const sv = 0.85 + Math.random() * 0.3;
      group.scale.set(sv, sv, sv);
      group.position.set(ob.pos[0], 0, ob.pos[2]);
      group.rotation.y = Math.random() * Math.PI * 2;
      scene.add(group);
      obstacleMeshes.set(key, group);
    } else if (ob.type === 'water') {
      const group = new THREE.Group();
      const waterGeo = new THREE.CircleGeometry(ob.radius, 24);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a4a7a, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = 0.03;
      group.add(water);
      const edgeGeo = new THREE.RingGeometry(ob.radius - 0.3, ob.radius + 0.2, 24);
      edgeGeo.rotateX(-Math.PI / 2);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0x3a6a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.y = 0.04;
      group.add(edge);
      group.position.set(ob.pos[0], 0, ob.pos[2]);
      scene.add(group);
      obstacleMeshes.set(key, group);
    }
  }
}

let lastFrameTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dtMs = Math.min(now - lastFrameTime, 100); // Cap at 100ms to prevent physics explosions
  lastFrameTime = now;
  const rawDt = Math.min(clock.getDelta(), 0.1);
  if (timeScale < 1.0) timeScale = Math.min(timeScale + slowMoReturn * rawDt, 1.0);
  const dt = rawDt;
  const visualDt = rawDt * timeScale;
  setCamDt(dt);

  if (gameActive) {
    const input = isMobile() ? getMobileInput() : getInput();
    // Mobile: offset aim by player position so aim direction is relative
    if (input.mobileAimRelative && hasPrediction) {
      input.aimX += predictedX;
      input.aimZ += predictedZ;
    }
    lastInput = input;
    sendInput(input);

    const myId = getMyId();
    const state = getState();
    if (state && myId) {
      const me = state.players.find(p => p.id === myId);
      if (me && me.alive) {
        // Client-side prediction
        if (!hasPrediction) {
          predictedX = me.pos[0];
          predictedZ = me.pos[2];
          hasPrediction = true;
        }

        // Track server overheat state
        serverOverheated = !!me.overheated;

        // Dash prediction
        if (input.dash && !predDashTimer) {
          let ddx = input.dx, ddz = input.dz;
          const dlen = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dlen > 0) { ddx /= dlen; ddz /= dlen; }
          else {
            const aDx = input.aimX - predictedX, aDz = input.aimZ - predictedZ;
            const aLen = Math.sqrt(aDx * aDx + aDz * aDz) || 1;
            ddx = aDx / aLen; ddz = aDz / aLen;
          }
          predDashDirX = ddx; predDashDirZ = ddz;
          predDashTimer = DASH_DURATION;
          spawnDustPuff(predictedX, predictedZ);
          playDash();
        }

        if (predDashTimer > 0) {
          predDashTimer -= dtMs;
          if (predDashTimer < 0) predDashTimer = 0;
          predictedX += predDashDirX * DASH_SPEED * dt;
          predictedZ += predDashDirZ * DASH_SPEED * dt;
        } else {
          const speed = (me.buffs && me.buffs.includes('speed')) ? PREDICTED_SPEED * 1.5 : PREDICTED_SPEED;
          if (input.dx !== 0 || input.dz !== 0) {
            predVelX = input.dx * speed;
            predVelZ = input.dz * speed;
          } else {
            predVelX *= Math.exp(-20 * dt);
            predVelZ *= Math.exp(-20 * dt);
            if (Math.abs(predVelX) < 0.1) predVelX = 0;
            if (Math.abs(predVelZ) < 0.1) predVelZ = 0;
          }
          predictedX += predVelX * dt;
          predictedZ += predVelZ * dt;
        }
        const pDist = Math.sqrt(predictedX * predictedX + predictedZ * predictedZ);
        if (pDist > currentArenaRadius - 1) {
          const s = (currentArenaRadius - 1) / pDist;
          predictedX *= s;
          predictedZ *= s;
        }
        // Client obstacle prediction removed (trees are visual only)

        // Direction change dust puff
        if ((input.dx !== 0 || input.dz !== 0) &&
            (Math.sign(input.dx) !== Math.sign(prevInputDx) && prevInputDx !== 0 ||
             Math.sign(input.dz) !== Math.sign(prevInputDz) && prevInputDz !== 0)) {
          spawnDustPuff(predictedX, predictedZ);
        }
        prevInputDx = input.dx;
        prevInputDz = input.dz;

        // Speed trail when buffed or dashing
        const hasSpeedBuff = me.buffs && me.buffs.includes('speed');
        if (predDashTimer > 0) {
          spawnSpeedTrail(predictedX, predictedZ, 0x44ddff);
        } else if (hasSpeedBuff && (input.dx !== 0 || input.dz !== 0)) {
          speedTrailCounter++;
          if (speedTrailCounter % 3 === 0) spawnSpeedTrail(predictedX, predictedZ, 0xffff44);
        }

        // Gun shot visual - sync with server overheat state
        const px = predictedX;
        const pz = predictedZ;
        if (input.attack) {
          const weaponType = me.weapon || 'pistol';
          const wepCooldowns = { pistol: 150, shotgun: 400, flamethrower: 80 };
          let cooldown = wepCooldowns[weaponType] || 150;
          if (serverOverheated) cooldown *= 3; // Match server OVERHEAT.slowMult
          if (now - lastAttackTime > cooldown) {
            lastAttackTime = now;
            const angle = Math.atan2(input.aimZ - pz, input.aimX - px);
            showGunShot(px, pz, angle, weaponType);
            playShot(weaponType);
          }
        }
        if (input.special && now - lastSpecialTime > 2500) {
          lastSpecialTime = now;
          showSpecialAttack(px, pz);
          playExplosion();
        }

        // Wall placement preview ghost -- only in wall mode
        const wallCharges = me.wallCharges !== undefined ? me.wallCharges : 5;
        const inWallMode = isWallMode();
        updateWallMode(inWallMode);
        if (inWallMode && wallCharges > 0) {
          const aimAngle = Math.atan2(input.aimZ - pz, input.aimX - px);
          const aimDist = Math.sqrt((input.aimX - px) ** 2 + (input.aimZ - pz) ** 2);
          const placeDist = Math.min(aimDist, 8);
          const wx = px + Math.cos(aimAngle) * placeDist;
          const wz = pz + Math.sin(aimAngle) * placeDist;
          ghostWall.position.set(wx, 1.25, wz);
          ghostWall.rotation.y = aimAngle + Math.PI / 2;
          ghostWall.visible = true;
        } else {
          ghostWall.visible = false;
        }
      } else {
        ghostWall.visible = false;
      }
    }

    if (Date.now() - lastPing > 2000) {
      sendPing();
      lastPing = Date.now();
      updatePing(getPing());
    }

    const events = drainEvents();
    for (const ev of events) handleEvent(ev);

    if (state) processState(state, dt);
  }

  updateBiome(visualDt);
  updatePickupMeshes(visualDt);
  updateParticles(visualDt);
  updateCombatVisuals(visualDt);
  updateDyingEnemies(visualDt);
  updateAfterimages(visualDt);

  const myId = getMyId();
  const state = getState();
  if (state && myId) {
    const me = state.players.find(p => p.id === myId);
    if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
    updateOffscreenIndicators(state, myId);
  } else {
    updateCamera(0, 0);
    updateOffscreenIndicators(null, null);
  }

  render();
}

function processState(state, dt) {
  const myId = getMyId();

  // Update arena radius
  if (state.arenaRadius !== undefined) {
    currentArenaRadius = state.arenaRadius;
    updateArenaRadius(currentArenaRadius);
  }

  const serverPlayerIds = new Set(state.players.map(p => p.id));
  for (const [id] of knownPlayers) {
    if (!serverPlayerIds.has(id)) { removePlayerMesh(id); knownPlayers.delete(id); }
  }
  for (const p of state.players) {
    if (!knownPlayers.has(p.id)) {
      createPlayerMesh(p.id, playerIndex++);
      knownPlayers.set(p.id, { prevPos: [0, 0] });
      if (p.id === myId) markLocalPlayer(p.id);
    }
    const data = knownPlayers.get(p.id);
    const dx = p.pos[0] - data.prevPos[0];
    const dz = p.pos[2] - data.prevPos[1];
    const moving = (dx * dx + dz * dz) > 0.001;
    data.prevPos = [p.pos[0], p.pos[2]];

    if (p.id === myId && hasPrediction) {
      // Correct prediction toward server position
      const correction = 1 - Math.exp(-5 * dt);
      predictedX += (p.pos[0] - predictedX) * correction;
      predictedZ += (p.pos[2] - predictedZ) * correction;
      if (!p.dashing && predDashTimer > 0) predDashTimer = 0;
      updatePlayerMesh(p.id, predictedX, predictedZ, p.alive, moving || (lastInput.dx !== 0 || lastInput.dz !== 0), dt);
      if (p.alive) {
        setPlayerRotation(p.id, Math.atan2(lastInput.aimZ - predictedZ, lastInput.aimX - predictedX));
      }
    } else {
      updatePlayerMesh(p.id, p.pos[0], p.pos[2], p.alive, moving, dt);
      if (p.id === myId && p.alive) {
        setPlayerRotation(p.id, Math.atan2(lastInput.aimZ - p.pos[2], lastInput.aimX - p.pos[0]));
      }
    }
    setPlayerDashing(p.id, p.id === myId ? (predDashTimer > 0 || p.dashing) : p.dashing);
  }

  const serverEnemyIds = new Set(state.enemies.map(e => e.id));
  for (const id of knownEnemies) {
    if (!serverEnemyIds.has(id)) { removeEnemyMesh(id); knownEnemies.delete(id); }
  }
  for (const e of state.enemies) {
    if (!knownEnemies.has(e.id)) {
      createEnemyMesh(e.id, e.type);
      knownEnemies.add(e.id);
    }
    updateEnemyMesh(e.id, e.pos[0], e.pos[2], e.hp, e.maxHp || e.hp, dt);
  }

  // Play pickup sound when a nearby pickup disappears (collected)
  const me2 = state.players.find(p => p.id === myId);
  syncPickups(state.pickups, (removedX, removedZ) => {
    if (me2) {
      const dx = removedX - (hasPrediction ? predictedX : me2.pos[0]);
      const dz = removedZ - (hasPrediction ? predictedZ : me2.pos[2]);
      if (dx * dx + dz * dz < 100) playPickup();
    }
  });

  // Sync projectiles (object pooled)
  const serverProjIds = new Set((state.projectiles || []).map(p => p.id));
  for (const [id, data] of knownProjectiles) {
    if (!serverProjIds.has(id)) { releaseProj(data.mesh, data.isBullet); knownProjectiles.delete(id); }
  }
  for (const pr of (state.projectiles || [])) {
    if (!knownProjectiles.has(pr.id)) {
      const isBullet = pr.type === 'bullet';
      const mesh = acquireProj(isBullet);
      mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
      knownProjectiles.set(pr.id, { mesh, isBullet });
    } else {
      knownProjectiles.get(pr.id).mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
    }
  }

  // Sync walls
  const serverWallIds = new Set((state.walls || []).map(w => w.id));
  for (const [id, data] of knownWalls) {
    if (!serverWallIds.has(id)) {
      scene.remove(data.mesh);
      data.mat.dispose();
      spawnSparks(data.mesh.position.x, data.mesh.position.z, data.baseColor || 0x4488ff, 10);
      playWallDestroy();
      knownWalls.delete(id);
    }
  }
  for (const w of (state.walls || [])) {
    if (!knownWalls.has(w.id)) {
      const wColor = WALL_COLORS[wallColorIdx % WALL_COLORS.length];
      wallColorIdx++;
      const mat = new THREE.MeshStandardMaterial({
        color: wColor, emissive: wColor, emissiveIntensity: 0.3,
        roughness: 0.4, metalness: 0.2, transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(wallGeo, mat);
      mesh.position.set(w.pos[0], 1.25, w.pos[2]);
      mesh.rotation.y = w.angle || 0;
      mesh.castShadow = true;
      scene.add(mesh);
      knownWalls.set(w.id, { mesh, mat, maxHp: w.maxHp || 120, baseColor: wColor });
      playWallPlace();
      spawnSparks(w.pos[0], w.pos[2], 0x4488ff, 4);
      spawnDustPuff(w.pos[0], w.pos[2]);
    }
    const wData = knownWalls.get(w.id);
    if (wData) {
      const hpRatio = Math.max(0, w.hp / wData.maxHp);
      wData.mat.opacity = 0.5 + hpRatio * 0.5;
      const dmgT = 1 - hpRatio;
      wData.mat.color.set(wData.baseColor || 0x4488ff).lerp(_dmgColor, dmgT);
      wData.mat.emissive.set(wData.baseColor || 0x4488ff).lerp(_dmgColor, dmgT);
      wData.mat.emissiveIntensity = 0.3 + dmgT * 0.4;
    }
  }

  // Sync flag position
  if (state.flag && !state.flagDelivered) {
    if (!flagGroup) { flagGroup = createFlagMesh(); scene.add(flagGroup); }
    if (state.flag.carriedBy) {
      const carrier = state.players.find(p => p.id === state.flag.carriedBy);
      if (carrier) {
        const cx = (carrier.id === myId && hasPrediction) ? predictedX : carrier.pos[0];
        const cz = (carrier.id === myId && hasPrediction) ? predictedZ : carrier.pos[2];
        flagGroup.position.set(cx, 0, cz);
      }
    } else {
      flagGroup.position.set(state.flag.x, 0, state.flag.z);
    }
    // Animate flag -- gentle bob and rotation
    flagAnimTime += dt;
    flagGroup.rotation.y = Math.sin(flagAnimTime * 2) * 0.3;
    flagGroup.position.y = Math.sin(flagAnimTime * 3) * 0.15;
    // Pulse the ground ring
    const flagRing = flagGroup.getObjectByName('flagRing');
    if (flagRing) flagRing.material.opacity = 0.2 + Math.sin(flagAnimTime * 4) * 0.2;
    if (!deliveryMesh) { deliveryMesh = createDeliveryMesh(); scene.add(deliveryMesh); }
    deliveryMesh.position.set(state.delivery.x, 0, state.delivery.z);
    deliveryMesh.visible = true;
    // Intensify delivery zone when carrying flag and approaching
    const carrying = state.flag.carriedBy === myId;
    let intensity = 0;
    if (carrying && hasPrediction) {
      const ddx = state.delivery.x - predictedX;
      const ddz = state.delivery.z - predictedZ;
      const dDist = Math.sqrt(ddx * ddx + ddz * ddz);
      intensity = Math.max(0, 1 - dDist / 25); // 0 at 25+ units, 1 at 0
    }
    const pulseSpeed = 0.003 + intensity * 0.009;
    const pulseBase = 0.5 + intensity * 0.4;
    const pulseAmp = 0.3 - intensity * 0.1;
    const pulse = pulseBase + Math.sin(Date.now() * pulseSpeed) * pulseAmp;
    deliveryMesh.userData.mat.opacity = pulse;
    deliveryMesh.userData.mat.emissiveIntensity = 1.0 + intensity * 3.0;
    const dBeam = deliveryMesh.children[2]; // beam
    if (dBeam && dBeam.material) dBeam.material.opacity = 0.1 + intensity * 0.5;
    const dLight = deliveryMesh.children[3]; // point light
    if (dLight) { dLight.intensity = 3 + intensity * 8; dLight.distance = 10 + intensity * 15; }
    const dInner = deliveryMesh.children[1]; // inner ring
    if (dInner && dInner.material) dInner.material.opacity = 0.3 + intensity * 0.5;
    deliveryMesh.rotation.y += dt * (0.5 + intensity * 3.0);
    const dScale = 1 + intensity * 0.3;
    deliveryMesh.scale.set(dScale, 1 + intensity * 0.5, dScale);
  } else {
    if (flagGroup) { scene.remove(flagGroup); flagGroup = null; }
    if (deliveryMesh) deliveryMesh.visible = false;
  }

  const me = state.players.find(p => p.id === myId);
  if (me) {
    updateHUD(state.wave, state.score, me.hp, me.maxHp);
    updateUpgradeDisplay(me.upgrades);
    const dashCharges = me.dashCharges !== undefined ? me.dashCharges : 3;
    const dashFill = document.getElementById('dash-fill');
    if (dashFill) dashFill.style.width = (dashCharges / 3 * 100) + '%';
    updateWeaponHUD(me.weapon, me.overheated, me.heatPct || 0);
    updateAbilities(me.wallCharges !== undefined ? me.wallCharges : 5, me.specialCd || 0, dashCharges, me.swordCd || 0);
    updateInfo(me.kills || 0);
    const carrying = state.flag && state.flag.carriedBy === myId;
    updateFlagHUD(state.phase === 'combat' && !state.flagDelivered, carrying);
    // Show YOU DIED when player dies but game continues
    if (!me.alive && wasAlive) {
      showYouDied();
      wasAlive = false;
    } else if (me.alive && !wasAlive) {
      hideYouDied();
      wasAlive = true;
    }
  }
  updateCountdown(state.phase, state.waveTimer);
  const pcount = state.playerCount || 1;
  setPerfMode(pcount);
  updatePlayers(pcount);

  // Near-miss detection during dashes
  if (predDashTimer > 0) {
    const me3 = state.players.find(p => p.id === myId);
    if (me3 && me3.alive) {
      const npx = hasPrediction ? predictedX : me3.pos[0];
      const npz = hasPrediction ? predictedZ : me3.pos[2];
      for (const e of state.enemies) {
        if (nearMissed.has(e.id)) continue;
        const ndx = e.pos[0] - npx, ndz = e.pos[2] - npz;
        if (ndx * ndx + ndz * ndz < 6.25) { // 2.5^2
          nearMissed.add(e.id);
          spawnFloatingText(npx + 1.5, npz, 'NEAR MISS', '#44ddff', 1.5);
          triggerSlowMo(0.4, 4.0); // brief micro slow-mo on near miss
        }
      }
    }
  }
  // Clean stale near-miss entries
  if (nearMissed.size > 0) {
    const liveIds = new Set(state.enemies.map(e => e.id));
    for (const id of nearMissed) { if (!liveIds.has(id)) nearMissed.delete(id); }
  }

  setBiome(state.wave);
  showCombo(state.combo);

  // Combo audio escalation -- play sound when crossing tier thresholds
  let currentTier = 0;
  for (const t of COMBO_TIER_THRESHOLDS) { if (state.combo >= t) currentTier = t; }
  if (currentTier > lastComboTier && currentTier > 0) playCombo();
  lastComboTier = currentTier;
}

function handleEvent(ev) {
  switch (ev.t) {
    case 'sword': {
      showSwordSlash(ev.pos[0], ev.pos[2], ev.angle, ev.combo);
      playSword(ev.combo);
      break;
    }
    case 'kill': {
      if (!perfMode) spawnGoreChunks(ev.pos[0], ev.pos[2]);
      spawnKillParticles(ev.pos[0], ev.pos[2], 0xff4444);
      if (!perfMode) spawnBloodDrops(ev.pos[0], ev.pos[2]);
      playKill();
      // Blood pool decal (varied size and color)
      const bcolor = BLOOD_COLORS[Math.floor(Math.random() * BLOOD_COLORS.length)];
      const bgeo = corpseGeos[Math.floor(Math.random() * corpseGeos.length)];
      const corpseMat = new THREE.MeshBasicMaterial({ color: bcolor, transparent: true, opacity: 0.35 + Math.random() * 0.2, side: THREE.DoubleSide });
      const corpseMesh = new THREE.Mesh(bgeo, corpseMat);
      corpseMesh.position.set(ev.pos[0] + (Math.random() - 0.5) * 0.5, 0.02, ev.pos[2] + (Math.random() - 0.5) * 0.5);
      corpseMesh.rotation.y = Math.random() * Math.PI * 2;
      const bscale = 0.8 + Math.random() * 0.6;
      corpseMesh.scale.set(bscale, 1, bscale);
      scene.add(corpseMesh);
      corpses.push(corpseMesh);
      const corpseLimit = perfMode ? 30 : MAX_CORPSES;
      if (corpses.length > corpseLimit) { const old = corpses.shift(); scene.remove(old); old.material.dispose(); }
      // Score popup at kill location
      const combo = ev.combo || 0;
      const wave = getState()?.wave || 1;
      let multiplier = 1;
      for (const t of COMBO_TIER_THRESHOLDS) { if (combo >= t) multiplier = 1 + (COMBO_TIER_THRESHOLDS.indexOf(t) + 1) * 0.1; }
      const pts = Math.floor((10 + wave * 2) * multiplier);
      spawnFloatingText(ev.pos[0] + 1.5, ev.pos[2], '+' + pts, '#e6993a', 2);
      break;
    }
    case 'hit': {
      const isMe = ev.target === getMyId();
      if (isMe) {
        const me = getState()?.players?.find(p => p.id === getMyId());
        if (me) spawnBloodDrops(me.pos[0], me.pos[2]);
        flashPlayer(getMyId());
        pulseDamageOverlay();
      }
      if (ev.pos) {
        showDamageNumber(ev.pos[0], ev.pos[2], ev.dmg, ev.crit);
        if (!isMe) {
          showHitImpact(ev.pos[0], ev.pos[2]);
          if (!perfMode) spawnBloodDrops(ev.pos[0], ev.pos[2]);
        }
      }
      playHit(ev.dmg);
      flashEnemy(ev.target);
      break;
    }
    case 'upgrades': {
      // Wave cleared -- slow-mo + celebrate before showing shop
      triggerSlowMo(0.2, 1.5);
      const meNow = getState()?.players?.find(p => p.id === getMyId());
      const px2 = meNow ? (hasPrediction ? predictedX : meNow.pos[0]) : 0;
      const pz2 = meNow ? (hasPrediction ? predictedZ : meNow.pos[2]) : 0;
      spawnKillParticles(px2, pz2, 0xe6993a);
      spawnSparks(px2, pz2, 0xffcc44, 6);
      playWaveClear();
      const waveNum = getState()?.wave || 0;
      spawnFloatingText(px2, pz2, 'WAVE ' + waveNum + ' CLEARED', '#e6993a', 3);
      showUpgradeShop(ev.options);
      break;
    }
    case 'wave': {
      hideUpgradeShop();
      playWaveStart();
      const waveNum2 = getState()?.wave || 1;
      if (waveNum2 === 1) showGameTip('[E] BUILD WALLS -- block enemies and control the arena!', 8000);
      else if (waveNum2 === 2) showGameTip('WALLS block enemy movement and projectiles!', 6000);
      else if (waveNum2 === 3) showGameTip('DASH through enemies for NEAR MISS bonus!', 5000);
      if (waveNum2 >= 2) showArenaWarn(2500);
      break;
    }
    case 'obstacles': {
      cachedObstacles = ev.obstacles || [];
      syncObstacleMeshes(cachedObstacles);
      break;
    }
    case 'boss': {
      triggerSlowMo(0.15, 1.0);
      playBossSpawn();
      break;
    }
    case 'death':
      if (ev.pid === getMyId()) {
        playDeath();
      }
      break;
    case 'explosion':
      showExplosion(ev.pos[0], ev.pos[2], ev.radius);
      playExplosion();
      break;
    case 'flag_spawn': {
      removeFlagMeshes();
      flagGroup = createFlagMesh();
      if (ev.flag) flagGroup.position.set(ev.flag.x, 0, ev.flag.z);
      scene.add(flagGroup);
      deliveryMesh = createDeliveryMesh();
      if (ev.delivery) deliveryMesh.position.set(ev.delivery.x, 0, ev.delivery.z);
      scene.add(deliveryMesh);
      break;
    }
    case 'flag_picked': {
      const picker = getState()?.players?.find(p => p.id === ev.pid);
      const isMe = ev.pid === getMyId();
      const fx = isMe && hasPrediction ? predictedX : (picker ? picker.pos[0] : 0);
      const fz = isMe && hasPrediction ? predictedZ : (picker ? picker.pos[2] : 0);
      spawnSparks(fx, fz, 0xe6993a, 8);
      spawnFloatingText(fx + 1.5, fz, 'FLAG!', '#e6993a', 2);
      break;
    }
    case 'flag_dropped': {
      if (ev.flag) {
        spawnSparks(ev.flag.x, ev.flag.z, 0xff4444, 6);
        spawnFloatingText(ev.flag.x + 1, ev.flag.z, 'DROPPED', '#ff4444', 2);
      }
      break;
    }
    case 'flag_delivered': {
      const meD = getState()?.players?.find(p => p.id === getMyId());
      const dx = meD ? (hasPrediction ? predictedX : meD.pos[0]) : 0;
      const dz = meD ? (hasPrediction ? predictedZ : meD.pos[2]) : 0;
      spawnKillParticles(dx, dz, 0xffcc44);
      spawnSparks(dx, dz, 0xffcc44, 12);
      if (ev.bonus) spawnFloatingText(dx + 1.5, dz, '+' + ev.bonus + ' BONUS', '#ffcc44', 3);
      break;
    }
    case 'gameover':
      gameActive = false;
      hasPrediction = false;
      hideUpgradeShop();
      hideControlsHint();
      hideYouDied();
      resetInput();
      updateWallMode(false);
      ghostWall.visible = false;
      for (const c of corpses) { scene.remove(c); c.material.dispose(); }
      corpses.length = 0;
      showGameOver(ev.wave, ev.score, ev.players || ev.kills);
      playDeath();
      break;
  }
}

gameLoop();
