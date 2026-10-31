import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { PRESETS, RULES, type ClientMsg, type ServerMsg } from '@echo/shared';
import { Lobby } from './game.ts';
import { openStore } from './store.ts';
import { parseClientMsg } from './validate.ts';

const PORT = Number(process.env.PORT ?? 8787);
const sockets = new Map<string, WebSocket>(); // playerId -> socket

const sendTo = (playerId: string, msg: ServerMsg) => {
  const ws = sockets.get(playerId);
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  if (msg.t === 'kicked') sockets.delete(playerId); // removed / left / dropped: no more views to that phone
};
const lobby = new Lobby(sendTo);
// default DB lives next to the server package, wherever the command is run from
const store = openStore(process.env.ECHO_DB ?? fileURLToPath(new URL('../data/echo.db', import.meta.url)), lobby, sendTo);
setInterval(() => lobby.tick(Date.now()), 250);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { store.close(); process.exit(0); });

const app = Fastify({ logger: { level: 'info' }, disableRequestLogging: true, trustProxy: (_addr: string, hop: number) => hop === 0 /* trust only the one proxy (Caddy) in front, not client-supplied X-Forwarded-For chains */, bodyLimit: 16 * 1024 });
app.log.info(`restored ${store.restored} match(es) from disk`);
await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

app.get('/health', async () => ({ ok: true, matches: lobby.matches.size, presets: Object.keys(PRESETS) }));

// ponytail: in-memory per-IP limiter; fine for one process.
const ipHits = new Map<string, { n: number; reset: number }>();
const allow = (ip: string, now: number, max = 20) => {
  const h = ipHits.get(ip);
  if (!h || now > h.reset) { ipHits.set(ip, { n: 1, reset: now + 60_000 }); return true; }
  return ++h.n <= max;
};
setInterval(() => { const now = Date.now(); for (const [ip, h] of ipHits) if (now > h.reset) ipHits.delete(ip); }, 60_000);

// Background location uplink: the native task posts here when the socket is asleep (screen locked).
app.post('/loc', async (req, reply) => {
  const now = Date.now();
  const b = req.body as { token?: unknown; samples?: unknown };
  // authenticate before touching limiter memory; limit per player, not IP (a campus can share one NAT address)
  const found = typeof b?.token === 'string' ? lobby.find(b.token) : undefined;
  if (!found || !found.match.players.has(found.playerId)) return reply.code(401).send({ ok: false, stop: true });
  if (!allow(`loc:${found.playerId}`, now, 60)) return reply.code(429).send({ ok: false });
  const samples = Array.isArray(b.samples) ? b.samples.slice(0, RULES.maxBatch) : [];
  for (const raw of samples) {
    const msg = parseClientMsg(JSON.stringify({ ...raw, t: 'loc' }));
    if (msg?.t === 'loc') found.match.handle(found.playerId, msg, now);
  }
  found.match.touch(found.playerId, now);
  const m = found.match, p = m.players.get(found.playerId)!;
  // A locked phone's only link: tell it about pauses and the end so it can alert the player (and stop tracking).
  return { ok: true, stop: p.status !== 'active' || m.phase === 'ended', phase: m.phase, status: p.status, paused: m.paused ? { reason: m.paused.reason, by: m.paused.by } : null };
});

let openSockets = 0;
const MAX_SOCKETS = 2000;
// IPv6 clients can rotate through a whole /64: rate-limit by prefix.
const ipKey = (ip: string) => (ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip);

app.get('/ws', { websocket: true }, (ws, req) => {
  const ip = ipKey(req.ip);
  if (++openSockets > MAX_SOCKETS) { openSockets--; ws.close(1013, 'busy'); return; }
  let msgBudget = 40; // token bucket: ~20 msgs/s sustained per socket
  const refill = setInterval(() => { msgBudget = Math.min(40, msgBudget + 20); }, 1000);
  let ref: { playerId: string; code: string } | undefined;
  let lastMsgAt = Date.now();
  // Heartbeat: a dead phone never sends FIN; kill sockets silent for too long so the player shows offline.
  const hb = setInterval(() => { if (Date.now() - lastMsgAt > RULES.heartbeatTimeoutMs) ws.terminate(); }, 5000);
  let joins = 0;
  const reply = (msg: ServerMsg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

  const bind = (playerId: string, code: string, token: string) => {
    const old = sockets.get(playerId);
    if (old && old !== ws) old.close(4000, 'replaced'); // one device session per player
    sockets.set(playerId, ws);
    ref = { playerId, code };
    reply({ t: 'session', token, playerId, code });
  };

  ws.on('message', (raw) => {
    const now = Date.now();
    lastMsgAt = now;
    if (--msgBudget < 0) return; // drop floods silently
    // kicked / match deleted: drop the stale binding so this socket can join again
    const cur = ref && lobby.matches.get(ref.code)?.players.get(ref.playerId);
    if (ref && (!cur || cur.status === 'withdrawn' || sockets.get(ref.playerId) !== ws)) { if (sockets.get(ref.playerId) === ws) sockets.delete(ref.playerId); ref = undefined; }
    const msg: ClientMsg | null = parseClientMsg(raw.toString());
    if (!msg) return reply({ t: 'error', msg: 'Bad message' });
    if (msg.t === 'ping') { if (ref) lobby.matches.get(ref.code)?.touch(ref.playerId, now); return reply({ t: 'pong', c0: msg.c0, s: now }); }

    if (msg.t === 'create' || msg.t === 'join') {
      if (ref) return reply({ t: 'error', msg: 'Already in a match' });
      const limited = msg.t === 'create' ? !allow(`create:${ip}`, now, 6) : !allow(`join:${ip}`, now, 40);
      if (++joins > 10 || limited) return reply({ t: 'error', msg: 'Too many attempts, wait a minute' });
      const r = msg.t === 'create' ? lobby.create(msg.alias, now) : lobby.join(msg.code, msg.alias, now);
      if (typeof r === 'string') return reply({ t: 'error', msg: r });
      bind(r.player.id, r.match.code, r.token);
      r.match.broadcast(now);
      app.log.info(`${msg.t} ${r.match.code} "${r.player.alias}" (${r.match.players.size} in match)`);
      return;
    }
    if (msg.t === 'hello') {
      if (ref) return reply({ t: 'error', msg: 'Already in a match' });
      if (!allow(`hello:${ip}`, now, 240)) { reply({ t: 'error', msg: 'Server busy — retrying' }); ws.close(1013, 'busy'); return; } // client backoff reconnects
      const found = lobby.find(msg.token);
      if (!found || !found.match.players.has(found.playerId)) return reply({ t: 'kicked', reason: 'That match has ended or the server was reset. Ask the host for a new code.' });
      bind(found.playerId, found.match.code, msg.token);
      found.match.setConnected(found.playerId, true, now);
      app.log.info(`reconnect ${found.match.code} "${found.match.players.get(found.playerId)?.alias}"`);
      return;
    }
    if (!ref) return reply({ t: 'error', msg: 'Join a match first' });
    const m = lobby.matches.get(ref.code);
    if (!m) return reply({ t: 'kicked', reason: 'Match closed' });
    const err = m.handle(ref.playerId, msg, now);
    if (err) reply({ t: 'error', msg: err });
    if (!err && ['start', 'pause', 'resume', 'endRound', 'rematch', 'leave', 'dropPlayer', 'kick'].includes(msg.t))
      app.log.info(`${msg.t} ${m.code} by "${m.players.get(ref.playerId)?.alias ?? '?'}" → phase ${m.phase}${m.paused ? ` (paused: ${m.paused.reason})` : ''}`);
    if (msg.t === 'leave') { sockets.delete(ref.playerId); ref = undefined; }
  });

  ws.on('close', () => {
    clearInterval(refill); clearInterval(hb); openSockets--;
    if (!ref || sockets.get(ref.playerId) !== ws) return;
    sockets.delete(ref.playerId);
    const mm = lobby.matches.get(ref.code);
    mm?.setConnected(ref.playerId, false, Date.now());
    app.log.info(`disconnect ${ref.code} "${mm?.players.get(ref.playerId)?.alias ?? '?'}"`);
  });
});

await app.listen({ host: '0.0.0.0', port: PORT });
// Tell the organiser exactly what players type into ECHO (Server on the home screen).
const { networkInterfaces } = await import('node:os');
const virtual = /^(docker|br-|veth|virbr|vmnet|tun|tap|wg|zt|tailscale|cloudflare|utun|lo)/i; // skip VPN/container adapters
const lan = Object.entries(networkInterfaces()).filter(([name]) => !virtual.test(name))
  .flatMap(([, as]) => as ?? []).filter(a => a.family === 'IPv4' && !a.internal).map(a => a.address);
console.log('\n  ECHO server is running. Players enter one of these in ECHO → Server:');
for (const ip of lan) console.log(`    ${ip}      (= ws://${ip}:${PORT}/ws)`);
if (!lan.length) console.log('    (no Wi-Fi/Ethernet address found — is this machine on the network?)');
console.log('');
