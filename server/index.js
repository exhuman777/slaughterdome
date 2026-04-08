import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './room.js';
import { startGameLoop, applyUpgrade } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const MAX_LEADERBOARD = 20;

function loadLeaderboard() {
  try { return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8')); }
  catch { return []; }
}

function saveLeaderboard(lb) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(lb));
}

function addScore(name, score, wave, kills, shotsFired) {
  const lb = loadLeaderboard();
  lb.push({ name, score, wave, kills, shotsFired, date: Date.now() });
  lb.sort((a, b) => b.score - a.score);
  if (lb.length > MAX_LEADERBOARD) lb.length = MAX_LEADERBOARD;
  saveLeaderboard(lb);
  return lb;
}

const PORT = process.env.PORT || 3001;
const roomManager = new RoomManager();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: roomManager.activeRooms.length }));
    return;
  }
  if (req.url === '/leaderboard') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadLeaderboard()));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null;
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'join' && !player) {
      room = roomManager.findOrCreate();
      if (!room) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Server full' }));
        return;
      }
      player = room.addPlayer(ws, msg.name);
      ws.send(JSON.stringify({ t: 'joined', id: player.id, roomId: room.id }));
    }

    if (msg.t === 'input' && player) {
      player.input.dx = Number(msg.d?.[0]) || 0;
      player.input.dz = Number(msg.d?.[1]) || 0;
      player.input.attack = !!msg.a;
      player.input.special = !!msg.s;
      player.input.aimX = Number(msg.aim?.[0]) || 0;
      player.input.aimZ = Number(msg.aim?.[2]) || 0;
      player.input.wall = !!msg.w;
      player.input.dash = !!msg.dash;
      player.input.sword = !!msg.sw;
    }

    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', ts: msg.ts, serverTime: Date.now() }));
    }

    if (msg.t === 'pick_upgrade' && player) {
      const idx = Number(msg.index);
      if (player.pendingUpgrades && idx >= 0 && idx < player.pendingUpgrades.length) {
        applyUpgrade(player, player.pendingUpgrades[idx].key);
        player.pendingUpgrades = null;
      }
    }
  });

  ws.on('close', () => {
    if (room && player) room.removePlayer(player.id);
  });
});

startGameLoop(roomManager, addScore);

server.listen(PORT, () => {
  console.log(`SLAUGHTERDOME server on port ${PORT}`);
});
