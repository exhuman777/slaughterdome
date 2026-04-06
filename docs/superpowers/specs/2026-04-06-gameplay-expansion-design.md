# Slaughterdome Gameplay Expansion -- Design Spec

## Overview

Eight gameplay improvements for the Slaughterdome multiplayer wave-survival arena game. All changes are server-authoritative with client prediction. No new dependencies. No build step changes.

## Scope

| # | Feature | Files Modified | Files Created |
|---|---------|---------------|---------------|
| 1 | Dash (Shift) | server/config.js, server/game.js, server/index.js, server/room.js, src/input.js, src/main.js, src/network.js, src/particles.js, src/player.js, index.html | none |
| 2 | Camera look-ahead | src/renderer.js, src/main.js | none |
| 3 | Between-wave upgrade shop | server/config.js, server/game.js, server/room.js, server/index.js, src/main.js, src/ui.js, src/network.js, index.html | src/upgrades.js |
| 4 | Movement particles/trails | src/particles.js, src/main.js | none |
| 5 | Camera kick on shoot | src/renderer.js, src/main.js | none |
| 6 | Deceleration curve | src/main.js | none |
| 7 | Weapon variety (via shop) | server/config.js, server/game.js, src/combat.js, src/main.js, src/audio.js | none |
| 8 | Passive stacking (via shop) | server/game.js, server/room.js, src/ui.js | none |

---

## 1. Dash System (Shift Key)

### Server Config

```javascript
// server/config.js -- new export
export const DASH = {
  speed: 30,        // 3x normal movement speed
  duration: 250,    // ms
  cooldown: 2000,   // ms between dashes
  iframes: 150,     // ms of invulnerability at start of dash
};
```

### Server Logic (game.js)

Player state additions in `room.js addPlayer()`:
- `dashTimer: 0` -- remaining dash duration (counts down)
- `dashCooldown: 0` -- remaining cooldown (counts down)
- `dashDirX: 0, dashDirZ: 0` -- locked dash direction
- `dashIframes: 0` -- remaining i-frame time (counts down)

In `updatePlayers()`:
1. Check `p.input.dash && p.dashCooldown <= 0 && !p.dashTimer`. If true:
   - Set `dashTimer = DASH.duration`
   - Set `dashCooldown = DASH.cooldown`
   - Set `dashIframes = DASH.iframes`
   - Lock direction: `dashDirX = p.input.dx || 0`, `dashDirZ = p.input.dz || 0`. If both zero, use aim direction as fallback.
   - Normalize dash direction vector.
2. If `dashTimer > 0`:
   - Override movement: `p.x += dashDirX * DASH.speed * dt`, same for z
   - Decrement `dashTimer -= TICK_MS`
   - Decrement `dashIframes -= TICK_MS` (if > 0)
3. If `dashIframes > 0`, skip all `damagePlayer()` calls for this player (enemy melee, enemy projectiles, arena outside damage).
4. Decrement `dashCooldown -= TICK_MS` (if > 0).

State snapshot (room.js): Add `dashing: p.dashTimer > 0` and `dashCooldown: p.dashCooldown` to player snapshot.

### Client Input (input.js)

Add `dashTriggered` flag (same pattern as `wallTriggered`):
- `keydown ShiftLeft` or `ShiftRight` sets `dashTriggered = true`
- `getInput()` includes `dash: dashTriggered`, resets to false after read
- Mobile: new DASH button (positioned left of ATK)

### Network Forwarding

client `src/network.js` -- `sendInput()` must include `dash` field in the input message.

server `server/index.js` -- on `'input'` message, copy `msg.dash` to `player.input.dash`. Reset to false after processing (same as wall input -- one-shot).

### Client Prediction (main.js)

When local player triggers dash:
- Store predicted dash state: `predDashTimer`, `predDashDirX/Z`
- During predicted dash, override `predictedX/Z` with dash velocity instead of normal input
- Correct toward server position same as normal movement

### Visuals

particles.js -- new `spawnDashTrail(x, z, color)`:
- 3 translucent sphere meshes along dash path (spaced over 250ms)
- Each sphere: scale 0.8, opacity 0.6, fade to 0 over 300ms
- Dust burst at origin: 6 small grey particles, low velocity, fast decay

player.js:
- During dash, scale player mesh to `(0.8, 1.2, 1.0)` -- squish in move direction, stretch vertically
- Reset to `(1, 1, 1)` after dash ends

### HUD

Dash cooldown indicator: thin bar above HP bar. Full = ready (amber). Drains during cooldown. CSS-only, no canvas.

---

## 2. Camera Look-Ahead

### renderer.js

Modify `updateCamera(targetX, targetZ)` to accept aim coordinates:

```javascript
export function updateCamera(targetX, targetZ, aimX, aimZ) {
  // Blend target 30% toward aim point, max 5 units offset
  const lookX = (aimX - targetX) * 0.3;
  const lookZ = (aimZ - targetZ) * 0.3;
  const lookDist = Math.sqrt(lookX * lookX + lookZ * lookZ);
  const maxOffset = 5;
  const scale = lookDist > maxOffset ? maxOffset / lookDist : 1;
  const camTargetX = targetX + lookX * scale;
  const camTargetZ = targetZ + lookZ * scale;
  // ...rest uses camTargetX/camTargetZ instead of targetX/targetZ
}
```

All `updateCamera()` call sites in main.js pass aim coordinates from `lastInput.aimX/aimZ`. When no aim data available (e.g. hitstop, no local player), pass `targetX, targetZ` as aim (no offset).

---

## 3. Between-Wave Upgrade Shop

### Server Config (config.js)

```javascript
export const WAVE_REST_MS = 10000; // extended from 5000

export const UPGRADE_DEFS = {
  // Weapon
  fire_rate:    { name: 'RAPID FIRE',    desc: '-15% shoot cooldown',      tier: 'common',  category: 'weapon' },
  bullet_size:  { name: 'BIG ROUNDS',    desc: '+30% bullet hit radius',   tier: 'common',  category: 'weapon' },
  pierce:       { name: 'PIERCE',        desc: 'Bullets pass through +1',  tier: 'rare',    category: 'weapon' },
  crit_chance:  { name: 'PRECISION',     desc: '+5% crit chance',          tier: 'common',  category: 'weapon' },
  crit_damage:  { name: 'DEVASTATION',   desc: '+0.5x crit multiplier',   tier: 'rare',    category: 'weapon' },
  // Movement
  move_speed:   { name: 'SWIFT',         desc: '+1 movement speed',        tier: 'common',  category: 'movement' },
  dash_cooldown:{ name: 'QUICK DASH',    desc: '-300ms dash cooldown',     tier: 'rare',    category: 'movement' },
  dash_distance:{ name: 'LONG DASH',     desc: '+20% dash speed',          tier: 'common',  category: 'movement' },
  // Defense
  max_hp:       { name: 'VITALITY',      desc: '+20 max HP',               tier: 'common',  category: 'defense' },
  wall_hp:      { name: 'FORTIFY',       desc: '+30 wall HP',              tier: 'common',  category: 'defense' },
  thorns:       { name: 'THORNS',        desc: '5 contact damage to enemies', tier: 'rare', category: 'defense' },
  // Passive
  lifesteal:    { name: 'VAMPIRISM',     desc: 'Heal 3% of damage dealt',  tier: 'epic',    category: 'passive' },
  magnet:       { name: 'MAGNET',        desc: '+3 pickup attract range',  tier: 'common',  category: 'passive' },
  combo_decay:  { name: 'MOMENTUM',      desc: '+500ms combo decay time',  tier: 'rare',    category: 'passive' },
  // Weapons (swap)
  shotgun:      { name: 'SHOTGUN',       desc: '5-bullet spread, slower',  tier: 'epic',    category: 'weapon_swap' },
  railgun:      { name: 'RAILGUN',       desc: 'Piercing beam, slow fire', tier: 'epic',    category: 'weapon_swap' },
  flamethrower: { name: 'FLAMETHROWER',  desc: 'Short range spray, fast',  tier: 'epic',    category: 'weapon_swap' },
};

export const UPGRADE_TIER_WEIGHTS = {
  common: { base: 0.65, perComboTier: -0.05 },
  rare:   { base: 0.28, perComboTier: 0.03 },
  epic:   { base: 0.07, perComboTier: 0.02 },
};
```

### Server Logic (game.js)

On wave clear (`checkWaveClear()`):
1. Calculate combo tier for upgrade weighting.
2. For each player, generate 3 random upgrades (no duplicates within the 3). Weight by tier.
3. Store `p.pendingUpgrades = [upgrade1, upgrade2, upgrade3]`.
4. Send `{ t: 'upgrades', options: p.pendingUpgrades }` to each player.

New message handler in `index.js`:
- `{ t: 'pick_upgrade', index: 0|1|2 }` -- validate index, apply upgrade from `p.pendingUpgrades[index]`, clear `pendingUpgrades`.

Upgrade application (new function `applyUpgrade(player, upgradeKey)`):
- Initialize `player.upgrades[key] = (player.upgrades[key] || 0) + 1`
- Weapon swap upgrades set `player.weapon = key` instead of stacking

Auto-pick: if `waveTimer` reaches 0 and player hasn't picked, apply first option.

### Player State (room.js)

Add to `addPlayer()`:
- `upgrades: {}` -- map of upgrade key to stack count
- `weapon: 'pistol'` -- current weapon type
- `pendingUpgrades: null` -- pending shop options

State snapshot adds: `upgrades: p.upgrades, weapon: p.weapon`

### Client UI

New file `src/upgrades.js`:
- `showUpgradeShop(options)`: creates 3 card elements, positioned center screen
- Each card: dark background (`#1a1a1a`), border color by tier (common: `#888`, rare: `#4488ff`, epic: `#ffaa00`), monospace text
- Card shows: upgrade name (bold), description, tier label
- Click handler sends `pick_upgrade` message, removes all cards with slide-out animation
- Keyboard: 1/2/3 keys to quick-select
- `hideUpgradeShop()`: removes cards (called on wave start or timeout)

HUD addition in `ui.js`:
- Upgrade strip below HP bar: small text showing active upgrades, e.g. `SPD+2 LIFE+1 THN+3`
- Updated via `updateUpgradeDisplay(upgrades)` called from `processState()`

### Network (network.js)

- New outbound message: `sendUpgradePick(index)`
- New event type in `drainEvents()`: `'upgrades'` event forwarded to main.js

### HTML (index.html)

- Add `<div id="upgrade-shop"></div>` container (hidden by default)
- Add `<div id="upgrade-strip"></div>` below HP bar
- CSS: card styles, tier colors, hover states, transition animations

---

## 4. Movement Particles/Trails

### particles.js

New `spawnDustPuff(x, z)`:
- 4-5 tiny box particles (scale 0.1), color `0x997755`
- Velocity: random spread, low (1-2 units/sec), fast decay (life 0.25s)
- Spawned at player feet position

New `spawnSpeedTrail(x, z, color)`:
- Single elongated particle (scale 0.15x0.05x0.15), color from parameter
- Placed at player position, no velocity, fades over 0.3s
- Creates a trail effect when spawned every 3rd frame

### main.js

Track `prevDx, prevDz` (previous frame's input direction).
- On direction change (sign flip of dx or dz, and player is moving): call `spawnDustPuff(predictedX, predictedZ)`
- On dash start: call `spawnDustPuff` with larger count
- If player has speed buff and is moving: increment `speedTrailCounter`, every 3rd frame call `spawnSpeedTrail(predictedX, predictedZ, 0xffff44)`
- If player is dashing: `spawnSpeedTrail` every frame with dash color `0x44ddff`

---

## 5. Camera Kick on Shoot

### renderer.js

New state: `let camKickX = 0, camKickZ = 0;`

New export `triggerCamKick(aimAngle)`:
```javascript
export function triggerCamKick(aimAngle) {
  camKickX = -Math.cos(aimAngle) * 1.5;
  camKickZ = -Math.sin(aimAngle) * 1.5;
}
```

In `updateCamera()`, add kick offset to camera position before shake:
```javascript
camera.position.x += camKickX;
camera.position.z += camKickZ;
camKickX *= 0.7; // fast decay per frame
camKickZ *= 0.7;
if (Math.abs(camKickX) < 0.01) camKickX = 0;
if (Math.abs(camKickZ) < 0.01) camKickZ = 0;
```

### main.js

In the gun shot section (where `showGunShot` is called), also call `triggerCamKick(angle)`.

---

## 6. Deceleration Curve (Client-Only)

### main.js

Replace direct input-based prediction with velocity-based:

```javascript
let predVelX = 0, predVelZ = 0;

// In prediction block:
if (input.dx !== 0 || input.dz !== 0) {
  // Instant acceleration (no ramp-up)
  predVelX = input.dx * speed;
  predVelZ = input.dz * speed;
} else {
  // Exponential deceleration (~3 frames to stop)
  predVelX *= Math.exp(-20 * dt);
  predVelZ *= Math.exp(-20 * dt);
  if (Math.abs(predVelX) < 0.1) predVelX = 0;
  if (Math.abs(predVelZ) < 0.1) predVelZ = 0;
}
predictedX += predVelX * dt;
predictedZ += predVelZ * dt;
```

Server movement stays instant -- no gameplay change. This is purely visual smoothing on the client.

---

## 7. Weapon Variety

### Server Config (config.js)

```javascript
export const WEAPONS = {
  pistol:       { bullets: 1, spread: 0,   cooldown: 150, damageMult: 1.0, speed: 35, pierce: 0, range: 3000 },
  shotgun:      { bullets: 5, spread: 0.3, cooldown: 400, damageMult: 0.7, speed: 25, pierce: 0, range: 1500 },
  railgun:      { bullets: 1, spread: 0,   cooldown: 800, damageMult: 3.0, speed: 50, pierce: 999, range: 3000 },
  flamethrower: { bullets: 3, spread: 0.4, cooldown: 80,  damageMult: 0.3, speed: 15, pierce: 0, range: 500 },
};
```

- `range` is max projectile age in ms (flamethrower projectiles die after 500ms = short range)
- `pierce` is how many enemies a bullet passes through before being destroyed (999 = infinite)

### Server Logic (game.js)

`playerShoot()` rewrite:
1. Read weapon config from `WEAPONS[player.weapon || 'pistol']`
2. Apply `fire_rate` upgrade: `cooldown *= Math.pow(0.85, player.upgrades.fire_rate || 0)`, floor at 50ms
3. Loop `weapon.bullets` times:
   - Angle = aimAngle + `(i - (bullets-1)/2) * spread` (centered spread)
   - Spawn projectile with `damage * damageMult`, `speed`, `pierce` counter, `maxAge = range`
4. Apply `bullet_size` upgrade to collision check radius: `1.2 * (1 + 0.3 * (player.upgrades.bullet_size || 0))`

`updateProjectiles()` changes:
- On bullet hit, if `pr.pierce > 0`: decrement pierce, add enemy to `pr.hitSet` (don't hit same enemy twice), DON'T delete projectile.
- Respect `pr.maxAge` instead of hardcoded 3000ms.

### Client Visuals (combat.js)

`showGunShot(x, z, angle, weaponType)` -- add `weaponType` parameter:
- `pistol`: existing yellow muzzle flash + sparks
- `shotgun`: wider flash (scale 1.5x), 5 spark directions matching bullet spread, louder bass sound
- `railgun`: thin cyan line mesh from player to max range along angle, fades over 200ms. Bright point flash at origin.
- `flamethrower`: 8-10 orange/red particles in a cone, short travel distance, no discrete flash

### Client Prediction (main.js)

`lastAttackTime` check uses weapon cooldown from state: `if (now - lastAttackTime > weaponCooldown)`. Read weapon type from player state snapshot.

### Audio (audio.js)

Different shot sounds per weapon type. All procedural (existing audio system is procedural/oscillator-based):
- `shotgun`: lower pitch, longer duration
- `railgun`: high pitch zap, sharp attack
- `flamethrower`: noise-based whoosh, continuous feel

---

## 8. Passive Stacking

### Server Logic (game.js)

All passive upgrades are applied in existing game loop functions:

**lifesteal** -- in `damageEnemy()`:
```javascript
if (player.upgrades.lifesteal) {
  const heal = Math.floor(dmg * 0.03 * player.upgrades.lifesteal);
  if (heal > 0) player.hp = Math.min(player.hp + heal, player.maxHp);
}
```

**magnet** -- in `updatePlayers()` pickup collection:
```javascript
const magnetRange = 1.5 + (p.upgrades.magnet || 0) * 3;
const magnetRangeSq = magnetRange * magnetRange;
// Attraction: pickups within magnetRange move toward player
for (const [, pk] of room.pickups) {
  const pdx = pk.x - p.x; const pdz = pk.z - p.z;
  const distSq = pdx * pdx + pdz * pdz;
  if (distSq < magnetRangeSq && distSq > 2.25) {
    // Pull pickup toward player
    const dist = Math.sqrt(distSq);
    pk.x -= (pdx / dist) * 8 * dt;
    pk.z -= (pdz / dist) * 8 * dt;
  }
  if (distSq < 2.25) {
    applyPickup(p, pk);
    room.pickups.delete(pk.id);
  }
}
```

**thorns** -- in enemy melee attack sections (grunt/brute/bomber/shielder/swarm melee):
```javascript
if (target.upgrades.thorns) {
  const thornsDmg = 5 * target.upgrades.thorns;
  damageEnemy(room, e, thornsDmg, target, false);
}
```

**combo_decay** -- in `updateCombo()`:
```javascript
// Get max combo_decay stacks from any alive player
const maxDecayStacks = Math.max(0, ...[...room.players.values()]
  .filter(p => p.alive)
  .map(p => p.upgrades.combo_decay || 0));
const decayTime = COMBO_DECAY_MS + maxDecayStacks * 500;
// Use decayTime instead of COMBO_DECAY_MS
```

**move_speed** -- in `updatePlayers()`:
```javascript
const baseSpeed = PLAYER.speed + (p.upgrades.move_speed || 0);
const speed = p.buffs.speed > 0 ? baseSpeed * 1.5 : baseSpeed;
```

**dash_cooldown** -- in dash cooldown set:
```javascript
p.dashCooldown = Math.max(800, DASH.cooldown - (p.upgrades.dash_cooldown || 0) * 300);
```

**dash_distance** -- in dash movement:
```javascript
const dashSpeed = DASH.speed * (1 + (p.upgrades.dash_distance || 0) * 0.2);
```

**max_hp** -- on upgrade apply:
```javascript
player.maxHp = PLAYER.hp + (player.upgrades.max_hp || 0) * 20;
player.hp = Math.min(player.hp + 20, player.maxHp); // heal 20 on pickup
```

**wall_hp** -- on wall spawn:
```javascript
const wallHp = WALL.hp + (player.upgrades.wall_hp || 0) * 30;
```

**shield_duration** -- in `applyPickup()`:
```javascript
case 'shield':
  player.buffs.shield = 6000 + (player.upgrades.shield_duration || 0) * 2000;
  break;
```

### State Snapshot

Player snapshot in `room.js` already proposed to include `upgrades` object. No additional changes needed.

---

## Implementation Order

Features should be implemented in this order due to dependencies:

1. **Dash** (standalone, no dependencies)
2. **Camera look-ahead** (standalone)
3. **Camera kick** (standalone)
4. **Deceleration curve** (standalone)
5. **Movement particles** (depends on dash for trail visuals)
6. **Upgrade shop** (core system, needed by 7 and 8)
7. **Weapon variety** (depends on upgrade shop for weapon swap delivery)
8. **Passive stacking** (depends on upgrade shop for upgrade delivery)

Features 1-4 are independent and can be parallelized. Feature 5 depends on 1. Features 7-8 depend on 6.

## Testing

- All features testable locally with single player (start server + serve)
- Multiplayer test: open 2 browser tabs to same localhost URL
- Dash i-frames: walk into enemy, dash through -- should take no damage
- Upgrade shop: clear wave 1, verify 3 cards appear, pick one, verify applied
- Weapon swap: pick shotgun from shop, verify 5-bullet spread
- Passive stacking: pick lifesteal, damage enemies, verify HP recovery
- Camera look-ahead: move mouse to screen edge, verify camera shifts
- Deceleration: release WASD, verify brief slide before stop
