# Slaughterdome Gameplay Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 gameplay features: dash, camera look-ahead, camera kick, deceleration, movement particles, upgrade shop, weapon variety, and passive stacking.

**Architecture:** Server-authoritative multiplayer with client prediction. All gameplay state validated on server, clients predict locally for responsiveness. New upgrade system hooks into existing wave-clear flow. No build step, ES modules, ThreeJS from CDN.

**Tech Stack:** Node.js + ws (server), Three.js + vanilla JS (client), WebSocket protocol, procedural audio

**Note:** This is a browser-based real-time game with no test framework. Each task includes manual verification steps: restart server, refresh browser, test the behavior.

**Server restart command:** Kill existing server process, then `cd /Users/rufflesrufus/projects/slaughterdome/server && node index.js`

**Client URL:** `http://localhost:3000`

---

## File Map

| File | Role | Tasks |
|------|------|-------|
| `server/config.js` | All game constants | 1, 9, 12 |
| `server/game.js` | Game loop, combat, AI, spawning | 2, 10, 11, 13, 14 |
| `server/room.js` | Room state, player lifecycle | 3, 10 |
| `server/index.js` | WebSocket server, message dispatch | 4, 10 |
| `src/input.js` | Keyboard/mouse input capture | 4 |
| `src/network.js` | WebSocket client, state sync | 4, 10 |
| `src/main.js` | Client game loop, rendering sync | 5, 6, 7, 8, 10 |
| `src/renderer.js` | Three.js setup, camera | 6, 7 |
| `src/particles.js` | Spark, kill, neon effects | 8 |
| `src/player.js` | Player mesh creation/animation | 5 |
| `src/combat.js` | Weapon visual effects | 13 |
| `src/audio.js` | Procedural sound effects | 13 |
| `src/ui.js` | HUD text, menus | 10 |
| `src/upgrades.js` | NEW: Upgrade shop UI | 10 |
| `index.html` | HTML structure, CSS | 5, 10 |

---

## Task 1: Dash Config and Server Constants

**Files:**
- Modify: `server/config.js`

- [ ] **Step 1: Add DASH config to server/config.js**

Add after the `WALL` export (after line 51):

```javascript
export const DASH = {
  speed: 30,
  duration: 250,
  cooldown: 2000,
  iframes: 150,
};
```

- [ ] **Step 2: Verify server starts**

Run: `cd /Users/rufflesrufus/projects/slaughterdome/server && node -e "import('./config.js').then(c => console.log('DASH:', c.DASH))"`
Expected: `DASH: { speed: 30, duration: 250, cooldown: 2000, iframes: 150 }`

- [ ] **Step 3: Commit**

```bash
git add server/config.js
git commit -m "feat: add dash config constants"
```

---

## Task 2: Dash Server Logic

**Files:**
- Modify: `server/game.js` (import DASH, modify updatePlayers, modify damagePlayer)

- [ ] **Step 1: Import DASH in game.js**

In `server/game.js` line 1, add `DASH` to the import:

```javascript
import {
  TICK_MS, TICK_RATE, ARENA_RADIUS, PLAYER, COMBO_DECAY_MS, COMBO_TIERS,
  PICKUP_DROP_BASE, PICKUP_DROP_COMBO_BONUS, PICKUP_DESPAWN_MS, PICKUPS,
  WAVE_REST_MS, SCALING, ENEMY_DEFS, WALL, DASH,
  ARENA_SHRINK_PER_WAVE, ARENA_MIN_RADIUS, ARENA_OUTSIDE_DPS,
  waveEnemyCount, enemyTypesForWave, scaleStat,
} from './config.js';
```

- [ ] **Step 2: Add dash processing in updatePlayers**

In `updatePlayers()` (line 61), add dash logic right after `if (!p.alive) continue;` (after line 63):

```javascript
    // Dash processing
    if (p.input.dash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      let ddx = p.input.dx, ddz = p.input.dz;
      const dlen = Math.sqrt(ddx * ddx + ddz * ddz);
      if (dlen > 0) { ddx /= dlen; ddz /= dlen; }
      else {
        // Fallback: dash toward aim direction
        const aDx = p.input.aimX - p.x, aDz = p.input.aimZ - p.z;
        const aLen = Math.sqrt(aDx * aDx + aDz * aDz) || 1;
        ddx = aDx / aLen; ddz = aDz / aLen;
      }
      p.dashDirX = ddx; p.dashDirZ = ddz;
      p.dashTimer = DASH.duration;
      p.dashCooldown = DASH.cooldown;
      p.dashIframes = DASH.iframes;
      p.input.dash = false;
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= TICK_MS;
      if (p.dashIframes > 0) p.dashIframes -= TICK_MS;
      p.x += p.dashDirX * DASH.speed * dt;
      p.z += p.dashDirZ * DASH.speed * dt;
    } else {
```

- [ ] **Step 3: Wrap existing movement in else block**

The existing movement code (lines 64-71) needs to be inside the `else` branch of `if (p.dashTimer > 0)`. After adding the dash block above, the existing movement becomes the else:

```javascript
    } else {
      const dx = p.input.dx;
      const dz = p.input.dz;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0) {
        const speed = p.buffs.speed > 0 ? PLAYER.speed * 1.5 : PLAYER.speed;
        p.x += (dx / len) * speed * dt;
        p.z += (dz / len) * speed * dt;
      }
    }
```

- [ ] **Step 4: Add dash cooldown decrement**

After the wall recharge timer block (after line 107), add:

```javascript
    if (p.dashCooldown > 0) p.dashCooldown -= TICK_MS;
```

- [ ] **Step 5: Add i-frame check to damagePlayer**

Modify `damagePlayer()` (line 189) to check i-frames:

```javascript
function damagePlayer(room, player, dmg) {
  if (!player.alive) return;
  if (player.dashIframes > 0) return; // i-frame immunity during dash
  const actual = player.buffs.shield > 0 ? Math.floor(dmg * 0.5) : dmg;
  player.hp -= actual;
  room.broadcast({ t: 'hit', target: player.id, dmg: actual, from: 'enemy' });
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false;
    room.broadcast({ t: 'death', pid: player.id });
  }
}
```

- [ ] **Step 6: Verify server starts without errors**

Run: `cd /Users/rufflesrufus/projects/slaughterdome/server && node -e "import('./game.js').then(() => console.log('OK'))"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add server/game.js
git commit -m "feat: server-side dash with i-frames"
```

---

## Task 3: Dash Player State in Room

**Files:**
- Modify: `server/room.js` (add dash fields to addPlayer, add to snapshot)

- [ ] **Step 1: Add dash fields to player state**

In `room.js addPlayer()` (line 29), add dash fields to the player object after `wallRechargeTimer: 0,`:

```javascript
      dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirZ: 0, dashIframes: 0,
```

- [ ] **Step 2: Add dash state to snapshot**

In `getStateSnapshot()` (line 70), add `dashing` and `dashCooldown` to player snapshot. Change the push (line 73) to:

```javascript
      players.push({
        id: p.id, name: p.name,
        pos: [Math.round(p.x * 100) / 100, 0, Math.round(p.z * 100) / 100],
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        buffs: Object.keys(p.buffs).filter(b => p.buffs[b] > 0),
        dashing: p.dashTimer > 0,
        dashCooldown: p.dashCooldown,
      });
```

- [ ] **Step 3: Commit**

```bash
git add server/room.js
git commit -m "feat: dash state in player model and snapshot"
```

---

## Task 4: Dash Client Input, Network, and Server Dispatch

**Files:**
- Modify: `src/input.js` (add shift key detection)
- Modify: `src/network.js` (forward dash in sendInput)
- Modify: `server/index.js` (read dash from message)

- [ ] **Step 1: Add dash trigger to input.js**

In `src/input.js`, add `dashTriggered` flag after `let wallTriggered = false;` (line 6):

```javascript
let dashTriggered = false;
```

In the keydown listener (line 12), add dash trigger:

```javascript
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE') wallTriggered = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dashTriggered = true;
});
```

In `getInput()` return (line 46), add dash field:

```javascript
  const dash = dashTriggered;
  dashTriggered = false;
  const wall = wallTriggered;
  wallTriggered = false;
  return { dx, dz, attack: mouse.left, special: mouse.right || keys['Space'], aimX: mouse.x, aimZ: mouse.z, wall, dash };
```

In `getMobileInput()` (line 99), add `dash: false`:

```javascript
export function getMobileInput() {
  return { dx: touchMove.dx, dz: touchMove.dz, attack: touchAttack, special: touchSpecial, aimX: 0, aimZ: 0, dash: false };
}
```

- [ ] **Step 2: Forward dash in network.js sendInput**

In `src/network.js sendInput()` (line 39), add `dash` to the message:

```javascript
export function sendInput(input) {
  if (!connected || !ws) return;
  ws.send(JSON.stringify({
    t: 'input',
    d: [input.dx, input.dz],
    a: input.attack ? 1 : 0,
    s: input.special ? 1 : 0,
    w: input.wall ? 1 : 0,
    dash: input.dash ? 1 : 0,
    aim: [input.aimX, 0, input.aimZ],
  }));
}
```

- [ ] **Step 3: Read dash on server**

In `server/index.js` input handler (line 37), add dash after line 44:

```javascript
      player.input.dash = !!msg.dash;
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/rufflesrufus/projects/slaughterdome/server && node -e "import('./index.js')" &` then kill it.
Expected: Server starts without import errors.

- [ ] **Step 5: Commit**

```bash
git add src/input.js src/network.js server/index.js
git commit -m "feat: dash input capture and network forwarding"
```

---

## Task 5: Dash Client Prediction and Visuals

**Files:**
- Modify: `src/main.js` (client-side dash prediction, visual triggers)
- Modify: `src/player.js` (dash squish animation)
- Modify: `index.html` (dash cooldown bar CSS)

- [ ] **Step 1: Add dash prediction state to main.js**

In `src/main.js`, add after `let hasPrediction = false;` (line 43):

```javascript
let predDashTimer = 0, predDashDirX = 0, predDashDirZ = 0;
const DASH_SPEED = 30;
const DASH_DURATION = 250;
```

- [ ] **Step 2: Add dash prediction logic**

In the client prediction block inside the game loop (around line 101, after `if (me && me.alive) {`), add dash prediction before normal movement. Replace the existing prediction block (lines 103-117) with:

```javascript
        if (!hasPrediction) {
          predictedX = me.pos[0];
          predictedZ = me.pos[2];
          hasPrediction = true;
        }

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
        }

        if (predDashTimer > 0) {
          predDashTimer -= dtMs;
          predictedX += predDashDirX * DASH_SPEED * dt;
          predictedZ += predDashDirZ * DASH_SPEED * dt;
        } else if (input.dx !== 0 || input.dz !== 0) {
          const speed = (me.buffs && me.buffs.includes('speed')) ? PREDICTED_SPEED * 1.5 : PREDICTED_SPEED;
          predictedX += input.dx * speed * dt;
          predictedZ += input.dz * speed * dt;
        }
        const pDist = Math.sqrt(predictedX * predictedX + predictedZ * predictedZ);
        if (pDist > currentArenaRadius - 1) {
          const s = (currentArenaRadius - 1) / pDist;
          predictedX *= s;
          predictedZ *= s;
        }
```

- [ ] **Step 3: Sync dash timer with server state**

In `processState()` where local player is corrected (around line 190), add after prediction correction:

```javascript
      // Sync dash state from server
      if (!p.dashing && predDashTimer > 0) predDashTimer = 0;
```

- [ ] **Step 4: Add dash squish to player.js**

In `src/player.js`, export a new function after `setPlayerRotation` (line 76):

```javascript
export function setPlayerDashing(id, dashing) {
  const pm = playerMeshes.get(id);
  if (!pm) return;
  if (dashing) {
    pm.group.scale.set(0.8, 1.2, 1.0);
  } else {
    pm.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.3);
  }
}
```

- [ ] **Step 5: Call dash visual from main.js**

In `src/main.js`, add import for `setPlayerDashing`:

Update the import line (line 3) to include it:
```javascript
import { createPlayerMesh, updatePlayerMesh, setPlayerRotation, removePlayerMesh, markLocalPlayer, setPlayerDashing } from './player.js';
```

In `processState()`, after the local player update block (after `setPlayerRotation`), add:

```javascript
      setPlayerDashing(p.id, p.id === myId ? predDashTimer > 0 : p.dashing);
```

- [ ] **Step 6: Add dash cooldown HUD to index.html**

In `index.html`, add after the hp-bar div (after line 46):

```html
    <div id="dash-bar" style="width:200px;height:3px;background:#222;border-radius:2px;margin-top:4px;"><div id="dash-fill" style="height:100%;width:100%;background:#e6993a;border-radius:2px;transition:width 0.1s;"></div></div>
```

- [ ] **Step 7: Update dash bar in main.js processState**

In `src/main.js processState()`, after `updateHUD()` call (around line 272), add:

```javascript
  if (me) {
    const dashPct = me.dashCooldown > 0 ? Math.max(0, 1 - me.dashCooldown / 2000) * 100 : 100;
    const dashFill = document.getElementById('dash-fill');
    if (dashFill) dashFill.style.width = dashPct + '%';
  }
```

- [ ] **Step 8: Reset dash state on game start**

In `startGame()` (around line 62), add after `hasPrediction = false;`:

```javascript
    predDashTimer = 0;
```

- [ ] **Step 9: Verify manually**

Restart server and refresh browser. Press Shift while moving -- player should dash in movement direction at 3x speed. Dash cooldown bar should drain and refill. Dashing through enemies should not take damage during first 150ms.

- [ ] **Step 10: Commit**

```bash
git add src/main.js src/player.js index.html
git commit -m "feat: client-side dash prediction, squish animation, cooldown HUD"
```

---

## Task 6: Camera Look-Ahead

**Files:**
- Modify: `src/renderer.js` (updateCamera signature and logic)
- Modify: `src/main.js` (pass aim coords to updateCamera)

- [ ] **Step 1: Modify updateCamera in renderer.js**

Replace `updateCamera` (lines 87-102) with:

```javascript
export function updateCamera(targetX, targetZ, aimX, aimZ) {
  // Look-ahead: blend target 30% toward aim, max 5 units offset
  if (aimX !== undefined && aimZ !== undefined) {
    const lookX = (aimX - targetX) * 0.3;
    const lookZ = (aimZ - targetZ) * 0.3;
    const lookDist = Math.sqrt(lookX * lookX + lookZ * lookZ);
    const maxOff = 5;
    const s = lookDist > maxOff ? maxOff / lookDist : 1;
    targetX += lookX * s;
    targetZ += lookZ * s;
  }
  const t = 1 - Math.exp(-12 * lastCamDt);
  const tz = targetZ + CAMERA_HEIGHT * Math.cos(CAMERA_ANGLE);
  camera.position.x += (targetX - camera.position.x) * t;
  camera.position.z += (tz - camera.position.z) * t;
  camera.lookAt(targetX, 0, targetZ);

  if (shakeIntensity > 0.1) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.3;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.82;
  } else {
    shakeIntensity = 0;
  }
}
```

- [ ] **Step 2: Update all updateCamera calls in main.js**

In `src/main.js`, there are 3 calls to `updateCamera`. Update each:

1. Hitstop block (around line 86):
```javascript
      if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
```

2. Main camera update (around line 157):
```javascript
    if (me) updateCamera(hasPrediction ? predictedX : me.pos[0], hasPrediction ? predictedZ : me.pos[2], lastInput.aimX, lastInput.aimZ);
```

3. Fallback when no player (around line 159):
```javascript
    updateCamera(0, 0);
```
This one stays the same (no aim data = no offset, which is correct).

- [ ] **Step 3: Verify manually**

Refresh browser. Move mouse to screen edges -- camera should shift slightly toward aim direction, giving more visibility ahead.

- [ ] **Step 4: Commit**

```bash
git add src/renderer.js src/main.js
git commit -m "feat: camera look-ahead toward aim direction"
```

---

## Task 7: Camera Kick on Shoot

**Files:**
- Modify: `src/renderer.js` (add cam kick state and function)
- Modify: `src/main.js` (trigger kick on shoot)

- [ ] **Step 1: Add camera kick to renderer.js**

In `src/renderer.js`, add after `let hitstopRemaining = 0;` (line 10):

```javascript
let camKickX = 0, camKickZ = 0;
```

Add new export after `startHitstop`:

```javascript
export function triggerCamKick(aimAngle) {
  camKickX = -Math.cos(aimAngle) * 1.5;
  camKickZ = -Math.sin(aimAngle) * 1.5;
}
```

In `updateCamera()`, add kick offset after the look-ahead logic but before shake. Insert before the `if (shakeIntensity > 0.1)` block:

```javascript
  camera.position.x += camKickX;
  camera.position.z += camKickZ;
  camKickX *= 0.7;
  camKickZ *= 0.7;
  if (Math.abs(camKickX) < 0.01) camKickX = 0;
  if (Math.abs(camKickZ) < 0.01) camKickZ = 0;
```

- [ ] **Step 2: Import and trigger kick from main.js**

In `src/main.js`, update the renderer import (line 1) to include `triggerCamKick`:

```javascript
import { initRenderer, render, clock, updateCamera, setCamDt, triggerShake, startHitstop, tickHitstop, triggerCamKick } from './renderer.js';
```

In the gun shot visual block (around line 123, where `showGunShot` is called), add after `showGunShot`:

```javascript
          triggerCamKick(angle);
```

- [ ] **Step 3: Verify manually**

Refresh browser. Click to shoot -- camera should kick back slightly opposite the aim direction. Fast firing should stack kicks.

- [ ] **Step 4: Commit**

```bash
git add src/renderer.js src/main.js
git commit -m "feat: camera kick on shoot for weapon feedback"
```

---

## Task 8: Deceleration Curve and Movement Particles

**Files:**
- Modify: `src/main.js` (velocity-based prediction, particle triggers)
- Modify: `src/particles.js` (new dust puff and speed trail functions)

- [ ] **Step 1: Add dust puff and speed trail to particles.js**

In `src/particles.js`, add after `spawnBloodDrops` (after line 82):

```javascript
export function spawnDustPuff(x, z) {
  const dustGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < 5 && particles.length < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x997755, transparent: true });
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 1.5;
    scene.add(mesh);
    particles.push({
      mesh, mat,
      vx: Math.cos(angle) * speed, vy: 0.5 + Math.random(), vz: Math.sin(angle) * speed,
      life: 0.25, decay: 4, isSpark: true,
    });
  }
}

export function spawnSpeedTrail(x, z, color) {
  if (particles.length >= MAX_PARTICLES) return;
  const trailGeo = new THREE.BoxGeometry(0.15, 0.05, 0.15);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(trailGeo, mat);
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0.3, decay: 3.3, isSpark: true });
}
```

- [ ] **Step 2: Add velocity-based prediction and particle triggers to main.js**

In `src/main.js`, add imports for the new particle functions. Update the particles import (line 6):

```javascript
import { updateParticles, spawnKillParticles, spawnSparks, spawnBloodDrops, spawnNeonPop, spawnDustPuff, spawnSpeedTrail } from './particles.js';
```

Add prediction velocity state after the dash prediction vars:

```javascript
let predVelX = 0, predVelZ = 0;
let prevInputDx = 0, prevInputDz = 0;
let speedTrailCounter = 0;
```

Replace the prediction movement block (the non-dash movement part) in the game loop. Where we have `} else if (input.dx !== 0 || input.dz !== 0) {`, replace with:

```javascript
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
```

After the arena clamping block, add particle triggers:

```javascript
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
```

- [ ] **Step 3: Spawn dust puff on dash start**

In the dash prediction trigger block (where `predDashTimer = DASH_DURATION` is set), add:

```javascript
          spawnDustPuff(predictedX, predictedZ);
```

- [ ] **Step 4: Verify manually**

Refresh browser. Move and quickly change direction -- small brown dust particles should appear. Pick up speed buff -- yellow trail should appear behind player. Dash -- blue trail and dust burst at origin.

Release all movement keys -- player should slide briefly before stopping (deceleration).

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/particles.js
git commit -m "feat: deceleration curve, dust puffs, speed trails"
```

---

## Task 9: Upgrade Shop Config

**Files:**
- Modify: `server/config.js` (WAVE_REST_MS, UPGRADE_DEFS, UPGRADE_TIER_WEIGHTS, WEAPONS)

- [ ] **Step 1: Update WAVE_REST_MS and add upgrade/weapon configs**

In `server/config.js`, change `WAVE_REST_MS` from 5000 to 10000 (line 6):

```javascript
export const WAVE_REST_MS = 10000;
```

Add after the `SCALING` export (after line 74):

```javascript
export const UPGRADE_DEFS = {
  fire_rate:     { name: 'RAPID FIRE',    desc: '-15% shoot cooldown',         tier: 'common',  category: 'weapon' },
  bullet_size:   { name: 'BIG ROUNDS',    desc: '+30% bullet hit radius',      tier: 'common',  category: 'weapon' },
  pierce:        { name: 'PIERCE',        desc: 'Bullets pass through +1',     tier: 'rare',    category: 'weapon' },
  crit_chance:   { name: 'PRECISION',     desc: '+5% crit chance',             tier: 'common',  category: 'weapon' },
  crit_damage:   { name: 'DEVASTATION',   desc: '+0.5x crit multiplier',      tier: 'rare',    category: 'weapon' },
  move_speed:    { name: 'SWIFT',         desc: '+1 movement speed',           tier: 'common',  category: 'movement' },
  dash_cooldown: { name: 'QUICK DASH',    desc: '-300ms dash cooldown',        tier: 'rare',    category: 'movement' },
  dash_distance: { name: 'LONG DASH',     desc: '+20% dash speed',             tier: 'common',  category: 'movement' },
  max_hp:        { name: 'VITALITY',      desc: '+20 max HP',                  tier: 'common',  category: 'defense' },
  wall_hp:       { name: 'FORTIFY',       desc: '+30 wall HP',                 tier: 'common',  category: 'defense' },
  thorns:        { name: 'THORNS',        desc: '5 contact dmg to enemies',    tier: 'rare',    category: 'defense' },
  lifesteal:     { name: 'VAMPIRISM',     desc: 'Heal 3% of damage dealt',     tier: 'epic',    category: 'passive' },
  magnet:        { name: 'MAGNET',        desc: '+3 pickup attract range',     tier: 'common',  category: 'passive' },
  combo_decay:   { name: 'MOMENTUM',      desc: '+500ms combo decay time',     tier: 'rare',    category: 'passive' },
  shotgun:       { name: 'SHOTGUN',       desc: '5-bullet spread, slower',     tier: 'epic',    category: 'weapon_swap' },
  railgun:       { name: 'RAILGUN',       desc: 'Piercing beam, slow fire',    tier: 'epic',    category: 'weapon_swap' },
  flamethrower:  { name: 'FLAMETHROWER',  desc: 'Short range spray, fast',     tier: 'epic',    category: 'weapon_swap' },
};

export const UPGRADE_TIER_WEIGHTS = {
  common: { base: 0.65, perComboTier: -0.05 },
  rare:   { base: 0.28, perComboTier: 0.03 },
  epic:   { base: 0.07, perComboTier: 0.02 },
};

export const WEAPONS = {
  pistol:       { bullets: 1, spread: 0,   cooldown: 150, damageMult: 1.0, speed: 35, pierce: 0, range: 3000 },
  shotgun:      { bullets: 5, spread: 0.3, cooldown: 400, damageMult: 0.7, speed: 25, pierce: 0, range: 1500 },
  railgun:      { bullets: 1, spread: 0,   cooldown: 800, damageMult: 3.0, speed: 50, pierce: 999, range: 3000 },
  flamethrower: { bullets: 3, spread: 0.4, cooldown: 80,  damageMult: 0.3, speed: 15, pierce: 0, range: 500 },
};
```

- [ ] **Step 2: Verify config loads**

Run: `cd /Users/rufflesrufus/projects/slaughterdome/server && node -e "import('./config.js').then(c => console.log(Object.keys(c.UPGRADE_DEFS).length + ' upgrades, ' + Object.keys(c.WEAPONS).length + ' weapons'))"`
Expected: `17 upgrades, 4 weapons`

- [ ] **Step 3: Commit**

```bash
git add server/config.js
git commit -m "feat: upgrade definitions, weapon configs, tier weights"
```

---

## Task 10: Upgrade Shop Server Logic, Client UI, and Network

**Files:**
- Modify: `server/game.js` (generate upgrades on wave clear, applyUpgrade function)
- Modify: `server/room.js` (player state, snapshot)
- Modify: `server/index.js` (pick_upgrade message handler)
- Modify: `src/network.js` (sendUpgradePick, forward events)
- Modify: `src/main.js` (handle upgrade events, show/hide shop)
- Modify: `src/ui.js` (upgrade strip display)
- Create: `src/upgrades.js` (shop UI)
- Modify: `index.html` (shop container, CSS)

This is the largest task. It wires up the entire upgrade shop system.

- [ ] **Step 1: Add upgrade state to room.js player**

In `server/room.js addPlayer()`, add after the dash fields:

```javascript
      upgrades: {}, weapon: 'pistol', pendingUpgrades: null,
```

Add upgrade and weapon fields to `getStateSnapshot()` player push:

```javascript
      players.push({
        id: p.id, name: p.name,
        pos: [Math.round(p.x * 100) / 100, 0, Math.round(p.z * 100) / 100],
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        buffs: Object.keys(p.buffs).filter(b => p.buffs[b] > 0),
        dashing: p.dashTimer > 0,
        dashCooldown: p.dashCooldown,
        upgrades: p.upgrades,
        weapon: p.weapon,
      });
```

- [ ] **Step 2: Add upgrade generation and application to game.js**

Import the new configs in `server/game.js` (update the import line):

```javascript
import {
  TICK_MS, TICK_RATE, ARENA_RADIUS, PLAYER, COMBO_DECAY_MS, COMBO_TIERS,
  PICKUP_DROP_BASE, PICKUP_DROP_COMBO_BONUS, PICKUP_DESPAWN_MS, PICKUPS,
  WAVE_REST_MS, SCALING, ENEMY_DEFS, WALL, DASH,
  ARENA_SHRINK_PER_WAVE, ARENA_MIN_RADIUS, ARENA_OUTSIDE_DPS,
  waveEnemyCount, enemyTypesForWave, scaleStat,
  UPGRADE_DEFS, UPGRADE_TIER_WEIGHTS, WEAPONS,
} from './config.js';
```

Add new functions at the end of the file (before the last closing brace or at the bottom):

```javascript
function generateUpgrades(comboTier) {
  const keys = Object.keys(UPGRADE_DEFS);
  const weights = {};
  for (const key of keys) {
    const tier = UPGRADE_DEFS[key].tier;
    const w = UPGRADE_TIER_WEIGHTS[tier];
    weights[key] = Math.max(0.01, w.base + w.perComboTier * comboTier);
  }
  const chosen = [];
  const available = [...keys];
  for (let i = 0; i < 3 && available.length > 0; i++) {
    const totalWeight = available.reduce((sum, k) => sum + weights[k], 0);
    let roll = Math.random() * totalWeight;
    let pick = available[0];
    for (const k of available) {
      roll -= weights[k];
      if (roll <= 0) { pick = k; break; }
    }
    chosen.push(pick);
    available.splice(available.indexOf(pick), 1);
  }
  return chosen.map(key => ({ key, ...UPGRADE_DEFS[key] }));
}

export function applyUpgrade(player, upgradeKey) {
  const def = UPGRADE_DEFS[upgradeKey];
  if (!def) return;
  if (def.category === 'weapon_swap') {
    player.weapon = upgradeKey;
  } else {
    player.upgrades[upgradeKey] = (player.upgrades[upgradeKey] || 0) + 1;
  }
  // Immediate effects
  if (upgradeKey === 'max_hp') {
    player.maxHp = PLAYER.hp + (player.upgrades.max_hp || 0) * 20;
    player.hp = Math.min(player.hp + 20, player.maxHp);
  }
}
```

- [ ] **Step 3: Send upgrades on wave clear**

Modify `checkWaveClear()` to generate and send upgrades. Replace the function:

```javascript
function checkWaveClear(room) {
  if (room.state !== 'combat' || room.enemies.size > 0) return;
  room.score += room.wave * 25;
  for (const [, p] of room.players) {
    if (!p.alive) {
      p.alive = true; p.hp = Math.floor(p.maxHp * 0.5); p.x = 0; p.z = 0;
      room.broadcast({ t: 'respawn', pid: p.id, hp: p.hp });
    }
  }
  // Generate upgrade options for each player
  const comboTier = getComboTier(room.combo);
  const tierNum = comboTier ? COMBO_TIERS.indexOf(comboTier) : 0;
  for (const [, p] of room.players) {
    const options = generateUpgrades(tierNum);
    p.pendingUpgrades = options;
    room.sendTo(p.id, { t: 'upgrades', options });
  }
  room.state = 'countdown';
  room.waveTimer = WAVE_REST_MS;
}
```

- [ ] **Step 4: Auto-pick on wave timer expire**

In `tickRoom()`, in the countdown state (around line 38), before transitioning to combat, auto-pick for players who haven't chosen:

```javascript
  if (room.state === 'countdown') {
    room.waveTimer -= TICK_MS;
    if (room.waveTimer <= 0) {
      // Auto-pick first upgrade for players who didn't choose
      for (const [, p] of room.players) {
        if (p.pendingUpgrades && p.pendingUpgrades.length > 0) {
          applyUpgrade(p, p.pendingUpgrades[0].key);
          p.pendingUpgrades = null;
        }
      }
      room.wave++;
      spawnWave(room);
      room.state = 'combat';
      room.broadcast({ t: 'wave', n: room.wave, count: room.enemies.size });
    }
    room.broadcast(room.getStateSnapshot());
    return;
  }
```

- [ ] **Step 5: Handle pick_upgrade in server/index.js**

In `server/index.js`, import `applyUpgrade`:

```javascript
import { startGameLoop, applyUpgrade } from './game.js';
```

Add new message handler after the ping handler (after line 49):

```javascript
    if (msg.t === 'pick_upgrade' && player) {
      const idx = Number(msg.index);
      if (player.pendingUpgrades && idx >= 0 && idx < player.pendingUpgrades.length) {
        applyUpgrade(player, player.pendingUpgrades[idx].key);
        player.pendingUpgrades = null;
      }
    }
```

- [ ] **Step 6: Add sendUpgradePick to network.js**

In `src/network.js`, add new export:

```javascript
export function sendUpgradePick(index) {
  if (!connected || !ws) return;
  ws.send(JSON.stringify({ t: 'pick_upgrade', index }));
}
```

Also update `onmessage` handler to forward `upgrades` events to the event queue. In the `ws.onmessage` handler, the `else` block (line 31) already pushes non-state messages to `eventQueue`. The `upgrades` message will automatically be queued. No change needed here.

- [ ] **Step 7: Create src/upgrades.js**

```javascript
import { sendUpgradePick } from './network.js';

const TIER_COLORS = { common: '#888888', rare: '#4488ff', epic: '#e6993a' };
let shopEl = null;
let keyHandler = null;

export function showUpgradeShop(options) {
  hideUpgradeShop();
  shopEl = document.getElementById('upgrade-shop');
  if (!shopEl) return;
  shopEl.innerHTML = '';
  shopEl.style.display = 'flex';

  options.forEach((opt, i) => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.style.borderColor = TIER_COLORS[opt.tier] || '#888';
    card.innerHTML =
      '<div class="upgrade-tier" style="color:' + (TIER_COLORS[opt.tier] || '#888') + '">' + opt.tier.toUpperCase() + '</div>' +
      '<div class="upgrade-name">' + opt.name + '</div>' +
      '<div class="upgrade-desc">' + opt.desc + '</div>' +
      '<div class="upgrade-key">[' + (i + 1) + ']</div>';
    card.addEventListener('click', () => pick(i));
    shopEl.appendChild(card);
  });

  keyHandler = (e) => {
    if (e.code === 'Digit1' || e.code === 'Numpad1') pick(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') pick(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') pick(2);
  };
  document.addEventListener('keydown', keyHandler);
}

function pick(index) {
  sendUpgradePick(index);
  hideUpgradeShop();
}

export function hideUpgradeShop() {
  if (shopEl) { shopEl.style.display = 'none'; shopEl.innerHTML = ''; }
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
}
```

- [ ] **Step 8: Add shop HTML and CSS to index.html**

In `index.html`, add after the `#ping` div (after line 56):

```html
  <div id="upgrade-shop" style="display:none;"></div>
  <div id="upgrade-strip"></div>
```

Add CSS before `</style>` (line 31):

```css
  #upgrade-shop { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); display:flex; gap:16px; z-index:50; }
  .upgrade-card { background:#1a1a1a; border:2px solid #888; border-radius:4px; padding:16px 20px; width:180px; cursor:pointer; text-align:center; font-family:'Courier New',monospace; transition:transform 0.1s,border-color 0.1s; }
  .upgrade-card:hover { transform:scale(1.05); border-color:#fff; }
  .upgrade-tier { font-size:10px; letter-spacing:2px; margin-bottom:6px; }
  .upgrade-name { color:#fff; font-size:16px; font-weight:bold; margin-bottom:8px; }
  .upgrade-desc { color:#aaa; font-size:12px; margin-bottom:10px; }
  .upgrade-key { color:#555; font-size:11px; }
  #upgrade-strip { position:absolute; bottom:38px; left:50%; transform:translateX(-50%); color:#e6993a; font-size:11px; font-family:'Courier New',monospace; letter-spacing:1px; text-align:center; }
```

- [ ] **Step 9: Wire upgrade events in main.js**

In `src/main.js`, add imports:

```javascript
import { showUpgradeShop, hideUpgradeShop } from './upgrades.js';
```

In `handleEvent()`, add cases:

```javascript
    case 'upgrades':
      showUpgradeShop(ev.options);
      break;
    case 'wave':
      hideUpgradeShop();
      playWaveStart();
      // ...existing wave code
```

Move the existing wave case code to keep its existing logic but add `hideUpgradeShop()` at the start.

- [ ] **Step 10: Add upgrade strip display to ui.js**

In `src/ui.js`, add:

```javascript
const upgradeStrip = document.getElementById('upgrade-strip');

export function updateUpgradeDisplay(upgrades) {
  if (!upgradeStrip || !upgrades) return;
  const parts = [];
  for (const [key, count] of Object.entries(upgrades)) {
    const short = key.slice(0, 4).toUpperCase();
    parts.push(short + '+' + count);
  }
  upgradeStrip.textContent = parts.join(' ');
}
```

In `src/main.js processState()`, import and call `updateUpgradeDisplay`:

Update ui.js import to include it:
```javascript
import { showTitle, showHUD, showGameOver, updateHUD, showCombo, updatePing, getPlayerName, updateUpgradeDisplay } from './ui.js';
```

After the `updateHUD` call:
```javascript
  if (me) updateUpgradeDisplay(me.upgrades);
```

- [ ] **Step 11: Hide shop on game over and game start**

In `handleEvent()` gameover case, add:
```javascript
      hideUpgradeShop();
```

In `startGame()`, add:
```javascript
    hideUpgradeShop();
```

- [ ] **Step 12: Verify manually**

Restart server and refresh browser. Play through wave 1 -- on wave clear, 3 upgrade cards should appear. Click one or press 1/2/3. Card disappears. Upgrade strip shows below HP bar. If you don't pick, first option auto-applies after countdown.

- [ ] **Step 13: Commit**

```bash
git add server/config.js server/game.js server/room.js server/index.js src/network.js src/upgrades.js src/main.js src/ui.js index.html
git commit -m "feat: between-wave upgrade shop with tier-weighted selection"
```

---

## Task 11: Passive Upgrade Effects

**Files:**
- Modify: `server/game.js` (lifesteal, magnet, thorns, combo_decay, move_speed, dash modifiers, wall_hp, shield_duration, crit upgrades)

- [ ] **Step 1: Apply move_speed upgrade in updatePlayers**

In `server/game.js updatePlayers()`, in the normal movement block, replace the speed calculation:

```javascript
        const baseSpeed = PLAYER.speed + (p.upgrades.move_speed || 0);
        const speed = p.buffs.speed > 0 ? baseSpeed * 1.5 : baseSpeed;
```

- [ ] **Step 2: Apply dash upgrades**

In the dash trigger block in `updatePlayers()`, when setting cooldown:

```javascript
      p.dashCooldown = Math.max(800, DASH.cooldown - (p.upgrades.dash_cooldown || 0) * 300);
```

In the dash movement block:

```javascript
      const dashSpeed = DASH.speed * (1 + (p.upgrades.dash_distance || 0) * 0.2);
      p.x += p.dashDirX * dashSpeed * dt;
      p.z += p.dashDirZ * dashSpeed * dt;
```

- [ ] **Step 3: Apply magnet in updatePlayers**

In `updatePlayers()`, replace the pickup collection loop (lines 113-120) with:

```javascript
    const magnetRange = 1.5 + (p.upgrades.magnet || 0) * 3;
    const magnetRangeSq = magnetRange * magnetRange;
    for (const [pkId, pk] of room.pickups) {
      const pdx = pk.x - p.x;
      const pdz = pk.z - p.z;
      const distSq = pdx * pdx + pdz * pdz;
      if (distSq < magnetRangeSq && distSq > 2.25) {
        const dist = Math.sqrt(distSq);
        pk.x -= (pdx / dist) * 8 * dt;
        pk.z -= (pdz / dist) * 8 * dt;
      }
      if (distSq < 2.25) {
        applyPickup(p, pk);
        room.pickups.delete(pkId);
      }
    }
```

- [ ] **Step 4: Apply lifesteal in damageEnemy**

In `damageEnemy()`, after `room.broadcast({ t: 'hit', ... })` and before the killEnemy check:

```javascript
  if (player && player.upgrades.lifesteal) {
    const heal = Math.floor(dmg * 0.03 * player.upgrades.lifesteal);
    if (heal > 0) player.hp = Math.min(player.hp + heal, player.maxHp);
  }
```

- [ ] **Step 5: Apply thorns in enemy melee attacks**

In `updateEnemies()`, in the grunt/brute/bomber/shielder melee block (around line 224-225, where `damagePlayer(room, target, e.damage)` is called), add after the damagePlayer call:

```javascript
          if (target.upgrades && target.upgrades.thorns) {
            const thornsDmg = 5 * target.upgrades.thorns;
            damageEnemy(room, e, thornsDmg, target, false);
          }
```

Do the same in the swarm melee block (around line 283-284):

```javascript
          if (target.upgrades && target.upgrades.thorns) {
            damageEnemy(room, e, 5 * target.upgrades.thorns, target, false);
          }
```

And for the dasher charge damage (around line 258):

```javascript
            if (p.upgrades && p.upgrades.thorns) {
              damageEnemy(room, e, 5 * p.upgrades.thorns, p, false);
            }
```

- [ ] **Step 6: Apply combo_decay**

Replace `updateCombo()`:

```javascript
function updateCombo(room) {
  if (room.combo > 0) {
    const maxDecayStacks = Math.max(0, ...[...room.players.values()]
      .filter(p => p.alive)
      .map(p => p.upgrades.combo_decay || 0));
    const decayTime = COMBO_DECAY_MS + maxDecayStacks * 500;
    room.comboTimer -= TICK_MS;
    if (room.comboTimer <= 0) room.combo = 0;
    // Reset timer uses extended decay time
    if (room.comboTimer > decayTime) room.comboTimer = decayTime;
  }
}
```

Update `killEnemy()` combo timer set to respect the upgrade:

```javascript
  const maxDecayStacks = Math.max(0, ...[...room.players.values()]
    .filter(p => p.alive)
    .map(p => p.upgrades.combo_decay || 0));
  room.comboTimer = COMBO_DECAY_MS + maxDecayStacks * 500;
```

- [ ] **Step 7: Apply shield_duration in applyPickup**

Modify the shield case in `applyPickup()`:

```javascript
    case 'shield': player.buffs.shield = 6000 + (player.upgrades.shield_duration || 0) * 2000; break;
```

- [ ] **Step 8: Apply wall_hp upgrade in wall spawn**

Modify `spawnWall()` to accept a player parameter and use wall_hp:

```javascript
function spawnWall(room, x, z, angle, player) {
  const id = 'w' + nextWallId++;
  const wallHp = WALL.hp + ((player && player.upgrades.wall_hp) || 0) * 30;
  room.walls.set(id, { id, x, z, angle, hp: wallHp, maxHp: wallHp, age: 0 });
}
```

Update the call site in `updatePlayers()` to pass the player:

```javascript
      spawnWall(room, p.x + Math.cos(aimAngle) * 2.5, p.z + Math.sin(aimAngle) * 2.5, aimAngle + Math.PI / 2, p);
```

- [ ] **Step 9: Verify manually**

Restart server. Play through a few waves, picking different upgrades. Verify:
- SWIFT: player moves faster
- QUICK DASH: dash cooldown is shorter
- MAGNET: pickups get attracted from further away
- THORNS: enemies that hit you take damage
- VAMPIRISM: HP increases when dealing damage (visible on HP bar)

- [ ] **Step 10: Commit**

```bash
git add server/game.js
git commit -m "feat: all passive upgrade effects (15 upgrades)"
```

---

## Task 12: Weapon Variety Server Logic

**Files:**
- Modify: `server/game.js` (rewrite playerShoot, update projectile handling)

- [ ] **Step 1: Rewrite playerShoot with weapon system**

Replace `playerShoot()`:

```javascript
function playerShoot(room, player, aimAngle) {
  const wep = WEAPONS[player.weapon || 'pistol'];
  const cooldown = Math.max(50, wep.cooldown * Math.pow(0.85, player.upgrades.fire_rate || 0));
  player.shootCooldown = cooldown;
  const baseDmg = pDamage(player);
  const dmg = Math.floor(baseDmg * wep.damageMult);
  const pierceCount = wep.pierce + (player.upgrades.pierce || 0);
  for (let i = 0; i < wep.bullets; i++) {
    const spreadAngle = aimAngle + (i - (wep.bullets - 1) / 2) * wep.spread;
    const vx = Math.cos(spreadAngle) * wep.speed;
    const vz = Math.sin(spreadAngle) * wep.speed;
    const sx = player.x + Math.cos(spreadAngle) * 0.8;
    const sz = player.z + Math.sin(spreadAngle) * 0.8;
    const id = 'pr' + nextProjectileId++;
    room.projectiles.set(id, {
      id, x: sx, z: sz, vx, vz, type: 'bullet', damage: dmg,
      age: 0, owner: player.id, pierce: pierceCount, maxAge: wep.range, hitSet: new Set(),
    });
  }
}
```

Also update the shoot cooldown check in `updatePlayers()`. The current code sets `p.shootCooldown = PLAYER.shootCooldown` (line 86). Remove that line since `playerShoot` now sets the cooldown:

Change:
```javascript
    if (p.input.attack && p.shootCooldown <= 0) {
      p.shootCooldown = PLAYER.shootCooldown;
      const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
      playerShoot(room, p, aimAngle);
    }
```
To:
```javascript
    if (p.input.attack && p.shootCooldown <= 0) {
      const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
      playerShoot(room, p, aimAngle);
    }
```

- [ ] **Step 2: Update projectile collision for pierce and bullet_size**

Replace the bullet collision in `updateProjectiles()` (the `if (pr.type === 'bullet')` block):

```javascript
    if (pr.type === 'bullet') {
      const hitRadius = 1.2 * (1 + 0.3 * ((pr.owner && room.players.get(pr.owner)?.upgrades?.bullet_size) || 0));
      for (const [, e] of room.enemies) {
        if (pr.hitSet && pr.hitSet.has(e.id)) continue;
        const dx = e.x - pr.x; const dz = e.z - pr.z;
        if (dx * dx + dz * dz < hitRadius * hitRadius) {
          const player = room.players.get(pr.owner);
          if (player) {
            const crit = Math.random() < (PLAYER.critChance + (player.upgrades.crit_chance || 0) * 0.05);
            const critMult = PLAYER.critMultiplier + (player.upgrades.crit_damage || 0) * 0.5;
            const dmg = Math.floor(pr.damage * (crit ? critMult : 1));
            damageEnemy(room, e, dmg, player, crit);
          }
          if (pr.pierce > 0) {
            pr.pierce--;
            if (pr.hitSet) pr.hitSet.add(e.id);
          } else {
            room.projectiles.delete(id); break;
          }
        }
      }
    }
```

- [ ] **Step 3: Use maxAge for projectile lifetime**

Change the projectile age check (line 327) from hardcoded 3000:

```javascript
    if (pr.age > (pr.maxAge || 3000) || Math.sqrt(pr.x * pr.x + pr.z * pr.z) > ARENA_RADIUS + 5) {
```

- [ ] **Step 4: Remove old spawnProjectile call from playerShoot**

The old `spawnProjectile()` function can remain for enemy projectiles (spitter), but `playerShoot` now creates projectiles directly. No need to change `spawnProjectile` -- it's still used by enemy spitter code.

- [ ] **Step 5: Verify manually**

Restart server. Play default pistol (should work exactly as before). Pick up SHOTGUN from upgrade shop -- should fire 5 bullets in a spread. Pick RAILGUN -- should fire slow, piercing shots.

- [ ] **Step 6: Commit**

```bash
git add server/game.js
git commit -m "feat: weapon variety with pierce, spread, and per-weapon stats"
```

---

## Task 13: Weapon Visuals and Audio

**Files:**
- Modify: `src/combat.js` (weapon-specific shot visuals)
- Modify: `src/audio.js` (weapon-specific sounds)
- Modify: `src/main.js` (pass weapon type to visuals)

- [ ] **Step 1: Add weapon type to showGunShot**

Replace `showGunShot` in `src/combat.js`:

```javascript
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
    beam.rotation.set(Math.PI / 2, 0, -angle);
    scene.add(beam);
    effects.push({ mesh: beam, mat: beamMat, life: 0.2, maxLife: 0.2 });
    // Bright origin flash
    const flashGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0x88eeff, transparent: true, opacity: 1 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(fx, 1.2, fz);
    scene.add(flash);
    effects.push({ mesh: flash, mat: flashMat, life: 0.08, maxLife: 0.08 });
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
```

- [ ] **Step 2: Add weapon sounds to audio.js**

In `src/audio.js`, replace `playHit` and add weapon-specific shot sounds:

```javascript
export function playShot(weaponType) {
  switch (weaponType) {
    case 'shotgun': noise(0.08, 400, 'lowpass'); noise(0.04, 1200); break;
    case 'railgun': tone(2000, 0.06, 0.15); tone(3000, 0.03, 0.1); break;
    case 'flamethrower': noise(0.03, 600, 'bandpass'); break;
    default: noise(0.04, 1000); break;
  }
}
```

- [ ] **Step 3: Pass weapon type from main.js**

In `src/main.js`, update the audio import to include `playShot`:

```javascript
import { playHit, playKill, playExplosion, playWaveStart, playBossSpawn, playPickup, playDeath, playCombo, resumeAudio, playShot } from './audio.js';
```

In the gun shot visual block, get weapon type from player state and pass it:

```javascript
        if (input.attack && now - lastAttackTime > 150) {
          const weaponType = me.weapon || 'pistol';
          const wepCooldowns = { pistol: 150, shotgun: 400, railgun: 800, flamethrower: 80 };
          const cooldown = wepCooldowns[weaponType] || 150;
          if (now - lastAttackTime > cooldown) {
            lastAttackTime = now;
            const angle = Math.atan2(input.aimZ - pz, input.aimX - px);
            showGunShot(px, pz, angle, weaponType);
            playShot(weaponType);
            triggerCamKick(angle);
          }
        }
```

Replace the old attack block (remove the duplicate `if (input.attack && now - lastAttackTime > 150)` check).

- [ ] **Step 4: Verify manually**

Restart server. Play through waves, pick up different weapons from the shop. Shotgun should have wide flash + spread sparks. Railgun should show cyan beam. Flamethrower should spray fire particles. Each should have distinct sounds.

- [ ] **Step 5: Commit**

```bash
git add src/combat.js src/audio.js src/main.js
git commit -m "feat: weapon-specific visuals and procedural audio"
```

---

## Task 14: Final Integration and Polish

**Files:**
- Modify: `src/main.js` (controls hint update)
- Modify: `index.html` (update controls text)

- [ ] **Step 1: Update controls hint**

In `index.html`, update the controls text (line 41):

```html
    <p style="color:#555; margin-top:20px; font-size:12px;">WASD move / Mouse aim / LMB shoot / RMB AoE / E build wall / SHIFT dash</p>
```

- [ ] **Step 2: Full playthrough test**

Restart server. Full playthrough checklist:
1. Start game, verify WASD movement has slight deceleration on stop
2. Press Shift -- dash with afterimage trail, dust puff, squish animation
3. Dash through enemies -- take no damage during i-frames
4. Camera follows aim direction (look-ahead)
5. Shooting kicks camera back
6. Clear wave 1 -- 3 upgrade cards appear
7. Pick an upgrade with keyboard (1/2/3) or click
8. Upgrade strip shows below HP bar
9. Pick SWIFT -- move faster
10. Pick SHOTGUN -- fire 5 bullets in spread
11. Pick VAMPIRISM -- HP recovers on damage dealt
12. Pick MAGNET -- pickups attracted from further
13. THORNS -- enemies take damage when they hit you
14. Play to wave 5 -- verify game is balanced and playable

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update controls hint with dash"
```

---

## Summary

14 tasks, ~50 steps total. Dependency chain:
- Tasks 1-8: Independent (dash, camera, deceleration, particles)
- Task 9: Upgrade config (needed by 10-12)
- Task 10: Shop system (needed by 11-13)
- Task 11: Passive effects
- Task 12: Weapon server logic
- Task 13: Weapon visuals
- Task 14: Polish and integration test

Parallelizable groups:
- **Group A** (tasks 1-5): Dash system end-to-end
- **Group B** (tasks 6-7): Camera improvements
- **Group C** (task 8): Deceleration + particles
- **Group D** (tasks 9-13): Upgrade shop + weapons + passives
- **Group E** (task 14): Final integration
