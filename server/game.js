import {
  TICK_MS, TICK_RATE, ARENA_RADIUS, PLAYER, COMBO_DECAY_MS, COMBO_TIERS,
  PICKUP_DROP_BASE, PICKUP_DROP_COMBO_BONUS, PICKUP_DESPAWN_MS, PICKUPS,
  WAVE_REST_MS, SCALING, ENEMY_DEFS, WALL, DASH, SWORD,
  ARENA_SHRINK_PER_WAVE, ARENA_MIN_RADIUS, ARENA_OUTSIDE_DPS,
  waveEnemyCount, enemyTypesForWave, scaleStat,
  UPGRADE_DEFS, UPGRADE_TIER_WEIGHTS, WEAPONS, OVERHEAT, OBSTACLES, FLAG,
} from './config.js';

// OBB wall collision -- returns push vector or null
function wallPush(ex, ez, w, radius) {
  const cos = Math.cos(-w.angle), sin = Math.sin(-w.angle);
  const dx = ex - w.x, dz = ez - w.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const hw = WALL.halfWidth + radius;
  const hd = WALL.halfDepth + radius;
  const ox = hw - Math.abs(lx);
  const oz = hd - Math.abs(lz);
  if (ox <= 0 || oz <= 0) return null;
  let px = 0, pz = 0;
  if (ox < oz) px = ox * Math.sign(lx);
  else pz = oz * Math.sign(lz);
  const cosR = Math.cos(w.angle), sinR = Math.sin(w.angle);
  return { x: px * cosR - pz * sinR, z: px * sinR + pz * cosR };
}

// Point-in-wall check for projectiles (no radius expansion)
function pointInWall(px, pz, w, radius) {
  const cos = Math.cos(-w.angle), sin = Math.sin(-w.angle);
  const dx = px - w.x, dz = pz - w.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) < WALL.halfWidth + radius && Math.abs(lz) < WALL.halfDepth + radius;
}

// Circular obstacle collision -- returns push vector or null
function obstaclePush(ex, ez, ob, entityRadius) {
  if (ob.type === 'water' && !ob.active) return null;
  const dx = ex - ob.x, dz = ez - ob.z;
  const distSq = dx * dx + dz * dz;
  const minDist = ob.radius + entityRadius;
  if (distSq >= minDist * minDist) return null;
  const dist = Math.sqrt(distSq) || 0.01;
  const overlap = minDist - dist;
  return { x: (dx / dist) * overlap, z: (dz / dist) * overlap };
}

let nextEnemyId = 1;
let nextPickupId = 1;
let nextProjectileId = 1;
let nextWallId = 1;
let nextFlagId = 1;

let onGameOver = null;

export function startGameLoop(roomManager, addScoreFn) {
  onGameOver = addScoreFn || null;
  setInterval(() => {
    try {
      roomManager.cleanup();
      for (const room of roomManager.activeRooms) {
        tickRoom(room);
      }
    } catch (err) {
      console.error('Game loop error:', err);
    }
  }, TICK_MS);
}

function tickRoom(room) {
  if (room.state === 'destroyed' || room.state === 'gameover') return;
  if (room.isEmpty) return;
  const dt = TICK_MS / 1000;
  room.tick++;

  if (room.state === 'waiting') {
    room.state = 'countdown';
    room.waveTimer = 3000;
    room.wave = 0;
    room.score = 0;
    room.combo = 0;
    return;
  }

  if (room.state === 'countdown') {
    room.waveTimer -= TICK_MS;
    if (room.waveTimer <= 0) {
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

  updatePlayers(room, dt);
  updateEnemies(room, dt);
  updateProjectiles(room, dt);
  updatePickups(room);
  updateWalls(room);
  updateCombo(room);
  updateFlag(room);
  checkWaveClear(room);
  checkGameOver(room);
  room.broadcast(room.getStateSnapshot());
}

function updatePlayers(room, dt) {
  for (const [, p] of room.players) {
    if (!p.alive) continue;
    // Chain dash processing (HLD-style)
    if (p.input.dash) {
      if (p.dashCharges > 0 && p.dashTimer <= 0) {
        let ddx = p.input.dx, ddz = p.input.dz;
        const dlen = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dlen > 0) { ddx /= dlen; ddz /= dlen; }
        else {
          const aDx = p.input.aimX - p.x, aDz = p.input.aimZ - p.z;
          const aLen = Math.sqrt(aDx * aDx + aDz * aDz) || 1;
          ddx = aDx / aLen; ddz = aDz / aLen;
        }
        p.dashDirX = ddx; p.dashDirZ = ddz;
        p.dashTimer = DASH.duration;
        p.dashIframes = DASH.iframes;
        p.dashCharges--;
        p.dashChainTimer = 0;
        p.dashRechargeTimer = DASH.rechargeRate;
      }
      p.input.dash = false;
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= TICK_MS;
      if (p.dashIframes > 0) p.dashIframes -= TICK_MS;
      const dashSpeed = DASH.speed * (1 + (p.upgrades.dash_distance || 0) * 0.2);
      p.x += p.dashDirX * dashSpeed * dt;
      p.z += p.dashDirZ * dashSpeed * dt;
      if (p.dashTimer <= 0) p.dashChainTimer = DASH.chainWindow;
    } else if (p.dashChainTimer > 0) {
      p.dashChainTimer -= TICK_MS;
    }
    // Recharge dash charges when not dashing or chaining
    if (p.dashCharges < DASH.charges && p.dashTimer <= 0 && p.dashChainTimer <= 0) {
      p.dashRechargeTimer -= TICK_MS;
      if (p.dashRechargeTimer <= 0) {
        p.dashCharges++;
        p.dashRechargeTimer = DASH.rechargeRate;
      }
    }
    if (p.dashTimer > 0) {
      // Movement handled above during dash
    } else {
      const dx = p.input.dx;
      const dz = p.input.dz;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0) {
        const baseSpeed = PLAYER.speed + (p.upgrades.move_speed || 0);
        const speed = p.buffs.speed > 0 ? baseSpeed * 1.5 : baseSpeed;
        p.x += (dx / len) * speed * dt;
        p.z += (dz / len) * speed * dt;
      }
    }
    // Player-wall collision (OBB)
    for (const [, w] of room.walls) {
      const push = wallPush(p.x, p.z, w, 0.5);
      if (push) { p.x += push.x; p.z += push.z; }
    }
    // Player-obstacle collision removed (trees/env are visual only)
    // NaN guard
    if (isNaN(p.x) || isNaN(p.z)) { p.x = 0; p.z = 0; }
    const dist = Math.sqrt(p.x * p.x + p.z * p.z);
    if (dist > room.arenaRadius - 1) {
      const s = (room.arenaRadius - 1) / dist;
      p.x *= s; p.z *= s;
    }
    if (p.shootCooldown > 0) p.shootCooldown -= TICK_MS;
    if (p.specialCooldown > 0) p.specialCooldown -= TICK_MS;
    for (const buff in p.buffs) {
      if (p.buffs[buff] > 0) {
        p.buffs[buff] -= TICK_MS;
        if (p.buffs[buff] <= 0) delete p.buffs[buff];
      }
    }
    // Overheat system
    if (p.overheated) {
      p.overheatCooldown -= TICK_MS;
      if (p.overheatCooldown <= 0) {
        p.overheated = false;
        p.heatTimer = 0;
        p.overheatCooldown = 0;
      }
    } else if (!p.input.attack) {
      p.heatTimer = Math.max(0, p.heatTimer - TICK_MS * 0.5);
    }
    if (p.input.attack && p.shootCooldown <= 0) {
      const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
      playerShoot(room, p, aimAngle);
      p.shotsFired++;
    }
    if (p.input.special && p.specialCooldown <= 0) {
      p.specialCooldown = PLAYER.specialCooldown;
      specialAttack(room, p);
    }
    // Sword combat
    if (p.input.sword) {
      if (p.swordCooldown <= 0) {
        const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
        swordSlash(room, p, aimAngle);
        p.swordCombo = (p.swordCombo + 1) % 3;
        p.swordCooldown = p.swordCombo === 0 ? SWORD.comboPause : SWORD.cooldown;
        p.swordComboTimer = SWORD.comboWindow;
      }
      p.input.sword = false;
    }
    if (p.swordCooldown > 0) p.swordCooldown -= TICK_MS;
    if (p.swordComboTimer > 0) {
      p.swordComboTimer -= TICK_MS;
      if (p.swordComboTimer <= 0) p.swordCombo = 0;
    }
    // Wall placement
    if (p.input.wall) {
      if (p.wallCharges > 0 && p.wallPlaceCooldown <= 0) {
        p.wallCharges--;
        p.wallPlaceCooldown = WALL.placeCooldown;
        if (p.wallCharges <= 0) p.wallRechargeTimer = WALL.cooldown;
        const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
        const aimDist = Math.sqrt((p.input.aimX - p.x) ** 2 + (p.input.aimZ - p.z) ** 2);
        const placeDist = Math.min(aimDist, 8);
        const wx = p.x + Math.cos(aimAngle) * placeDist;
        const wz = p.z + Math.sin(aimAngle) * placeDist;
        spawnWall(room, wx, wz, aimAngle + Math.PI / 2, p);
      }
      p.input.wall = false;
    }
    if (p.wallPlaceCooldown > 0) p.wallPlaceCooldown -= TICK_MS;
    if (p.wallRechargeTimer > 0) {
      p.wallRechargeTimer -= TICK_MS;
      if (p.wallRechargeTimer <= 0) p.wallCharges = WALL.charges;
    }
    // Arena outside damage
    const pDist = Math.sqrt(p.x * p.x + p.z * p.z);
    if (pDist > room.arenaRadius - 1) {
      damagePlayer(room, p, Math.ceil(ARENA_OUTSIDE_DPS * dt));
    }
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
  }
}

function playerShoot(room, player, aimAngle) {
  const wep = WEAPONS[player.weapon || 'pistol'];
  let cooldown = Math.max(50, wep.cooldown * Math.pow(0.85, player.upgrades.fire_rate || 0));
  if (player.overheated) cooldown *= OVERHEAT.slowMult;
  player.shootCooldown = cooldown;
  if (!player.overheated) {
    player.heatTimer += cooldown;
    if (player.heatTimer >= OVERHEAT.fastMs) {
      player.overheated = true;
      player.overheatCooldown = OVERHEAT.slowMs;
    }
  }
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

function specialAttack(room, player) {
  const baseDmg = pDamage(player);
  for (const [, e] of room.enemies) {
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > PLAYER.specialRange) continue;
    const dmg = Math.floor(baseDmg * 0.8);
    damageEnemy(room, e, dmg, player, false);
    if (dist > 0.5) {
      const kb = Math.min(PLAYER.specialKnockback / dist, 10);
      e.x += dx * kb; e.z += dz * kb;
    }
  }
}

function swordSlash(room, player, aimAngle) {
  const halfArc = SWORD.arc / 2;
  const rangeSq = SWORD.range * SWORD.range;
  for (const [, e] of room.enemies) {
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > rangeSq) continue;
    const angle = Math.atan2(dz, dx);
    let diff = angle - aimAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > halfArc) continue;
    const dmg = Math.floor(SWORD.damage * (1 + player.swordCombo * 0.15));
    const crit = Math.random() < (PLAYER.critChance + (player.upgrades.crit_chance || 0) * 0.05);
    const critMult = PLAYER.critMultiplier + (player.upgrades.crit_damage || 0) * 0.5;
    const finalDmg = Math.floor(dmg * (crit ? critMult : 1));
    damageEnemy(room, e, finalDmg, player, crit);
    const dist = Math.sqrt(distSq) || 1;
    e.x += (dx / dist) * SWORD.knockback;
    e.z += (dz / dist) * SWORD.knockback;
  }
  room.broadcast({ t: 'sword', pid: player.id, angle: aimAngle, combo: player.swordCombo, pos: [player.x, 0, player.z] });
}

function pDamage(player) {
  const base = PLAYER.damage + Math.floor(Math.random() * 4);
  return player.buffs.damage > 0 ? base * 2 : base;
}

function damageEnemy(room, enemy, dmg, player, crit) {
  enemy.hp -= dmg;
  room.broadcast({ t: 'hit', target: enemy.id, dmg, from: player.id, crit, pos: [enemy.x, 0, enemy.z] });
  if (player && player.upgrades.lifesteal) {
    const heal = Math.floor(dmg * 0.03 * player.upgrades.lifesteal);
    if (heal > 0) player.hp = Math.min(player.hp + heal, player.maxHp);
  }
  if (enemy.hp <= 0) killEnemy(room, enemy, player);
}

function killEnemy(room, enemy, player) {
  room.enemies.delete(enemy.id);
  player.kills++;
  room.combo++;
  const maxDecayStacks = Math.max(0, ...[...room.players.values()]
    .filter(p => p.alive)
    .map(p => p.upgrades.combo_decay || 0));
  room.comboTimer = COMBO_DECAY_MS + maxDecayStacks * 500;
  const tier = getComboTier(room.combo);
  const multiplier = tier ? tier.multiplier : 1;
  const isBoss = enemy.type === 'titan';
  const bossNum = Math.floor(room.wave / 5);
  const points = isBoss
    ? Math.floor((100 + bossNum * 50) * multiplier)
    : Math.floor((10 + room.wave * 2) * multiplier);
  room.score += points;
  room.broadcast({ t: 'kill', eid: enemy.id, pid: player.id, dmg: 0, pos: [enemy.x, 0, enemy.z], combo: room.combo });
  if (enemy.type === 'bomber') {
    const bx = enemy.x, bz = enemy.z;
    setTimeout(() => { if (room.state === 'combat') bomberExplode(room, bx, bz); }, 2000);
  }
  const dropChance = PICKUP_DROP_BASE + room.combo * PICKUP_DROP_COMBO_BONUS;
  if (Math.random() < dropChance) spawnPickup(room, enemy.x, enemy.z);
}

function bomberExplode(room, x, z) {
  for (const [, p] of room.players) {
    if (!p.alive) continue;
    const dx = p.x - x; const dz = p.z - z;
    if (dx * dx + dz * dz < 9) damagePlayer(room, p, 25);
  }
  room.broadcast({ t: 'explosion', pos: [x, 0, z], radius: 3 });
}

function damagePlayer(room, player, dmg) {
  if (!player.alive) return;
  if (player.dashIframes > 0) return;
  const actual = player.buffs.shield > 0 ? Math.floor(dmg * 0.5) : dmg;
  player.hp -= actual;
  room.broadcast({ t: 'hit', target: player.id, dmg: actual, from: 'enemy' });
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false;
    if (room.flag && room.flag.carriedBy === player.id) {
      room.flag.x = player.x; room.flag.z = player.z;
      room.flag.carriedBy = null;
      room.broadcast({ t: 'flag_dropped', flag: room.flag });
    }
    room.broadcast({ t: 'death', pid: player.id });
  }
}

function applyPickup(player, pickup) {
  switch (pickup.type) {
    case 'health': player.hp = Math.min(player.hp + 30, player.maxHp); break;
    case 'speed': player.buffs.speed = 5000; break;
    case 'damage': player.buffs.damage = 8000; break;
    case 'shield': player.buffs.shield = 6000; break;
  }
}

function updateEnemies(room, dt) {
  const alivePlayers = [...room.players.values()].filter(p => p.alive);
  if (alivePlayers.length === 0) return;
  for (const [, e] of room.enemies) {
    const target = nearestPlayer(e, alivePlayers);
    if (!target) continue;
    const dx = target.x - e.x; const dz = target.z - e.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    e.facing = Math.atan2(dz, dx);

    switch (e.type) {
      case 'grunt': case 'brute': case 'bomber': case 'shielder': {
        if (dist > 1.2) {
          e.x += (dx / dist) * e.speed * dt;
          e.z += (dz / dist) * e.speed * dt;
        } else if (e.attackCooldown <= 0) {
          damagePlayer(room, target, e.damage);
          e.attackCooldown = 1000;
          if (target.upgrades && target.upgrades.thorns) {
            const thornsDmg = 5 * target.upgrades.thorns;
            damageEnemy(room, e, thornsDmg, target, false);
          }
          if (e.type === 'brute' && dist > 0.5) {
            const kb = Math.min(3 / dist, 5);
            target.x += dx * kb; target.z += dz * kb;
          }
        }
        break;
      }
      case 'dasher': {
        if (e.aiState === 'idle') {
          if (e.chargeCooldown <= 0) {
            e.aiState = 'telegraph'; e.chargeTimer = 500;
            e.chargeTargetX = target.x; e.chargeTargetZ = target.z;
          } else if (dist > 3) {
            e.x += (dx / dist) * e.speed * 0.5 * dt;
            e.z += (dz / dist) * e.speed * 0.5 * dt;
          }
        } else if (e.aiState === 'telegraph') {
          e.chargeTimer -= TICK_MS;
          if (e.chargeTimer <= 0) {
            e.aiState = 'charging'; e.chargeTimer = 1000;
            const cdx = e.chargeTargetX - e.x; const cdz = e.chargeTargetZ - e.z;
            const cdist = Math.sqrt(cdx * cdx + cdz * cdz) || 1;
            e.chargeVx = (cdx / cdist) * e.speed * 3;
            e.chargeVz = (cdz / cdist) * e.speed * 3;
          }
        } else if (e.aiState === 'charging') {
          // Sub-step charge movement to prevent wall tunneling
          const chargeDist = Math.sqrt(e.chargeVx * e.chargeVx + e.chargeVz * e.chargeVz) * dt;
          const steps = Math.max(1, Math.ceil(chargeDist / 0.5));
          const subDt = dt / steps;
          let hitWall = false;
          for (let s = 0; s < steps; s++) {
            e.x += e.chargeVx * subDt; e.z += e.chargeVz * subDt;
            for (const [, w] of room.walls) {
              const push = wallPush(e.x, e.z, w, 0.6);
              if (push) {
                e.x += push.x; e.z += push.z;
                w.hp -= e.damage * 0.5;
                hitWall = true;
                break;
              }
            }
            if (hitWall) { e.aiState = 'idle'; e.chargeCooldown = 2000; break; }
          }
          e.chargeTimer -= TICK_MS;
          if (!hitWall) {
            for (const [, p] of room.players) {
              if (!p.alive) continue;
              const pdx = p.x - e.x; const pdz = p.z - e.z;
              if (pdx * pdx + pdz * pdz < 2) {
                damagePlayer(room, p, e.damage);
                if (p.upgrades && p.upgrades.thorns) {
                  damageEnemy(room, e, 5 * p.upgrades.thorns, p, false);
                }
              }
            }
          }
          if (e.chargeTimer <= 0 && e.aiState !== 'idle') { e.aiState = 'idle'; e.chargeCooldown = 2000; }
        }
        break;
      }
      case 'spitter': {
        if (dist > 8) {
          e.x += (dx / dist) * e.speed * dt;
          e.z += (dz / dist) * e.speed * dt;
        } else if (e.attackCooldown <= 0) {
          const pdist = dist || 1;
          spawnProjectile(room, e.x, e.z, (dx / pdist) * 12, (dz / pdist) * 12, 'spit', e.damage);
          e.attackCooldown = 2000;
        }
        break;
      }
      case 'swarm': {
        const orbitAngle = (Date.now() / 1000 + e.swarmOffset) * 2;
        const tx = target.x + Math.cos(orbitAngle) * 3 + (Math.random() - 0.5) * 2;
        const tz = target.z + Math.sin(orbitAngle) * 3 + (Math.random() - 0.5) * 2;
        const sdx = tx - e.x; const sdz = tz - e.z;
        const sdist = Math.sqrt(sdx * sdx + sdz * sdz) || 1;
        e.x += (sdx / sdist) * e.speed * dt;
        e.z += (sdz / sdist) * e.speed * dt;
        if (dist < 1.5 && e.attackCooldown <= 0) {
          damagePlayer(room, target, e.damage);
          e.attackCooldown = 800;
          if (target.upgrades && target.upgrades.thorns) {
            damageEnemy(room, e, 5 * target.upgrades.thorns, target, false);
          }
        }
        break;
      }
      default: {
        if (dist > 1.2) {
          e.x += (dx / dist) * e.speed * dt;
          e.z += (dz / dist) * e.speed * dt;
        }
      }
    }
    if (e.attackCooldown > 0) e.attackCooldown -= TICK_MS;
    if (e.chargeCooldown > 0) e.chargeCooldown -= TICK_MS;
    // Push from walls (OBB) -- double pass to prevent fast/small enemies slipping through
    const wallRadius = e.type === 'swarm' ? 0.8 : 0.6;
    for (let pass = 0; pass < 2; pass++) {
      for (const [, w] of room.walls) {
        const push = wallPush(e.x, e.z, w, wallRadius);
        if (push) {
          e.x += push.x; e.z += push.z;
          if (pass === 0) w.hp -= e.damage * dt * 0.15;
        }
      }
    }
    // Enemy-obstacle collision removed (trees/env are visual only)
    // NaN guard for enemies
    if (isNaN(e.x) || isNaN(e.z)) { e.x = 0; e.z = 0; }
    const edist = Math.sqrt(e.x * e.x + e.z * e.z);
    if (edist > room.arenaRadius + 5) {
      const s = (room.arenaRadius + 5) / edist; e.x *= s; e.z *= s;
    }
  }
}

function nearestPlayer(entity, players) {
  let best = null; let bestDist = Infinity;
  for (const p of players) {
    const dx = p.x - entity.x; const dz = p.z - entity.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function updateProjectiles(room, dt) {
  for (const [id, pr] of room.projectiles) {
    pr.x += pr.vx * dt; pr.z += pr.vz * dt; pr.age += TICK_MS;
    if (pr.age > (pr.maxAge || 3000) || Math.sqrt(pr.x * pr.x + pr.z * pr.z) > ARENA_RADIUS + 5) {
      room.projectiles.delete(id); continue;
    }
    // Projectile-tree collision removed (trees are visual only)
    if (pr.type === 'bullet') {
      // Player bullets hit walls (walls are destructible)
      let hitWall = false;
      for (const [, w] of room.walls) {
        if (pointInWall(pr.x, pr.z, w, 0.2)) {
          w.hp -= pr.damage;
          room.broadcast({ t: 'hit', target: 'wall', dmg: pr.damage, pos: [w.x, 0, w.z] });
          room.projectiles.delete(id);
          hitWall = true; break;
        }
      }
      if (hitWall) continue;
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
    } else {
      // Enemy projectiles blocked by walls (OBB)
      let hitWall = false;
      for (const [, w] of room.walls) {
        if (pointInWall(pr.x, pr.z, w, 0.2)) {
          w.hp -= 10;
          room.projectiles.delete(id);
          hitWall = true; break;
        }
      }
      if (hitWall) continue;
      for (const [, p] of room.players) {
        if (!p.alive) continue;
        const dx = p.x - pr.x; const dz = p.z - pr.z;
        if (dx * dx + dz * dz < 1.5) {
          damagePlayer(room, p, pr.damage);
          room.projectiles.delete(id); break;
        }
      }
    }
  }
}

function spawnProjectile(room, x, z, vx, vz, type, damage, owner) {
  const id = 'pr' + nextProjectileId++;
  room.projectiles.set(id, { id, x, z, vx, vz, type, damage, age: 0, owner: owner || null });
}

function spawnWall(room, x, z, angle, player) {
  const id = 'w' + nextWallId++;
  const wallHp = WALL.hp + ((player && player.upgrades.wall_hp) || 0) * 50;
  room.walls.set(id, { id, x, z, angle, hp: wallHp, maxHp: wallHp, age: 0 });
}

function updateWalls(room) {
  for (const [id, w] of room.walls) {
    w.age += TICK_MS;
    if (w.hp <= 0 || w.age > WALL.lifetime) room.walls.delete(id);
  }
}

function updatePickups(room) {
  for (const [id, pk] of room.pickups) {
    pk.age += TICK_MS;
    if (pk.age > PICKUP_DESPAWN_MS) room.pickups.delete(id);
  }
}

function spawnPickup(room, x, z) {
  const roll = Math.random(); let cumulative = 0; let type = 'health';
  for (const [t, def] of Object.entries(PICKUPS)) {
    cumulative += def.chance;
    if (roll < cumulative) { type = t; break; }
  }
  const id = 'pk' + nextPickupId++;
  room.pickups.set(id, { id, type, x, z, age: 0 });
}

function updateCombo(room) {
  if (room.combo > 0) {
    const maxDecayStacks = Math.max(0, ...[...room.players.values()]
      .filter(p => p.alive)
      .map(p => p.upgrades.combo_decay || 0));
    const decayTime = COMBO_DECAY_MS + maxDecayStacks * 500;
    room.comboTimer -= TICK_MS;
    if (room.comboTimer <= 0) room.combo = 0;
    if (room.comboTimer > decayTime) room.comboTimer = decayTime;
  }
}

function getComboTier(combo) {
  let tier = null;
  for (const t of COMBO_TIERS) { if (combo >= t.kills) tier = t; }
  return tier;
}

function findValidPosition(room, avoidPositions, clearance) {
  const maxR = room.arenaRadius - 2;
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * (maxR - 3);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    let valid = true;
    for (const ob of room.obstacles) {
      if (ob.type === 'water' && !ob.active) continue;
      const dx = x - ob.x, dz = z - ob.z;
      if (dx * dx + dz * dz < clearance * clearance) { valid = false; break; }
    }
    if (!valid) continue;
    for (const [, w] of room.walls) {
      const dx = x - w.x, dz = z - w.z;
      if (dx * dx + dz * dz < clearance * clearance) { valid = false; break; }
    }
    if (!valid) continue;
    for (const pos of avoidPositions) {
      const dx = x - pos.x, dz = z - pos.z;
      if (dx * dx + dz * dz < pos.minDist * pos.minDist) { valid = false; break; }
    }
    if (valid) return { x, z };
  }
  return null;
}

function spawnFlag(room) {
  const flagPos = findValidPosition(room, [], FLAG.obstacleClearance);
  if (!flagPos) { room.flagDelivered = true; return; }
  const deliveryPos = findValidPosition(room, [{ x: flagPos.x, z: flagPos.z, minDist: FLAG.minSeparation }], FLAG.obstacleClearance);
  if (!deliveryPos) { room.flagDelivered = true; return; }
  room.flag = { id: 'f' + nextFlagId++, x: flagPos.x, z: flagPos.z, carriedBy: null };
  room.delivery = { x: deliveryPos.x, z: deliveryPos.z };
  room.flagDelivered = false;
  room.broadcast({ t: 'flag_spawn', flag: room.flag, delivery: room.delivery });
}

function updateFlag(room) {
  if (!room.flag || room.flagDelivered) return;
  const flag = room.flag;
  // If carried, move with carrier
  if (flag.carriedBy) {
    const carrier = room.players.get(flag.carriedBy);
    if (!carrier || !carrier.alive) {
      // Drop flag at last position
      if (carrier) { flag.x = carrier.x; flag.z = carrier.z; }
      flag.carriedBy = null;
      room.broadcast({ t: 'flag_dropped', flag });
      return;
    }
    flag.x = carrier.x;
    flag.z = carrier.z;
    // Check delivery
    const dx = flag.x - room.delivery.x, dz = flag.z - room.delivery.z;
    if (dx * dx + dz * dz < FLAG.deliveryRadius * FLAG.deliveryRadius) {
      room.flagDelivered = true;
      const bonus = room.enemies.size > 0
        ? room.wave * FLAG.aliveBonus
        : room.wave * FLAG.deadBonus;
      room.score += bonus;
      room.broadcast({ t: 'flag_delivered', pid: flag.carriedBy, bonus });
      room.flag = null;
      return;
    }
    return;
  }
  // Magnet pull + pickup check for all alive players
  const dt = TICK_MS / 1000;
  const magnetSq = FLAG.magnetRange * FLAG.magnetRange;
  const pickupSq = FLAG.pickupRadius * FLAG.pickupRadius;
  for (const [, p] of room.players) {
    if (!p.alive) continue;
    const dx = p.x - flag.x, dz = p.z - flag.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < pickupSq) {
      flag.carriedBy = p.id;
      room.broadcast({ t: 'flag_picked', pid: p.id });
      return;
    }
    if (distSq < magnetSq && distSq > pickupSq) {
      const dist = Math.sqrt(distSq);
      flag.x += (dx / dist) * FLAG.magnetSpeed * dt;
      flag.z += (dz / dist) * FLAG.magnetSpeed * dt;
    }
  }
}

function spawnWave(room) {
  const wave = room.wave;
  // Shrink arena each wave
  room.arenaRadius = Math.max(ARENA_MIN_RADIUS, ARENA_RADIUS - (wave - 1) * ARENA_SHRINK_PER_WAVE);
  // Activate water obstacles from wave 5+
  if (wave >= OBSTACLES.waterStartWave) {
    let waterActivated = false;
    for (const ob of room.obstacles) {
      if (ob.type === 'water' && !ob.active) { ob.active = true; waterActivated = true; }
    }
    if (waterActivated) {
      const obs = room.obstacles
        .filter(o => o.type === 'tree' || o.active)
        .map(o => ({ type: o.type, pos: [Math.round(o.x * 100) / 100, 0, Math.round(o.z * 100) / 100], radius: o.radius }));
      room.broadcast({ t: 'obstacles', obstacles: obs });
    }
  }
  const isBossWave = wave % 5 === 0 && wave > 0;
  const types = enemyTypesForWave(wave);
  const count = waveEnemyCount(wave, room.playerCount);
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    spawnEnemy(room, type, wave);
  }
  if (isBossWave) {
    spawnEnemy(room, 'titan', wave);
    room.broadcast({ t: 'boss', type: 'titan', abilities: ['charge', 'ranged'] });
  }
  spawnFlag(room);
}

function spawnEnemy(room, type, wave) {
  const def = ENEMY_DEFS[type];
  const angle = Math.random() * Math.PI * 2;
  const spawnDist = room.arenaRadius + 3;
  const id = 'e' + nextEnemyId++;
  const hp = type === 'titan'
    ? SCALING.bossHpBase + SCALING.bossHpPerBoss * Math.floor(wave / 5)
    : Math.ceil(scaleStat(def.hp, wave, SCALING.hpPerWave));
  const speed = scaleStat(def.speed, wave, SCALING.speedPerWave, SCALING.speedCap);
  const damage = Math.ceil(scaleStat(def.damage, wave, SCALING.damagePerWave));
  const enemy = {
    id, type, x: Math.cos(angle) * spawnDist, z: Math.sin(angle) * spawnDist,
    hp, maxHp: hp, speed, damage, facing: 0, aiState: 'idle',
    attackCooldown: 0, chargeCooldown: 0, chargeTimer: 0,
    chargeVx: 0, chargeVz: 0, chargeTargetX: 0, chargeTargetZ: 0,
    swarmOffset: Math.random() * Math.PI * 2,
  };
  if (type === 'swarm' && def.count) {
    for (let i = 0; i < def.count; i++) {
      const sid = 'e' + nextEnemyId++;
      const sa = angle + (i / def.count) * Math.PI * 2 * 0.3;
      room.enemies.set(sid, { ...enemy, id: sid, x: Math.cos(sa) * spawnDist, z: Math.sin(sa) * spawnDist, swarmOffset: i * (Math.PI * 2 / def.count) });
    }
  } else {
    room.enemies.set(id, enemy);
  }
}

function checkWaveClear(room) {
  if (room.state !== 'combat' || room.enemies.size > 0 || !room.flagDelivered) return;
  room.score += room.wave * 25;
  for (const [, p] of room.players) {
    if (!p.alive) {
      p.alive = true; p.hp = Math.floor(p.maxHp * 0.5); p.x = 0; p.z = 0;
      room.broadcast({ t: 'respawn', pid: p.id, hp: p.hp });
    }
  }
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

function checkGameOver(room) {
  if (room.state !== 'combat') return;
  if (![...room.players.values()].some(p => p.alive)) {
    room.state = 'gameover';
    const players = [];
    for (const [, p] of room.players) {
      players.push({ id: p.id, name: p.name, kills: p.kills, shotsFired: p.shotsFired });
      if (onGameOver) {
        try { onGameOver(p.name, room.score, room.wave, p.kills, p.shotsFired); } catch {}
      }
    }
    room.broadcast({ t: 'gameover', wave: room.wave, score: room.score, players });
  }
}

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
    player.heatTimer = 0;
    player.overheated = false;
    player.overheatCooldown = 0;
  } else {
    player.upgrades[upgradeKey] = (player.upgrades[upgradeKey] || 0) + 1;
  }
  if (upgradeKey === 'max_hp') {
    player.maxHp = PLAYER.hp + (player.upgrades.max_hp || 0) * 20;
    player.hp = Math.min(player.hp + 20, player.maxHp);
  }
}
