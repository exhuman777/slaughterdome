import {
  TICK_MS, TICK_RATE, ARENA_RADIUS, PLAYER, COMBO_DECAY_MS, COMBO_TIERS,
  PICKUP_DROP_BASE, PICKUP_DROP_COMBO_BONUS, PICKUP_DESPAWN_MS, PICKUPS,
  WAVE_REST_MS, SCALING, ENEMY_DEFS,
  waveEnemyCount, enemyTypesForWave, scaleStat,
} from './config.js';

let nextEnemyId = 1;
let nextPickupId = 1;
let nextProjectileId = 1;

export function startGameLoop(roomManager) {
  setInterval(() => {
    roomManager.cleanup();
    for (const room of roomManager.activeRooms) {
      tickRoom(room);
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
  updateCombo(room);
  checkWaveClear(room);
  checkGameOver(room);
  room.broadcast(room.getStateSnapshot());
}

function updatePlayers(room, dt) {
  for (const [, p] of room.players) {
    if (!p.alive) continue;
    const dx = p.input.dx;
    const dz = p.input.dz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) {
      const speed = p.buffs.speed > 0 ? PLAYER.speed * 1.5 : PLAYER.speed;
      p.x += (dx / len) * speed * dt;
      p.z += (dz / len) * speed * dt;
    }
    const dist = Math.sqrt(p.x * p.x + p.z * p.z);
    if (dist > ARENA_RADIUS - 1) {
      const s = (ARENA_RADIUS - 1) / dist;
      p.x *= s; p.z *= s;
    }
    if (p.meleeCooldown > 0) p.meleeCooldown -= TICK_MS;
    if (p.specialCooldown > 0) p.specialCooldown -= TICK_MS;
    for (const buff in p.buffs) {
      if (p.buffs[buff] > 0) {
        p.buffs[buff] -= TICK_MS;
        if (p.buffs[buff] <= 0) delete p.buffs[buff];
      }
    }
    if (p.input.attack && p.meleeCooldown <= 0) {
      p.meleeCooldown = PLAYER.meleeCooldown;
      const aimAngle = Math.atan2(p.input.aimZ - p.z, p.input.aimX - p.x);
      meleeAttack(room, p, aimAngle);
    }
    if (p.input.special && p.specialCooldown <= 0) {
      p.specialCooldown = PLAYER.specialCooldown;
      specialAttack(room, p);
    }
    for (const [pkId, pk] of room.pickups) {
      const pdx = pk.x - p.x;
      const pdz = pk.z - p.z;
      if (pdx * pdx + pdz * pdz < 2.25) {
        applyPickup(p, pk);
        room.pickups.delete(pkId);
      }
    }
  }
}

function meleeAttack(room, player, aimAngle) {
  const baseDmg = pDamage(player);
  for (const [, e] of room.enemies) {
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > PLAYER.meleeRange) continue;
    const angle = Math.atan2(dz, dx);
    let diff = angle - aimAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.meleeArc / 2) continue;
    if (e.type === 'shielder') {
      const faceAngle = Math.atan2(player.z - e.z, player.x - e.x);
      let faceDiff = faceAngle - e.facing;
      while (faceDiff > Math.PI) faceDiff -= Math.PI * 2;
      while (faceDiff < -Math.PI) faceDiff += Math.PI * 2;
      if (Math.abs(faceDiff) < Math.PI / 3) continue;
    }
    const crit = Math.random() < PLAYER.critChance;
    const dmg = Math.floor(baseDmg * (crit ? PLAYER.critMultiplier : 1));
    damageEnemy(room, e, dmg, player, crit);
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
    if (dist > 0) {
      const kb = PLAYER.specialKnockback / dist;
      e.x += dx * kb; e.z += dz * kb;
    }
  }
}

function pDamage(player) {
  const base = PLAYER.damage + Math.floor(Math.random() * 4);
  return player.buffs.damage > 0 ? base * 2 : base;
}

function damageEnemy(room, enemy, dmg, player, crit) {
  enemy.hp -= dmg;
  room.broadcast({ t: 'hit', target: enemy.id, dmg, from: player.id, crit, pos: [enemy.x, 0, enemy.z] });
  if (enemy.hp <= 0) killEnemy(room, enemy, player);
}

function killEnemy(room, enemy, player) {
  room.enemies.delete(enemy.id);
  player.kills++;
  room.combo++;
  room.comboTimer = COMBO_DECAY_MS;
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
    setTimeout(() => bomberExplode(room, bx, bz), 2000);
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
  const actual = player.buffs.shield > 0 ? Math.floor(dmg * 0.5) : dmg;
  player.hp -= actual;
  room.broadcast({ t: 'hit', target: player.id, dmg: actual, from: 'enemy' });
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false;
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
          if (e.type === 'brute' && dist > 0) {
            const kb = 3 / dist;
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
          e.x += e.chargeVx * dt; e.z += e.chargeVz * dt;
          e.chargeTimer -= TICK_MS;
          for (const [, p] of room.players) {
            if (!p.alive) continue;
            const pdx = p.x - e.x; const pdz = p.z - e.z;
            if (pdx * pdx + pdz * pdz < 2) damagePlayer(room, p, e.damage);
          }
          if (e.chargeTimer <= 0) { e.aiState = 'idle'; e.chargeCooldown = 2000; }
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
          damagePlayer(room, target, e.damage); e.attackCooldown = 800;
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
    const edist = Math.sqrt(e.x * e.x + e.z * e.z);
    if (edist > ARENA_RADIUS + 5) {
      const s = (ARENA_RADIUS + 5) / edist; e.x *= s; e.z *= s;
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
    if (pr.age > 3000 || Math.sqrt(pr.x * pr.x + pr.z * pr.z) > ARENA_RADIUS + 5) {
      room.projectiles.delete(id); continue;
    }
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

function spawnProjectile(room, x, z, vx, vz, type, damage) {
  const id = 'pr' + nextProjectileId++;
  room.projectiles.set(id, { id, x, z, vx, vz, type, damage, age: 0 });
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
    room.comboTimer -= TICK_MS;
    if (room.comboTimer <= 0) room.combo = 0;
  }
}

function getComboTier(combo) {
  let tier = null;
  for (const t of COMBO_TIERS) { if (combo >= t.kills) tier = t; }
  return tier;
}

function spawnWave(room) {
  const wave = room.wave;
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
}

function spawnEnemy(room, type, wave) {
  const def = ENEMY_DEFS[type];
  const angle = Math.random() * Math.PI * 2;
  const spawnDist = ARENA_RADIUS + 3;
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
  if (room.state !== 'combat' || room.enemies.size > 0) return;
  room.score += room.wave * 25;
  for (const [, p] of room.players) {
    if (!p.alive) {
      p.alive = true; p.hp = Math.floor(p.maxHp * 0.5); p.x = 0; p.z = 0;
      room.broadcast({ t: 'respawn', pid: p.id, hp: p.hp });
    }
  }
  room.state = 'countdown';
  room.waveTimer = WAVE_REST_MS;
}

function checkGameOver(room) {
  if (room.state !== 'combat') return;
  if (![...room.players.values()].some(p => p.alive)) {
    room.state = 'gameover';
    const kills = {};
    for (const [, p] of room.players) kills[p.id] = p.kills;
    room.broadcast({ t: 'gameover', wave: room.wave, score: room.score, kills });
  }
}
