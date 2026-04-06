import { WebSocketServer } from 'ws';
import http from 'http';
import { RoomManager } from './room.js';
import { startGameLoop } from './game.js';

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
    }

    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', ts: msg.ts, serverTime: Date.now() }));
    }
  });

  ws.on('close', () => {
    if (room && player) room.removePlayer(player.id);
  });
});

startGameLoop(roomManager);

server.listen(PORT, () => {
  console.log(`SLAUGHTERDOME server on port ${PORT}`);
});
