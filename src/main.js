import { initRenderer, render, clock, updateCamera, setCamDt } from './renderer.js';
import { createArena, setBiome, updateBiome, updateArenaRadius } from './arena.js';
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, setPlayerDashing, removePlayerMesh, markLocalPlayer } from './player.js';
import { createEnemyMesh, updateEnemyMesh, flashEnemy, removeEnemyMesh, removeAllEnemies } from './enemy.js';
import { updatePickups as updatePickupMeshes, syncPickups } from './pickups.js';
import { updateParticles, spawnKillParticles, spawnSparks, spawnBloodDrops, spawnDustPuff, spawnSpeedTrail } from './particles.js';
import * as THREE from 'https://esm.sh/three@0.162.0';
import { scene } from './renderer.js';
import { showGunShot, showSpecialAttack, showDamageNumber, showExplosion, showHitImpact, updateCombatVisuals } from './combat.js';
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio, playShot, playWallPlace } from './audio.js';
import { getInput, getMobileInput, isMobile, setupMobileControls, isWallMode, exitWallMode } from './input.js';
import { connect, sendInput, sendPing, getState, getMyId, getPing, drainEvents } from './network.js';
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName, updateUpgradeDisplay, updateWeaponHUD, showControlsHint, hideControlsHint, updateCountdown, updateAbilities, updateInfo, updatePlayers, showYouDied, hideYouDied, updateWallMode } from './ui.js';
import { showUpgradeShop, hideUpgradeShop } from './upgrades.js';

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

// Wall rendering
const knownWalls = new Map();
const wallGeo = new THREE.BoxGeometry(4, 2.5, 0.5);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.5, metalness: 0.3 });

// Wall placement preview ghost
const ghostWallMat = new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const ghostWall = new THREE.Mesh(wallGeo.clone(), ghostWallMat);
ghostWall.visible = false;
ghostWall.position.y = 1.25;

// Client-side prediction
const PREDICTED_SPEED = 10;
let predictedX = 0, predictedZ = 0;
let hasPrediction = false;
let predDashTimer = 0, predDashDirX = 0, predDashDirZ = 0;
const DASH_SPEED = 30;
const DASH_DURATION = 250;
let currentArenaRadius = 40;
let predVelX = 0, predVelZ = 0;
let prevInputDx = 0, prevInputDz = 0;
let speedTrailCounter = 0;

// Track server overheated state for visual sync
let serverOverheated = false;
let wasAlive = true;

if (isMobile()) setupMobileControls();

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

async function startGame() {
  resumeAudio();
  hideUpgradeShop();
  const name = getPlayerName();
  try {
    await connect(name);
    gameActive = true;
    showHUD();
    showControlsHint();
    playerIndex = 0;
    knownPlayers.clear();
    knownEnemies.clear();
    removeAllEnemies();
    hasPrediction = false;
    predDashTimer = 0;
    serverOverheated = false;
    wasAlive = true;
    hideYouDied();
    markLocalPlayer(getMyId());
    scene.add(ghostWall);
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

let lastFrameTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const dt = clock.getDelta();
  setCamDt(dt);

  if (gameActive) {
    const input = isMobile() ? getMobileInput() : getInput();
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
        }

        if (predDashTimer > 0) {
          predDashTimer -= dtMs;
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
          const wepCooldowns = { pistol: 150, shotgun: 400, railgun: 400, flamethrower: 80 };
          let cooldown = wepCooldowns[weaponType] || 150;
          if (serverOverheated) cooldown *= 3; // Match server OVERHEAT.slowMult
          if (now - lastAttackTime > cooldown) {
            lastAttackTime = now;
            const angle = Math.atan2(input.aimZ - pz, input.aimX - px);
            showGunShot(px, pz, angle, weaponType);
            playShot(weaponType);
          }
        }
        if (input.special && now - lastSpecialTime > 3000) {
          lastSpecialTime = now;
          showSpecialAttack(px, pz);
          playExplosion();
        }

        // Wall placement preview ghost -- only in wall mode
        const wallCharges = me.wallCharges !== undefined ? me.wallCharges : 8;
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

  updateBiome(dt);
  updatePickupMeshes(dt);
  updateParticles(dt);
  updateCombatVisuals(dt);

  const myId = getMyId();
  const state = getState();
  if (state && myId) {
    const me = state.players.find(p => p.id === myId);
    if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
  } else {
    updateCamera(0, 0);
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
    setPlayerDashing(p.id, p.id === myId ? predDashTimer > 0 : p.dashing);
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

  // Sync projectiles
  const serverProjIds = new Set((state.projectiles || []).map(p => p.id));
  for (const [id, data] of knownProjectiles) {
    if (!serverProjIds.has(id)) { scene.remove(data.mesh); knownProjectiles.delete(id); }
  }
  for (const pr of (state.projectiles || [])) {
    if (!knownProjectiles.has(pr.id)) {
      const isBullet = pr.type === 'bullet';
      const mesh = new THREE.Mesh(isBullet ? bulletGeo : spitGeo, isBullet ? bulletMat : spitMat);
      mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
      scene.add(mesh);
      knownProjectiles.set(pr.id, { mesh });
    } else {
      const data = knownProjectiles.get(pr.id);
      data.mesh.position.set(pr.pos[0], 1.2, pr.pos[2]);
    }
  }

  // Sync walls
  const serverWallIds = new Set((state.walls || []).map(w => w.id));
  for (const [id, data] of knownWalls) {
    if (!serverWallIds.has(id)) {
      scene.remove(data.mesh);
      spawnSparks(data.mesh.position.x, data.mesh.position.z, 0x888888, 10);
      knownWalls.delete(id);
    }
  }
  for (const w of (state.walls || [])) {
    if (!knownWalls.has(w.id)) {
      const mat = wallMat.clone();
      const mesh = new THREE.Mesh(wallGeo, mat);
      mesh.position.set(w.pos[0], 1.25, w.pos[2]);
      mesh.rotation.y = w.angle || 0;
      mesh.castShadow = true;
      scene.add(mesh);
      knownWalls.set(w.id, { mesh, mat, maxHp: w.maxHp || 80 });
      playWallPlace();
    }
    const wData = knownWalls.get(w.id);
    if (wData) {
      const hpRatio = w.hp / wData.maxHp;
      wData.mat.opacity = 0.4 + hpRatio * 0.6;
      wData.mat.transparent = hpRatio < 1;
    }
  }

  const me = state.players.find(p => p.id === myId);
  if (me) {
    updateHUD(state.wave, state.score, me.hp, me.maxHp);
    updateUpgradeDisplay(me.upgrades);
    const dashPct = me.dashCooldown > 0 ? Math.max(0, 1 - me.dashCooldown / 2000) * 100 : 100;
    const dashFill = document.getElementById('dash-fill');
    if (dashFill) dashFill.style.width = dashPct + '%';
    updateWeaponHUD(me.weapon, me.overheated, me.heatPct || 0);
    updateAbilities(me.wallCharges !== undefined ? me.wallCharges : 8, me.specialCd || 0, me.dashCooldown || 0);
    updateInfo(me.kills || 0);
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
  updatePlayers(state.playerCount || 1);

  setBiome(state.wave);
  showCombo(state.combo);
}

function handleEvent(ev) {
  switch (ev.t) {
    case 'kill':
      spawnKillParticles(ev.pos[0], ev.pos[2], 0xff4444);
      playKill();
      break;
    case 'hit': {
      const isMe = ev.target === getMyId();
      if (isMe) {
        const me = getState()?.players?.find(p => p.id === getMyId());
        if (me) spawnBloodDrops(me.pos[0], me.pos[2]);
      }
      if (ev.pos) {
        showDamageNumber(ev.pos[0], ev.pos[2], ev.dmg, ev.crit);
        if (!isMe) showHitImpact(ev.pos[0], ev.pos[2]);
      }
      playHit(ev.dmg);
      flashEnemy(ev.target);
      break;
    }
    case 'upgrades':
      showUpgradeShop(ev.options);
      break;
    case 'wave': {
      hideUpgradeShop();
      playWaveStart();
      break;
    }
    case 'boss': {
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
    case 'gameover':
      gameActive = false;
      hasPrediction = false;
      hideUpgradeShop();
      hideControlsHint();
      hideYouDied();
      exitWallMode();
      updateWallMode(false);
      ghostWall.visible = false;
      showGameOver(ev.wave, ev.score, ev.players || ev.kills);
      playDeath();
      break;
  }
}

gameLoop();
