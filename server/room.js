import { MAX_PLAYERS, MAX_ROOMS, ROOM_CLEANUP_MS, PLAYER, ARENA_RADIUS, WALL, OVERHEAT, DASH, SWORD, OBSTACLES } from './config.js';

let nextRoomId = 1;
let nextPlayerId = 1;

function generateObstacles() {
  const obstacles = [];
  const placed = [];
  // Trees -- always present
  for (let i = 0; i < OBSTACLES.treeCount; i++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = OBSTACLES.treeMinDist + Math.random() * (ARENA_RADIUS - OBSTACLES.treeMinDist - 3);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      let tooClose = false;
      for (const p of placed) {
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < OBSTACLES.treeSeparation * OBSTACLES.treeSeparation) { tooClose = true; break; }
      }
      if (!tooClose) {
        const ob = { type: 'tree', x, z, radius: OBSTACLES.treeRadius };
        obstacles.push(ob);
        placed.push(ob);
        break;
      }
    }
  }
  // Water pools -- added later via wave check
  for (let i = 0; i < OBSTACLES.waterCount; i++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = OBSTACLES.waterMinDist + Math.random() * (ARENA_RADIUS - OBSTACLES.waterMinDist - 5);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      let tooClose = false;
      for (const p of placed) {
        const minSep = p.type === 'water' ? OBSTACLES.waterSeparation : OBSTACLES.treeSeparation;
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < minSep * minSep) { tooClose = true; break; }
      }
      if (!tooClose) {
        const ob = { type: 'water', x, z, radius: OBSTACLES.waterRadius, active: false };
        obstacles.push(ob);
        placed.push(ob);
        break;
      }
    }
  }
  return obstacles;
}

export class Room {
  constructor() {
    this.id = 'room_' + nextRoomId++;
    this.players = new Map();
    this.state = 'waiting'; // waiting | countdown | combat | gameover
    this.wave = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.enemies = new Map();
    this.pickups = new Map();
    this.projectiles = new Map();
    this.walls = new Map();
    this.arenaRadius = ARENA_RADIUS;
    this.tick = 0;
    this.waveTimer = 0;
    this.cleanupTimer = null;
    this.obstacles = generateObstacles();
  }

  get playerCount() { return this.players.size; }
  get isFull() { return this.playerCount >= MAX_PLAYERS; }
  get isEmpty() { return this.playerCount === 0; }

  addPlayer(ws, name) {
    const id = 'p' + nextPlayerId++;
    const angle = Math.random() * Math.PI * 2;
    const player = {
      id, ws,
      name: name || 'Warrior_' + Math.floor(Math.random() * 9000 + 1000),
      x: Math.cos(angle) * 5, z: Math.sin(angle) * 5,
      hp: PLAYER.hp, maxHp: PLAYER.hp, alive: true,
      buffs: {}, kills: 0,
      input: { dx: 0, dz: 0, attack: false, special: false, aimX: 0, aimZ: 0, wall: false, sword: false },
      shootCooldown: 0, specialCooldown: 0,
      wallCharges: WALL.charges, wallPlaceCooldown: 0, wallRechargeTimer: 0,
      dashTimer: 0, dashDirX: 0, dashDirZ: 0, dashIframes: 0,
      dashCharges: DASH.charges, dashRechargeTimer: 0, dashChainTimer: 0,
      swordCombo: 0, swordCooldown: 0, swordComboTimer: 0,
      shotsFired: 0,
      upgrades: {}, weapon: 'pistol', pendingUpgrades: null,
      heatTimer: 0, overheated: false, overheatCooldown: 0,
    };
    this.players.set(id, player);
    if (this.cleanupTimer) { clearTimeout(this.cleanupTimer); this.cleanupTimer = null; }
    this.broadcast({ t: 'join', id, name: player.name });
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.broadcast({ t: 'leave', pid: playerId });
    if (this.isEmpty) {
      this.cleanupTimer = setTimeout(() => { this.destroy(); }, ROOM_CLEANUP_MS);
    }
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const [, p] of this.players) {
      try {
        if (p.ws.readyState === 1) p.ws.send(data);
      } catch (e) { /* socket died mid-send */ }
    }
  }

  sendTo(playerId, msg) {
    const p = this.players.get(playerId);
    try {
      if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
    } catch (e) { /* socket died mid-send */ }
  }

  destroy() { this.state = 'destroyed'; }

  getStateSnapshot() {
    const players = [];
    for (const [, p] of this.players) {
      players.push({
        id: p.id, name: p.name,
        pos: [Math.round(p.x * 100) / 100, 0, Math.round(p.z * 100) / 100],
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        buffs: Object.keys(p.buffs).filter(b => p.buffs[b] > 0),
        dashing: p.dashTimer > 0,
        dashCharges: p.dashCharges,
        swordCombo: p.swordCombo,
        swordCd: Math.max(0, p.swordCooldown),
        upgrades: p.upgrades,
        weapon: p.weapon,
        overheated: p.overheated,
        heatPct: p.overheated
          ? p.overheatCooldown / OVERHEAT.slowMs
          : p.heatTimer / OVERHEAT.fastMs,
        wallCharges: p.wallCharges,
        specialCd: Math.max(0, p.specialCooldown),
        kills: p.kills,
        shotsFired: p.shotsFired,
      });
    }
    const enemies = [];
    for (const [, e] of this.enemies) {
      enemies.push({
        id: e.id, type: e.type,
        pos: [Math.round(e.x * 100) / 100, 0, Math.round(e.z * 100) / 100],
        hp: e.hp, maxHp: e.maxHp, state: e.aiState,
      });
    }
    const pickups = [];
    for (const [, pk] of this.pickups) {
      pickups.push({ id: pk.id, type: pk.type, pos: [pk.x, 0, pk.z], age: pk.age });
    }
    const projectiles = [];
    for (const [, pr] of this.projectiles) {
      projectiles.push({ id: pr.id, pos: [pr.x, 0, pr.z], vel: [pr.vx, 0, pr.vz], type: pr.type });
    }
    const walls = [];
    for (const [, w] of this.walls) {
      walls.push({ id: w.id, pos: [w.x, 0, w.z], angle: w.angle, hp: w.hp, maxHp: w.maxHp });
    }
    const obstacles = this.obstacles
      .filter(o => o.type === 'tree' || o.active)
      .map(o => ({ type: o.type, pos: [Math.round(o.x * 100) / 100, 0, Math.round(o.z * 100) / 100], radius: o.radius }));
    return {
      t: 'state', tick: this.tick,
      players, enemies, pickups, projectiles, walls, obstacles,
      wave: this.wave, score: this.score, combo: this.combo, phase: this.state,
      arenaRadius: this.arenaRadius, waveTimer: this.waveTimer,
      playerCount: this.playerCount,
    };
  }
}

export class RoomManager {
  constructor() { this.rooms = new Map(); }

  findOrCreate() {
    for (const [, room] of this.rooms) {
      if (!room.isFull && room.state !== 'destroyed' && room.state !== 'gameover') return room;
    }
    if (this.activeRooms.length >= MAX_ROOMS) return null;
    const room = new Room();
    this.rooms.set(room.id, room);
    return room;
  }

  cleanup() {
    for (const [id, room] of this.rooms) {
      if (room.state === 'destroyed') this.rooms.delete(id);
    }
  }

  get activeRooms() {
    return [...this.rooms.values()].filter(r => r.state !== 'destroyed');
  }
}
