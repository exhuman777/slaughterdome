let ws = null;
let connected = false;
let myId = null;
let latestState = null;
let eventQueue = [];
let pingMs = 0;

const WS_URL = window.SLAUGHTERDOME_WS || (
  location.hostname === 'localhost'
    ? 'ws://localhost:3001'
    : 'wss://slaughterdome-server-production.up.railway.app'
);

export function connect(name) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      connected = true;
      ws.send(JSON.stringify({ t: 'join', name }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        myId = msg.id;
        resolve(myId);
      } else if (msg.t === 'state') {
        latestState = msg;
      } else if (msg.t === 'pong') {
        pingMs = Date.now() - msg.ts;
      } else {
        eventQueue.push(msg);
      }
    };
    ws.onclose = () => { connected = false; };
    ws.onerror = () => { reject(new Error('WebSocket connection failed')); };
  });
}

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

export function sendPing() {
  if (!connected || !ws) return;
  ws.send(JSON.stringify({ t: 'ping', ts: Date.now() }));
}

export function getState() { return latestState; }
export function getMyId() { return myId; }
export function getPing() { return pingMs; }
export function isConnected() { return connected; }

export function sendUpgradePick(index) {
  if (!connected || !ws) return;
  ws.send(JSON.stringify({ t: 'pick_upgrade', index }));
}

export function drainEvents() {
  const events = eventQueue;
  eventQueue = [];
  return events;
}
