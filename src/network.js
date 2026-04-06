let ws = null;
let connected = false;
let myId = null;
let latestState = null;
let eventQueue = [];
let pingMs = 0;
let lastName = '';
let reconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 1000;

const WS_URL = window.SLAUGHTERDOME_WS || (
  location.hostname === 'localhost'
    ? 'ws://localhost:3001'
    : 'wss://slaughterdome-server-production.up.railway.app'
);

export function connect(name) {
  lastName = name;
  reconnectAttempts = 0;
  reconnecting = false;
  return doConnect(name, true);
}

function doConnect(name, isInitial) {
  return new Promise((resolve, reject) => {
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      reject(err);
      return;
    }
    ws.onopen = () => {
      connected = true;
      reconnecting = false;
      reconnectAttempts = 0;
      showDisconnect(false);
      ws.send(JSON.stringify({ t: 'join', name }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        myId = msg.id;
        if (isInitial) resolve(myId);
      } else if (msg.t === 'state') {
        latestState = msg;
      } else if (msg.t === 'pong') {
        pingMs = Date.now() - msg.ts;
      } else {
        eventQueue.push(msg);
      }
    };
    ws.onclose = () => {
      connected = false;
      if (myId && !reconnecting) tryReconnect();
    };
    ws.onerror = () => {
      if (isInitial && !connected) reject(new Error('WebSocket connection failed'));
    };
  });
}

function tryReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showDisconnect(true, 'Connection lost');
    return;
  }
  reconnecting = true;
  reconnectAttempts++;
  showDisconnect(true, 'Reconnecting...');
  const delay = RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts - 1);
  setTimeout(() => {
    doConnect(lastName, false).catch(() => {
      tryReconnect();
    });
  }, delay);
}

function showDisconnect(show, text) {
  let el = document.getElementById('disconnect-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'disconnect-msg';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff4444;font-family:inherit;font-size:18px;font-weight:700;letter-spacing:2px;z-index:100;text-align:center;pointer-events:none;display:none;';
    document.body.appendChild(el);
  }
  el.style.display = show ? 'block' : 'none';
  if (text) el.textContent = text;
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
