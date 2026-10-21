// Game server: serves the built client and relays/arbitrates multiplayer state over WebSockets.
// Movement and hit detection run on clients; the server owns health, scores, loot, vehicles and the pogo stick.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ABANDONED_VEHICLE_SECONDS, ANIMALS, LOOT_RESPAWN_SECONDS, MAX_HEALTH, MAX_PLAYERS, PICKUP_RADIUS,
  POGO_GRAB_RADIUS, RESPAWN_SECONDS, SNAPSHOT_HZ, STARTING_WEAPON, VEHICLE_ENTER_RADIUS,
  VEHICLE_RESPAWN_DISTANCE, WEAPONS, WEAPON_IDS,
  type ClientMsg, type LootGrant, type LootState, type PlayerInfo, type PlayerSnapshot, type PogoState,
  type ServerMsg, type Vec3, type VehicleState, type WeaponId,
} from '../shared/protocol.ts';
import {
  LOOT_SPAWNS, PLAYER_SPAWNS, POGO_START, VEHICLE_SPAWNS, allColliders, surfaceBelow,
} from '../shared/map.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const BONK_DAMAGE = 20;
const BONK_KNOCKBACK = 12;
const HEALTH_BOX_AMOUNT = 40;

interface Client {
  ws: WebSocket;
  info: PlayerInfo;
  snap: PlayerSnapshot | null;
  respawnAt: number | null;
  lastBonked: number;
}

const clients = new Map<number, Client>();
let nextId = 1;

const loot: (LootState & { respawnAt: number | null })[] = LOOT_SPAWNS.map((p, id) => ({
  id, p, active: true, respawnAt: null,
}));

const colliders = allColliders();

interface ServerVehicle extends VehicleState {
  /** When it was last left empty (ms), or null while someone drives it. */
  emptySince: number | null;
}

const vehicles = new Map<number, ServerVehicle>();
let nextVehicleId = 0;
/** Last driver of each vehicle, allowed to park it after being splatted out of it. */
const lastDriver = new Map<number, number>();

function spawnVehicle(slot: number): number {
  const s = VEHICLE_SPAWNS[slot];
  const id = nextVehicleId++;
  vehicles.set(id, {
    id,
    kind: s.kind,
    p: [...s.p],
    q: [0, Math.sin(s.yaw / 2), 0, Math.cos(s.yaw / 2)],
    driver: null,
    emptySince: null,
  });
  return id;
}

/** The vehicle currently waiting at each spawn spot. */
const slotVehicle = VEHICLE_SPAWNS.map((_, slot) => spawnVehicle(slot));

function vehicleStates(): VehicleState[] {
  return [...vehicles.values()].map(({ id, kind, p, q, driver }) => ({ id, kind, p, q, driver }));
}

const pogo: PogoState = { holder: null, p: [...POGO_START] };

function dropPogo(at: Vec3) {
  pogo.holder = null;
  pogo.p = [at[0], surfaceBelow(at[0], at[1], at[2], colliders), at[2]];
  broadcast({ t: 'pogo', pogo });
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg, except?: number) {
  const data = JSON.stringify(msg);
  for (const [id, c] of clients) {
    if (id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}

function infos(): PlayerInfo[] {
  return [...clients.values()].map((c) => c.info);
}

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function vehicleOf(playerId: number) {
  for (const v of vehicles.values()) if (v.driver === playerId) return v;
  return null;
}

function releaseVehicle(playerId: number, exitP: Vec3 | null) {
  const v = vehicleOf(playerId);
  if (!v) return;
  v.driver = null;
  v.emptySince = Date.now();
  broadcast({ t: 'driver', vehicle: v.id, driver: null, exitP });
}

function spawn(c: Client) {
  const s = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
  c.info.health = MAX_HEALTH;
  c.info.alive = true;
  c.respawnAt = null;
  c.snap = null;
  broadcast({ t: 'respawn', id: c.info.id, p: s.p, yaw: s.yaw });
}

function damage(target: Client, attacker: Client | null, amount: number, knock: Vec3, cause: WeaponId | 'bonk') {
  target.info.health = Math.max(0, target.info.health - amount);
  broadcast({ t: 'health', id: target.info.id, health: target.info.health, attacker: attacker?.info.id ?? null, knock });
  if (target.info.health > 0) return;

  target.info.alive = false;
  target.info.splatted++;
  if (attacker && attacker !== target) attacker.info.splats++;
  target.respawnAt = Date.now() + RESPAWN_SECONDS * 1000;
  releaseVehicle(target.info.id, target.snap?.p ?? null);
  if (pogo.holder === target.info.id) dropPogo(target.snap?.p ?? pogo.p);
  broadcast({ t: 'splat', target: target.info.id, attacker: attacker?.info.id ?? null, weapon: cause, players: infos() });
}

function rollGrant(): LootGrant {
  const r = Math.random();
  if (r < 0.35) return { kind: 'health', amount: HEALTH_BOX_AMOUNT };
  if (r < 0.65) return { kind: 'ammo' };
  const options = WEAPON_IDS.filter((w) => w !== STARTING_WEAPON);
  const weapon = options[Math.floor(Math.random() * options.length)];
  return { kind: 'weapon', weapon, amount: WEAPONS[weapon].startAmmo };
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function handle(c: Client, msg: ClientMsg) {
  const me = c.info;
  switch (msg.t) {
    case 'join':
      return; // Only valid as the first message.

    case 'state': {
      if (!me.alive || !isVec3(msg.p)) return;
      const veh = vehicleOf(me.id);
      c.snap = {
        id: me.id, p: msg.p, yaw: msg.yaw, pitch: msg.pitch, anim: msg.anim,
        weapon: msg.weapon, vehicle: veh?.id ?? null,
      };
      if (veh && msg.veh) {
        veh.p = msg.veh.p;
        veh.q = msg.veh.q;
      }
      return;
    }

    case 'fire': {
      if (!me.alive || !WEAPONS[msg.weapon] || !isVec3(msg.origin)) return;
      broadcast({ t: 'fire', id: me.id, weapon: msg.weapon, origin: msg.origin, dirs: msg.dirs.slice(0, 8) }, me.id);
      return;
    }

    case 'hit': {
      const target = clients.get(msg.target);
      const def = WEAPONS[msg.weapon];
      if (!target || target === c || !def || !me.alive || !target.info.alive || !isVec3(msg.dir)) return;
      const knock: Vec3 = [msg.dir[0] * def.knockback, msg.dir[1] * def.knockback, msg.dir[2] * def.knockback];
      damage(target, c, def.damage, knock, msg.weapon);
      return;
    }

    case 'bonk': {
      const target = clients.get(msg.target);
      const now = Date.now();
      if (!target || target === c || !vehicleOf(me.id) || !target.info.alive || !isVec3(msg.dir)) return;
      if (now - target.lastBonked < 800) return;
      target.lastBonked = now;
      const knock: Vec3 = [msg.dir[0] * BONK_KNOCKBACK, 6, msg.dir[2] * BONK_KNOCKBACK];
      damage(target, c, BONK_DAMAGE, knock, 'bonk');
      return;
    }

    case 'pickup': {
      const box = loot[msg.loot];
      if (!box || !box.active || !me.alive || !c.snap) return;
      if (dist(box.p, c.snap.p) > PICKUP_RADIUS + 2) return;
      const grant = rollGrant();
      box.active = false;
      box.respawnAt = Date.now() + LOOT_RESPAWN_SECONDS * 1000;
      broadcast({ t: 'loot', id: box.id, active: false, by: me.id, grant });
      if (grant.kind === 'health') {
        me.health = Math.min(MAX_HEALTH, me.health + grant.amount);
        broadcast({ t: 'health', id: me.id, health: me.health, attacker: null, knock: null });
      }
      return;
    }

    case 'enter': {
      const v = vehicles.get(msg.vehicle);
      if (!v || v.driver !== null || !me.alive || vehicleOf(me.id) || !c.snap || pogo.holder === me.id) return;
      if (dist(v.p, c.snap.p) > VEHICLE_ENTER_RADIUS + 2) return;
      v.driver = me.id;
      v.emptySince = null;
      lastDriver.set(v.id, me.id);
      broadcast({ t: 'driver', vehicle: v.id, driver: me.id, exitP: null });
      return;
    }

    case 'exit': {
      const v = vehicleOf(me.id) ?? [...vehicles.values()].find((x) => x.driver === null && lastDriver.get(x.id) === me.id);
      if (!v || !msg.veh || !isVec3(msg.veh.p)) return;
      v.p = msg.veh.p;
      v.q = msg.veh.q;
      lastDriver.delete(v.id);
      if (v.driver === me.id) releaseVehicle(me.id, isVec3(msg.p) ? msg.p : null);
      return;
    }

    case 'pogoGrab': {
      if (pogo.holder !== null || !me.alive || !c.snap || vehicleOf(me.id)) return;
      if (dist(pogo.p, c.snap.p) > POGO_GRAB_RADIUS + 2) return;
      pogo.holder = me.id;
      broadcast({ t: 'pogo', pogo });
      return;
    }
  }
}

// --- HTTP: serve the production client build ---
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

const http = createServer((req, res) => {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('Client not built. Run `npm run build`, or use `npm run dev` and open http://localhost:5173');
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

// --- WebSocket: game protocol ---
const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (ws) => {
  let client: Client | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!client) {
      if (msg.t !== 'join') return;
      if (clients.size >= MAX_PLAYERS) {
        send(ws, { t: 'full' });
        ws.close();
        return;
      }
      const id = nextId++;
      client = {
        ws,
        snap: null,
        respawnAt: null,
        lastBonked: 0,
        info: {
          id,
          name: String(msg.name).slice(0, 16).trim() || `Player ${id}`,
          animal: ANIMALS.includes(msg.animal) ? msg.animal : 'panda',
          health: MAX_HEALTH, alive: true, splats: 0, splatted: 0,
        },
      };
      clients.set(id, client);
      send(ws, { t: 'welcome', id, players: infos(), loot, vehicles: vehicleStates(), pogo });
      broadcast({ t: 'joined', player: client.info }, id);
      spawn(client);
      console.log(`+ ${client.info.name} (${client.info.animal}) joined — ${clients.size} online`);
      return;
    }
    handle(client, msg);
  });

  ws.on('close', () => {
    if (!client) return;
    releaseVehicle(client.info.id, null);
    if (pogo.holder === client.info.id) dropPogo(client.snap?.p ?? pogo.p);
    clients.delete(client.info.id);
    broadcast({ t: 'left', id: client.info.id });
    console.log(`- ${client.info.name} left — ${clients.size} online`);
  });
});

/**
 * Keeps a fresh vehicle waiting at every spawn spot, and clears away vehicles that were
 * driven off and abandoned (e.g. a plane parked on a roof).
 */
function updateVehicleSpawns(now: number) {
  VEHICLE_SPAWNS.forEach((spawnPoint, slot) => {
    const v = vehicles.get(slotVehicle[slot]);
    if (v && Math.hypot(v.p[0] - spawnPoint.p[0], v.p[2] - spawnPoint.p[2]) < VEHICLE_RESPAWN_DISTANCE) return;
    if (v) v.emptySince ??= v.driver === null ? now : null;
    slotVehicle[slot] = spawnVehicle(slot);
  });
  const waiting = new Set(slotVehicle);
  for (const v of vehicles.values()) {
    if (waiting.has(v.id) || v.driver !== null || v.emptySince === null) continue;
    if (now - v.emptySince >= ABANDONED_VEHICLE_SECONDS * 1000) {
      vehicles.delete(v.id);
      lastDriver.delete(v.id);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const c of clients.values()) {
    if (c.respawnAt !== null && now >= c.respawnAt) spawn(c);
  }
  for (const box of loot) {
    if (box.respawnAt !== null && now >= box.respawnAt) {
      box.active = true;
      box.respawnAt = null;
      broadcast({ t: 'loot', id: box.id, active: true, by: null, grant: null });
    }
  }
  updateVehicleSpawns(now);
  const players = [...clients.values()].filter((c) => c.info.alive && c.snap).map((c) => c.snap!);
  broadcast({ t: 'snap', players, vehicles: vehicleStates() });
}, 1000 / SNAPSHOT_HZ);

http.listen(PORT, () => {
  console.log(`Tokyo Toy Brawl server on http://localhost:${PORT}`);
});
