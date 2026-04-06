import { MAX_PLAYERS, ROOM_CLEANUP_MS, PLAYER, ARENA_RADIUS, WALL, WEAPONS } from './config.js';

let nextRoomId = 1;
let nextPlayerId = 1;

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
      input: { dx: 0, dz: 0, attack: false, special: false, aimX: 0, aimZ: 0, wall: false },
      shootCooldown: 0, specialCooldown: 0,
      wallCharges: WALL.charges, wallPlaceCooldown: 0, wallRechargeTimer: 0,
      dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirZ: 0, dashIframes: 0,
      upgrades: {}, weapon: 'pistol', pendingUpgrades: null,
      ammo: WEAPONS.pistol.magSize, reloadTimer: 0,
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
      if (p.ws.readyState === 1) p.ws.send(data);
    }
  }

  sendTo(playerId, msg) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
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
        dashCooldown: p.dashCooldown,
        upgrades: p.upgrades,
        weapon: p.weapon,
        ammo: p.ammo,
        reloading: p.reloadTimer > 0,
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
    return {
      t: 'state', tick: this.tick,
      players, enemies, pickups, projectiles, walls,
      wave: this.wave, score: this.score, combo: this.combo, phase: this.state,
      arenaRadius: this.arenaRadius, waveTimer: this.waveTimer,
    };
  }
}

export class RoomManager {
  constructor() { this.rooms = new Map(); }

  findOrCreate() {
    for (const [, room] of this.rooms) {
      if (!room.isFull && room.state !== 'destroyed' && room.state !== 'gameover') return room;
    }
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
