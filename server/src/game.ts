// Authoritative match logic. Pure w.r.t. time: every entry point takes `now`.
// ponytail: single process; state snapshotted to SQLite (store.ts) and restored into a recovery pause.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { worlds } from './worlds.ts';
import { graphFor, routeJudge } from './graph.ts';
import {
  CODE_LENGTH, PRESETS, RULES, SHRINK, cellRing, clearlyOutside, distanceM, fromLocal, inZone, rimInZone, startPoint, zoneCircle, zoneOrigin,
  POWERS, ITEM_FOR, INFECTION, SLASH, type Circle, type ItemType, type GameMode, type CatchMethod,
  type ClientMsg, type Disclosure, type GameEvent, type LngLat, type Phase, type PlayerSummary,
  type PauseReason, type PauseState, type PresetId, type Result, type Role, type ServerMsg, type View, type Zone,
} from '@echo/shared';

type Send = (playerId: string, msg: ServerMsg) => void;
type Fix = { p: LngLat; acc: number; measuredAt: number; ts?: number }; // ts: device fix timestamp (dedupe key)
/** Tokens are stored hashed. Note: live catch codes are in the snapshot in plaintext (LAN playtest; restrict file access). */
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

interface Player {
  id: string;
  tokenHash: string;
  alias: string;
  role: Role;
  ready: boolean;
  connected: boolean;
  status: PlayerSummary['status'];
  loc?: Fix; // latest
  fixes: Fix[]; // bounded private quality buffer (≤ RULES.fixBufferMs), never sent anywhere
  lastContact: number; // any message or upload
  lostAck: boolean; // host resumed while this player was unreachable; don't re-pause until they're back
  recentTs: number[]; // device fix timestamps seen recently (dedupes WS + HTTP double uploads)
  alerts: boolean;
  pauses: number; // safety pauses used this round
  techPaused: boolean; // already caused a technical pause this round: next time just "signal unavailable"
  // Phase 2 powers
  items: { id: string; type: ItemType; reserved: boolean }[];
  frozenUntil: number; // hunter
  immuneUntil: number; // hunter
  freezeEndSent: boolean;
  sweepReadyAt: number; // hunter
  catchCode?: string;
  wrongGuesses: number; // hunter: wrong codes since last cooldown
  lockedUntil: number; // hunter: capture cooldown after repeated wrong codes
  hadFix: boolean;
  // Phase 3.5
  origRole?: Role; // role at round start (infection flips runners to hunter for a while)
  infectedUntil: number;
  shieldUntil: number; // just cured: can't be caught
  bleId?: string; // slash: what this runner's phone advertises
  slashReadyAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 16;
const MAX_MATCHES = 500;

export class Match {
  phase: Phase = 'lobby';
  hostId = '';
  ownerId = ''; // who created the match; gets host back when they reconnect
  participants: string[] = [];
  usedCodes = new Set<string>(); // codes of runners already caught this round
  degraded = false;
  contact = '';
  // world pack (Phase 3): pinned per match
  worldId: string | null = worlds.size === 1 ? [...worlds.keys()][0] : null;
  worldHash?: string; // hash pinned at round start (G01: one world version per round)
  // powers (Phase 2)
  powersOn = true;
  mode: GameMode = 'classic';
  infectMs: number = INFECTION.defaultMs;
  catchMethod: CatchMethod = 'code';
  routeSweep = false; // Phase 4: Sweep measures legal walking distance on the world's route graph (needs a world)
  offers = new Map<string, { id: string; casterId: string; targetId: string; itemId: string; expiresAt: number }>();
  retry = new Map<string, number>(); // `${caster}|${target}` -> chase-time until a failed Freeze can be retried
  sweepHits = new Map<string, Disclosure[]>(); // hunterId -> private sweep results
  stations: { id: string; p: LngLat; gen: number; availableAt: number }[] = [];
  claims = new Map<string, { stationId: string; gen: number; startedAt: number; fixTs: number[]; lastAt: number }>();
  ackReceipts = new Map<string, { targetId: string; until: number }>(); // offerId -> result, so a retried ack gets the same answer
  // shrinking zone
  shrinkOn = true;
  stages: { circle: Circle; at: number; announced: boolean }[] = [];
  stageIdx = 0;
  zoneNow?: Circle;
  graceUntil?: number;
  exposeNextAt?: number;
  presetId: PresetId = 'quick'; // first sessions: short rounds so early catches don't sit out long
  zone: Zone | null = null;
  players = new Map<string, Player>();
  headStartEndsAt?: number;
  chaseStartedAt?: number;
  chaseEndsAt?: number;
  pulseIndex = 1;
  disclosures = new Map<string, Disclosure>();
  lastRevealed = new Map<string, number>();
  revealCells = new Map<string, { cell: LngLat[]; at: number; expiresAt: number }>();
  captures: Result['captures'] = [];
  withdrewDuringRound = false;
  result?: Result;
  endedAt?: number;
  lastActivity = 0;
  paused?: PauseState;
  dirty = true; // needs persisting
  critical?: () => void; // persist immediately (captures, pauses, results must survive a crash)

  constructor(public code: string, private send: Send) {}

  get preset() { return PRESETS[this.presetId]; }

  addPlayer(alias: string, now: number): { player: Player; token: string } {
    let name = alias;
    for (let i = 2; [...this.players.values()].some(p => p.alias === name); i++) name = `${alias} ${i}`;
    const p: Player = {
      id: randomBytes(8).toString('hex'), tokenHash: '', alias: name,
      role: this.players.size === 0 ? 'hunter' : 'runner', ready: false, connected: true,
      status: 'active', wrongGuesses: 0, lockedUntil: 0, hadFix: false, fixes: [], lastContact: now, lostAck: false, recentTs: [], alerts: false, pauses: 0, techPaused: false,
      items: [], frozenUntil: 0, immuneUntil: 0, freezeEndSent: true, sweepReadyAt: 0,
      infectedUntil: 0, shieldUntil: 0, slashReadyAt: 0,
    };
    if (!this.hostId) { this.hostId = p.id; this.ownerId = p.id; }
    const token = randomBytes(24).toString('hex');
    p.tokenHash = hashToken(token);
    this.players.set(p.id, p);
    this.lastActivity = now;
    this.broadcast(now);
    return { player: p, token };
  }

  canJoin(now = Date.now()): string | null {
    if (this.phase !== 'lobby' && this.phase !== 'ended') {
      const left = this.chaseEndsAt ? Math.max(0, Math.ceil(((this.paused?.since ?? now) - this.chaseEndsAt) / -60_000)) : undefined;
      return `Round in progress${left !== undefined ? ` (~${left} min left)` : ''} — join when it ends`;
    }
    if (this.players.size >= MAX_PLAYERS) return 'Match is full';
    return null;
  }

  setConnected(id: string, connected: boolean, now: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (connected) {
      this.touch(id, now);
      const live = this.phase === 'headstart' || this.phase === 'chase';
      const hostOk = !!this.players.get(this.hostId)?.connected;
      if (id === this.ownerId && this.hostId !== id && (!live || !hostOk)) this.setHost(id); // organiser gets host back (never yanked from a healthy host mid-round)
      else if (this.paused && !this.players.get(this.hostId)?.connected) this.setHost(id); // someone must be able to resume
    } else {
      if (this.phase === 'lobby') p.ready = false;
      // Between rounds hand over at once; during a round a locked phone is normal, so wait for real loss (tick).
      const live = this.phase === 'headstart' || this.phase === 'chase';
      if (!live && id === this.hostId) this.passHost(id);
    }
    this.broadcast(now);
  }

  /** Any sign of life from a player (message, ping, HTTP upload). Auto-resumes a technical pause they caused. */
  touch(id: string, now: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastContact = Math.max(p.lastContact, now); p.lostAck = false;
    const pz = this.paused;
    if (pz?.reason === 'technical' && pz.byId === id && !pz.resumeAt) { pz.resumeAt = now + RULES.resumeCountdownMs; this.broadcast(now); }
  }

  /** Returns an error string to send back, or null. */
  handle(id: string, msg: ClientMsg, now: number): string | null {
    const me = this.players.get(id);
    if (!me) return 'Not in match';
    this.lastActivity = now;
    this.touch(id, now);
    const isHost = id === this.hostId;
    const lobbyHost = () => (this.phase !== 'lobby' ? 'Only in lobby' : !isHost ? 'Host only' : null);

    switch (msg.t) {
      case 'setRole': {
        const err = lobbyHost(); if (err) return err;
        const p = this.players.get(msg.playerId); if (!p) return 'No such player';
        if (p.role !== msg.role && p.ready) this.send(p.id, { t: 'event', event: { kind: 'readyReset', reason: `Host made you a ${msg.role}` } });
        p.role = msg.role; p.ready = false;
        break;
      }
      case 'shuffleRoles': {
        const err = lobbyHost(); if (err) return err;
        const ids = [...this.players.keys()].sort(() => Math.random() - 0.5);
        const h = Math.max(1, Math.min(msg.hunters, ids.length - 1));
        ids.forEach((pid, i) => { const p = this.players.get(pid)!; p.role = i < h ? 'hunter' : 'runner'; p.ready = false; });
        break;
      }
      case 'setPreset': {
        const err = lobbyHost(); if (err) return err;
        if (this.presetId !== msg.preset) this.unreadyAll('Host changed the mode');
        this.presetId = msg.preset;
        break;
      }
      case 'setZone': {
        const err = lobbyHost(); if (err) return err;
        this.zone = msg.zone;
        this.unreadyAll('Host changed the play zone');
        break;
      }
      case 'ready': {
        if (this.phase !== 'lobby') return 'Only in lobby';
        if (msg.ready && !this.zone) return 'Host has not set a play zone yet';
        if (msg.ready && !this.freshLoc(me, now)) return 'Waiting for a GPS fix';
        if (msg.ready && !inZone(me.loc!.p, this.zone!)) return 'Walk inside the play zone first';
        me.ready = msg.ready;
        if (msg.ready) me.alerts = !!msg.alerts;
        break;
      }
      case 'setShrink': {
        const err = lobbyHost(); if (err) return err;
        if (this.shrinkOn !== msg.on) this.unreadyAll(msg.on ? 'Host turned on the shrinking zone' : 'Host turned off the shrinking zone');
        this.shrinkOn = msg.on;
        break;
      }
      case 'setWorld': {
        const err = lobbyHost(); if (err) return err;
        if (msg.worldId !== null && !worlds.has(msg.worldId)) return 'Unknown world';
        if (this.worldId !== msg.worldId) this.unreadyAll(msg.worldId ? 'Host changed the map' : 'Host switched to the plain map');
        this.worldId = msg.worldId;
        if (!msg.worldId) this.routeSweep = false;
        break;
      }
      case 'setMode': {
        const err = lobbyHost(); if (err) return err;
        const ms = msg.infectMs ?? this.infectMs;
        if (!(INFECTION.durationsMs as readonly number[]).includes(ms)) return 'Pick 1, 2 or 3 minutes';
        if (this.mode !== msg.mode || this.infectMs !== ms) this.unreadyAll(msg.mode === 'infection' ? `Host picked Infection (${ms / 60_000} min)` : 'Host picked Classic');
        this.mode = msg.mode; this.infectMs = ms;
        break;
      }
      case 'setCatch': {
        const err = lobbyHost(); if (err) return err;
        if (this.catchMethod !== msg.method) this.unreadyAll(msg.method === 'slash' ? 'Host switched catching to Slash (Bluetooth)' : 'Host switched catching to codes');
        this.catchMethod = msg.method;
        break;
      }
      case 'slash': return this.slash(me, msg.seen, now);
      case 'setRouteSweep': {
        const err = lobbyHost(); if (err) return err;
        if (msg.on && !this.worldId) return 'Pick a 3D campus map first — route Sweep walks its paths';
        if (this.routeSweep !== msg.on) this.unreadyAll(msg.on ? 'Host switched Sweep to route distance' : 'Host switched Sweep to straight-line distance');
        this.routeSweep = msg.on;
        break;
      }
      case 'setPowers': {
        const err = lobbyHost(); if (err) return err;
        if (this.powersOn !== msg.on) this.unreadyAll(msg.on ? 'Host turned powers on' : 'Host turned powers off');
        this.powersOn = msg.on;
        break;
      }
      case 'useFreeze': return this.useFreeze(me, msg.itemId, msg.targetId, now);
      case 'ackFreeze': return this.ackFreeze(me, msg.offerId, now);
      case 'useSweep': return this.useSweep(me, msg.itemId, now);
      case 'claimStart': return this.claimStart(me, msg.stationId, now);
      case 'claimFinish': return this.claimFinish(me, msg.stationId, now);
      case 'claimCancel': this.claims.delete(me.id); break;
      case 'setContact': {
        const err = lobbyHost(); if (err) return err;
        this.contact = msg.contact;
        break;
      }
      case 'start': {
        const err = lobbyHost(); if (err) return err;
        const ps = [...this.players.values()];
        if (!this.zone) return 'Set a play zone first';
        if (!ps.some(p => p.role === 'hunter')) return 'Need at least one hunter';
        if (!ps.some(p => p.role === 'runner')) return 'Need at least one runner';
        const notReady = ps.filter(p => !p.ready).map(p => p.alias);
        if (notReady.length) return `Not ready: ${notReady.join(', ')}`;
        // re-check now, not at the time they tapped Ready (they may have walked out or lost GPS)
        const drifted = ps.filter(p => !this.freshLoc(p, now) || !inZone(p.loc!.p, this.zone!));
        if (drifted.length) {
          for (const p of drifted) { p.ready = false; this.send(p.id, { t: 'event', event: { kind: 'readyReset', reason: 'Get back inside the zone with GPS, then tap Ready again' } }); }
          this.broadcast(now);
          return `Not inside the zone / no GPS: ${drifted.map(p => p.alias).join(', ')}`;
        }
        this.startRound(now);
        return null; // startRound broadcasts
      }
      case 'loc': {
        if (me.status !== 'active' || this.phase === 'ended') return null; // tracking stopped: never store late uploads
        const f: Fix = { p: [msg.lng, msg.lat], acc: msg.acc, measuredAt: now - Math.max(0, msg.ageMs) - RULES.transitAllowanceMs, ts: msg.ts };
        if (msg.ts !== undefined) { if (me.recentTs.includes(msg.ts)) return null; me.recentTs = [...me.recentTs, msg.ts].slice(-20); } // same fix via WS + HTTP
        if (me.loc && f.measuredAt <= me.loc.measuredAt) return null; // out-of-order / older sample
        if (me.loc) { // teleport quarantine: a review signal, never a punishment (BP §14.2)
          const dt = Math.max(1, (f.measuredAt - me.loc.measuredAt) / 1000);
          if ((distanceM(me.loc.p, f.p) - f.acc - me.loc.acc) / dt > RULES.maxSpeedMps && now - me.loc.measuredAt < RULES.maxLocationAgeMs) return null;
        }
        me.loc = f;
        me.fixes = [...me.fixes.filter(x => now - x.measuredAt <= RULES.fixBufferMs), f].slice(-15);
        this.trackClaim(me, f, now);
        // Location never fans out to others. Only lobby readiness (hasFix) is visible.
        const fresh = this.freshLoc(me, now);
        if (this.phase === 'lobby' && fresh !== me.hadFix) { me.hadFix = fresh; this.broadcast(now); }
        return null;
      }
      case 'capture': return this.capture(me, msg.code, now);
      case 'kick': {
        if (this.phase !== 'lobby' && this.phase !== 'ended') return 'Only between rounds';
        if (!isHost) return 'Host only';
        const p = this.players.get(msg.playerId);
        if (!p || p.id === id) return 'No such player';
        this.send(p.id, { t: 'kicked', reason: 'The host removed you from the match.' });
        this.players.delete(p.id);
        break;
      }
      case 'endRound': {
        if (this.phase !== 'headstart' && this.phase !== 'chase') return 'No round running';
        if (!isHost) return 'Host only';
        this.finish(now, null, 'Host ended the round');
        return null;
      }
      case 'pause': {
        if (this.phase !== 'headstart' && this.phase !== 'chase') return 'No round running';
        if (me.status === 'withdrawn') return 'You left this round';
        if (!isHost && me.pauses >= RULES.maxPausesPerPlayer) return 'You’ve used your pauses this round — shout STOP and tell the host';
        if (this.paused && !this.paused.resumeAt) return null;
        me.pauses++;
        if (this.paused) { // already paused: a pause during the resume countdown just cancels the countdown
          if (this.paused.resumeAt) { this.paused.resumeAt = undefined; this.emitAll({ kind: 'paused', reason: 'safety', by: me.alias }); this.broadcast(now); }
          return null;
        }
        this.pause('safety', me.alias, now);
        return null;
      }
      case 'resume': {
        if (!this.paused) return 'Not paused';
        if (!isHost) return 'Only the host can resume';
        if (this.paused.resumeAt) return null;
        for (const p of this.players.values()) if (p.status === 'active' && this.lost(p, now)) { p.lostAck = true; this.degraded = true; }
        this.paused.resumeAt = now + RULES.resumeCountdownMs;
        break;
      }
      case 'dropPlayer': {
        if (!this.paused) return 'Only while paused';
        if (!isHost) return 'Host only';
        const p = this.players.get(msg.playerId);
        if (!p || p.status !== 'active' || p.id === id) return 'No such active player';
        this.leave(p, now, true);
        if (this.phase === 'ended') return null;
        if (this.paused?.byId === p.id) this.paused.resumeAt = now + RULES.resumeCountdownMs;
        break;
      }
      case 'leave': this.leave(me, now); return null;
      case 'rematch': {
        if (this.phase !== 'ended') return 'Round not finished';
        if (!isHost) return 'Host only';
        this.rematch(now);
        break;
      }
      default: return 'Unknown message';
    }
    this.broadcast(now);
    return null;
  }

  tick(now: number) {
    if (this.paused) {
      if (!this.paused.resumeAt || now < this.paused.resumeAt) return; // clocks frozen
      this.unpause(this.paused.resumeAt, now);
    }
    if (this.phase === 'chase') this.cureDue(Math.min(now, this.chaseEndsAt!)); // a cure due before the deadline counts for the result
    if (this.phase === 'chase' && now >= this.chaseEndsAt!) { // terminal deadline first (TDD §03.4)
      return this.timeUp(now);
    }
    if (this.phase === 'headstart' || this.phase === 'chase') {
      const host = this.players.get(this.hostId);
      if (!host || this.lost(host, now, RULES.lostContactPauseMs)) this.passHost(this.hostId, now); // host phone dead: hand over
      // Pause only when it matters (BP §04.6): the last runner/hunter is gone, or anyone is gone for a long time.
      // Otherwise pulses just show "signal unavailable" for them.
      const lastOf = (r: Role) => this.players.size && [...this.players.values()].filter(x => x.role === r && x.status === 'active').length === 1;
      const lost = [...this.players.values()].find(p => p.status === 'active' && !p.lostAck && !p.techPaused && // one technical pause per player per round (no pause storms from flaky Wi-Fi)
        (this.lost(p, now, RULES.lostAnyPauseMs) || (lastOf(p.role) && this.lost(p, now, RULES.lostContactPauseMs))));
      if (lost) { lost.techPaused = true; return this.pause('technical', lost.alias, now, lost.id); }
    }
    if (this.phase === 'headstart' && now >= this.headStartEndsAt!) {
      this.phase = 'chase';
      this.chaseStartedAt = this.headStartEndsAt!;
      this.chaseEndsAt = this.chaseStartedAt + this.preset.chaseMs;
      this.pulseIndex = 1;
      this.emitAll({ kind: 'phase', phase: 'chase' });
      this.broadcast(now);
    }
    if (this.phase !== 'chase') return;
    if (now >= this.chaseEndsAt!) { // terminal deadline wins over a pulse at the same instant (TDD §03.3)
      this.timeUp(now);
      return;
    }
    const I = this.preset.pulseIntervalMs, L = this.preset.chaseMs;
    let due = 0;
    while (this.pulseIndex * I < L && this.chaseStartedAt! + this.pulseIndex * I <= now) { due = this.pulseIndex; this.pulseIndex++; }
    if (due) this.pulse(due, now); // a late wake-up emits one fresh pulse, not a stale burst
    this.shrinkTick(now);
    this.powersTick(now);
  }

  private timeUp(now: number) {
    if (this.activeRunners().length) return this.finish(now, 'runners', 'Time ran out — runners survived');
    // nobody clean left at the bell only because someone withdrew (infection keeps rounds alive for cures): no winner
    if (this.withdrewDuringRound) return this.finish(now, null, 'No runners left — round incomplete');
    this.finish(now, 'hunters', this.mode === 'infection' ? 'Everyone got infected' : 'All runners caught');
  }

  private cureDue(at: number) {
    for (const p of this.players.values()) if (this.phase === 'chase' && p.status === 'active' && p.infectedUntil && at >= p.infectedUntil) this.cure(p, at);
  }

  private lost(p: Player, now: number, ms: number = RULES.lostContactPauseMs) { return !p.connected && now - p.lastContact > ms; }

  private pause(reason: PauseReason, by: string | undefined, now: number, byId?: string) {
    this.paused = { reason, by, byId, since: now };
    this.cancelOffers(() => true, 'Round paused — Freeze returned', true, now); // retry cooldown too: pausing isn't a free dodge
    for (const [pid, c] of this.claims) this.send(pid, { t: 'event', event: { kind: 'claimFailed', stationId: c.stationId, reason: 'Round paused' } });
    this.claims.clear();
    this.critical?.();
    this.emitAll({ kind: 'paused', reason, by });
    this.broadcast(now);
  }

  /** Shift every chase-time deadline by the paused duration so remaining time is preserved. */
  private unpause(at: number, now: number) {
    const d = at - this.paused!.since;
    const sh = (t?: number) => (t === undefined ? t : t + d);
    this.headStartEndsAt = sh(this.headStartEndsAt);
    this.chaseStartedAt = sh(this.chaseStartedAt);
    this.chaseEndsAt = sh(this.chaseEndsAt);
    const since = this.paused!.since; // only shift what was still alive when the pause began
    for (const x of this.disclosures.values()) if (x.expiresAt > since) { x.revealedAt += d; x.brightUntil += d; x.expiresAt += d; } // sampledAt stays honest
    for (const x of this.revealCells.values()) if (x.expiresAt > since) { x.at += d; x.expiresAt += d; }
    for (const [k, v] of this.lastRevealed) this.lastRevealed.set(k, v + d);
    for (const p of this.players.values()) if (p.lockedUntil > this.paused!.since) p.lockedUntil += d;
    for (const st of this.stages) if (st.at > this.paused!.since) st.at += d;
    for (const p of this.players.values()) {
      if (p.frozenUntil > since) p.frozenUntil += d;
      if (p.immuneUntil > since) p.immuneUntil += d;
      if (p.sweepReadyAt > since) p.sweepReadyAt += d;
      if (p.infectedUntil > since) p.infectedUntil += d;
      if (p.shieldUntil > since) p.shieldUntil += d;
      if (p.slashReadyAt > since) p.slashReadyAt += d;
    }
    for (const st of this.stations) if (st.availableAt > since) st.availableAt += d;
    for (const [k, v] of this.retry) if (v > since) this.retry.set(k, v + d);
    for (const list of this.sweepHits.values()) for (const x of list) if (x.expiresAt > since) { x.revealedAt += d; x.brightUntil += d; x.expiresAt += d; }
    if (this.graceUntil !== undefined && this.graceUntil > since) this.graceUntil += d;
    this.exposeNextAt = sh(this.exposeNextAt);
    this.paused = undefined;
    this.emitAll({ kind: 'resumed' });
    this.broadcast(now);
  }

  /** Pre-plan every shrink circle at round start (random, always nested, centres inside the host zone). */
  private planShrink(chaseStart: number) {
    this.stages = []; this.stageIdx = 0; this.zoneNow = undefined; this.graceUntil = undefined; this.exposeNextAt = undefined;
    if (!this.shrinkOn || !this.zone) return;
    const base = zoneCircle(this.zone);
    if (base.radiusM < 2 * SHRINK.minRadiusM) return; // zone too small to shrink meaningfully
    let prev = base;
    const zone = this.zone;
    // a candidate must sit on real ground and keep most of its rim inside the host zone (matters for polygons)
    const good = (c: Circle) => inZone(c.center, zone) && rimInZone(c, zone) >= 0.8;
    for (const st of SHRINK.stages) {
      const r = Math.max(SHRINK.minRadiusM, base.radiusM * st.factor);
      if (r >= prev.radiusM - 5) continue; // zone already this small
      let best: Circle | undefined, bestRim = -1;
      for (let i = 0; i < 160 && bestRim < 0.8; i++) { // cheap: 16-point rim test per candidate
        const a = Math.random() * 2 * Math.PI, d = Math.sqrt(Math.random()) * (prev.radiusM - r);
        const c = { center: fromLocal([Math.cos(a) * d, Math.sin(a) * d], prev.center), radiusM: r };
        if (!inZone(c.center, zone)) continue;
        const rim = rimInZone(c, zone);
        if (rim > bestRim) { best = c; bestRim = rim; }
      }
      const sp = startPoint(zone);
      const spCircle = { center: sp, radiusM: r };
      if (!best || (bestRim < 0.8 && distanceM(sp, prev.center) <= prev.radiusM - r && good(spCircle))) best = distanceM(sp, prev.center) <= prev.radiusM - r && inZone(sp, zone) ? spCircle : best;
      if (!best) continue; // no playable circle here: skip this stage (nesting still holds)
      prev = best;
      this.stages.push({ circle: prev, at: chaseStart + st.at * this.preset.chaseMs, announced: false });
    }
  }

  private shrinkTick(now: number) {
    const lead = Math.min(SHRINK.announceMs, 0.15 * this.preset.chaseMs);
    const st = this.stages[this.stageIdx];
    if (st && !st.announced && now >= st.at - lead) {
      st.announced = true;
      this.emitAll({ kind: 'zoneWarning', at: st.at });
      this.broadcast(now);
    }
    if (st && now >= st.at) {
      this.zoneNow = st.circle;
      this.stageIdx++;
      this.graceUntil = now + SHRINK.graceMs;
      this.exposeNextAt = this.graceUntil;
      this.emitAll({ kind: 'zoneShrunk', stage: this.stageIdx });
      this.broadcast(now);
      this.critical?.(); // players saw the new circle: a restart must not roll it back
    }
    if (this.zoneNow && this.exposeNextAt !== undefined && now >= this.exposeNextAt) {
      this.exposeNextAt = now + SHRINK.exposeEveryMs;
      let any = false;
      for (const r of this.activeRunners()) {
        const f = this.bestFix(r, now);
        if (!f || !clearlyOutside(f.p, f.acc, this.zone!, this.zoneNow)) continue; // GPS error counts in the runner's favour
        const size = f.acc <= RULES.cellM ? RULES.cellM : RULES.wideCellM;
        this.disclosures.set(r.id, {
          runnerId: r.id, alias: r.alias, unavailable: false, exposed: true, cell: cellRing(f.p, zoneOrigin(this.zone!), size), sampledAt: f.measuredAt,
          revealedAt: now, brightUntil: now + RULES.pulseBrightMs, expiresAt: now + RULES.disclosureMaxAgeMs,
        });
        this.lastRevealed.set(r.id, now);
        this.revealCells.set(r.id, { cell: this.disclosures.get(r.id)!.cell!, at: now, expiresAt: now + RULES.disclosureMaxAgeMs });
        this.send(r.id, { t: 'event', event: { kind: 'exposed' } });
        any = true;
      }
      if (any) this.broadcast(now);
    }
  }

  private nextPulseAt(): number | undefined {
    if (this.phase !== 'chase') return undefined;
    const t = this.pulseIndex * this.preset.pulseIntervalMs;
    return t < this.preset.chaseMs ? this.chaseStartedAt! + t : undefined;
  }

  /** Lobby GPS badges must also go grey when a fix goes stale without new uploads. */
  refreshFixes(now: number) {
    let changed = false;
    for (const p of this.players.values()) {
      const f = this.freshLoc(p, now);
      if (f !== p.hadFix) {
        p.hadFix = f; changed = true;
        if (!f && p.ready) { p.ready = false; this.send(p.id, { t: 'event', event: { kind: 'readyReset', reason: 'Lost your GPS — keep ECHO open outdoors, then tap Ready again' } }); }
      }
    }
    if (changed) this.broadcast(now);
  }

  private freshLoc(p: Player, now: number) {
    return !!p.loc && now - p.loc.measuredAt <= RULES.maxLocationAgeMs && p.loc.acc <= RULES.maxAccuracyM;
  }

  /** Sharpest usable recent fix: accuracy penalised by how far you could have moved since. */
  private bestFix(p: Player, now: number): Fix | undefined {
    let best: Fix | undefined, score = Infinity;
    for (const f of p.fixes) {
      const age = now - f.measuredAt;
      if (age > RULES.maxLocationAgeMs || f.acc > RULES.maxAccuracyM) continue;
      const sc = f.acc + (age / 1000) * RULES.assumedSpeedMps;
      if (sc < score) { score = sc; best = f; }
    }
    return best;
  }

  private unreadyAll(reason: string) {
    for (const p of this.players.values()) {
      if (p.ready) this.send(p.id, { t: 'event', event: { kind: 'readyReset', reason: `${reason} — tap Ready again` } });
      p.ready = false;
    }
  }

  /** Hand host to a connected, non-withdrawn player (fallback: anyone still in). */
  private passHost(from: string, now = Date.now()) {
    // only to someone reachable; if everyone is gone, keep the host (no flip-flopping between dead phones)
    const others = [...this.players.values()].filter(x => x.id !== from && x.status !== 'withdrawn' && (x.connected || !this.lost(x, now)))
      .sort((a, b) => Number(b.connected) - Number(a.connected) || b.lastContact - a.lastContact);
    if (others[0]) this.setHost(others[0].id);
  }

  private setHost(id: string) {
    if (this.hostId === id || this.players.get(id)?.status === 'withdrawn') return;
    this.hostId = id;
    const alias = this.players.get(id)?.alias ?? '';
    for (const p of this.players.values()) this.send(p.id, { t: 'event', event: { kind: 'hostChanged', alias, you: p.id === id } });
  }

  // ───────────────────────────── Phase 2: powers ─────────────────────────────

  /** Items work only in the playable area (BP §06.7); GPS error counts in the player's favour. */
  private inArea(p: Player, now: number) {
    const f = this.bestFix(p, now);
    return !!f && !clearlyOutside(f.p, f.acc, this.zone!, this.zoneNow);
  }

  private live(now: number) { return this.powersOn && this.phase === 'chase' && !this.paused && now < this.chaseEndsAt!; }
  private reachable(p: Player, now: number) { return p.connected || now - p.lastContact <= POWERS.freeze.reachableMs; }

  /** Release reserved items for matching offers (refund). Retry cooldown only for real non-acknowledgement. */
  private cancelOffers(match: (o: { id: string; casterId: string; targetId: string }) => boolean, reason: string, retry: boolean, now = 0) {
    for (const [id, o] of this.offers) {
      if (!match(o)) continue;
      this.offers.delete(id);
      const it = this.players.get(o.casterId)?.items.find(i => i.id === o.itemId);
      if (it) it.reserved = false;
      if (retry) this.retry.set(`${o.casterId}|${o.targetId}`, now + POWERS.freeze.retryMs);
      this.send(o.casterId, { t: 'event', event: { kind: 'freezeResult', ok: false, targetAlias: this.players.get(o.targetId)?.alias ?? '', reason } });
    }
  }

  private useFreeze(me: Player, itemId: string, targetId: string, now: number): string | null {
    if (!this.live(now)) return this.paused ? 'Game is paused' : 'Powers work during the chase';
    if (me.role !== 'runner' || me.status !== 'active') return 'Only active runners can Freeze';
    const item = me.items.find(i => i.id === itemId && i.type === 'freeze');
    if (!item || item.reserved) return 'No Freeze to use';
    if (!this.bestFix(me, now)) return 'Your GPS is stale — Freeze reveals your area, so it needs a fresh fix';
    if (!this.inArea(me, now)) return 'Get back inside the zone to use a Freeze';
    const t = this.players.get(targetId);
    if (!t || t.role !== 'hunter' || t.status !== 'active') return 'That hunter can’t be frozen';
    if (!this.reachable(t, now)) return `${t.alias} is unreachable right now`;
    if ([...this.offers.values()].some(o => o.targetId === t.id)) return `${t.alias} can’t be frozen right now`; // don't reveal another runner's Freeze
    if (t.frozenUntil > now) return `${t.alias} is already frozen`;
    if (t.immuneUntil > now) return `${t.alias} is immune for ${Math.ceil((t.immuneUntil - now) / 1000)} s`;
    const r = this.retry.get(`${me.id}|${t.id}`) ?? 0;
    if (r > now) return `Try ${t.alias} again in ${Math.ceil((r - now) / 1000)} s`;
    if ([...this.offers.values()].some(o => o.casterId === me.id)) return 'You already have a Freeze waiting';
    item.reserved = true;
    const offer = { id: randomBytes(6).toString('hex'), casterId: me.id, targetId: t.id, itemId, expiresAt: now + POWERS.freeze.offerMs };
    this.offers.set(offer.id, offer);
    this.send(t.id, { t: 'event', event: { kind: 'freezeOffer', offerId: offer.id, expiresAt: offer.expiresAt } }); // anonymous until activation
    this.broadcast(now);
    return null;
  }

  private ackFreeze(me: Player, offerId: string, now: number): string | null {
    const done = this.ackReceipts.get(offerId);
    if (done && done.targetId === me.id) { this.send(me.id, { t: 'event', event: { kind: 'frozen', until: done.until } }); return null; } // retried ack: same answer
    if (this.phase === 'chase' && now >= this.chaseEndsAt!) { this.tick(now); return 'Time is up'; } // terminal deadline first
    const o = this.offers.get(offerId);
    if (!o || o.targetId !== me.id) return 'That Freeze is no longer active';
    if (now >= o.expiresAt) { this.expireOffers(now); return 'Too late — that Freeze expired'; } // expiry wins ties (TDD §09.3)
    if (this.paused) return 'Game is paused';
    const caster = this.players.get(o.casterId);
    const item = caster?.items.find(i => i.id === o.itemId);
    if (!caster || caster.status !== 'active' || !item || me.status !== 'active' || !this.reachable(caster, now)) { this.cancelOffers(x => x.id === o.id, 'Freeze cancelled', false); this.broadcast(now); return 'That Freeze was cancelled'; }
    const cf = this.bestFix(caster, now);
    if (!cf) { this.cancelOffers(x => x.id === o.id, 'Your GPS went stale — Freeze returned', false); this.broadcast(now); return 'That Freeze was cancelled'; } // never reveal an old point as fresh
    this.offers.delete(o.id);
    caster.items = caster.items.filter(i => i.id !== item.id); // consumed on activation
    me.frozenUntil = now + POWERS.freeze.activeMs;
    me.immuneUntil = me.frozenUntil + POWERS.freeze.immunityMs;
    me.freezeEndSent = false;
    this.ackReceipts.set(o.id, { targetId: me.id, until: me.frozenUntil });
    const hold = this.claims.get(me.id); // frozen means no collecting: an in-progress hold dies too
    if (hold) { this.claims.delete(me.id); this.send(me.id, { t: 'event', event: { kind: 'claimFailed', stationId: hold.stationId, reason: 'Frozen — station hold cancelled' } }); }
    // the cost: hunters get the caster's coarse area (BP §06.2)
    const size = cf.acc <= RULES.cellM ? RULES.cellM : RULES.wideCellM;
    this.disclosures.set(caster.id, {
      runnerId: caster.id, alias: caster.alias, unavailable: false, source: 'freeze', cell: cellRing(cf.p, zoneOrigin(this.zone!), size), sampledAt: cf.measuredAt,
      revealedAt: now, brightUntil: now + RULES.pulseBrightMs, expiresAt: now + RULES.disclosureMaxAgeMs,
    });
    this.revealCells.set(caster.id, { cell: this.disclosures.get(caster.id)!.cell!, at: now, expiresAt: now + RULES.disclosureMaxAgeMs });
    this.lastRevealed.set(caster.id, now);
    this.critical?.(); // durable before anyone is told
    this.send(caster.id, { t: 'event', event: { kind: 'freezeResult', ok: true, targetAlias: me.alias } });
    this.send(me.id, { t: 'event', event: { kind: 'frozen', until: me.frozenUntil } });
    for (const h of this.activeHunters()) this.send(h.id, { t: 'event', event: { kind: 'casterRevealed', alias: caster.alias } });
    this.broadcast(now);
    return null;
  }

  private expireOffers(now: number) {
    const due = [...this.offers.values()].filter(o => now >= o.expiresAt);
    for (const o of due) this.cancelOffers(x => x.id === o.id, `${this.players.get(o.targetId)?.alias ?? 'The hunter'} didn’t acknowledge in time — Freeze returned`, true, now);
    if (due.length) this.broadcast(now);
  }

  private useSweep(me: Player, itemId: string, now: number): string | null {
    if (!this.live(now)) return this.paused ? 'Game is paused' : 'Powers work during the chase';
    if (me.role !== 'hunter' || me.status !== 'active') return 'Only active hunters can Sweep';
    if (me.frozenUntil > now) return 'You’re frozen';
    if (me.sweepReadyAt > now) return `Sweep recharging — ${Math.ceil((me.sweepReadyAt - now) / 1000)} s`;
    const item = me.items.find(i => i.id === itemId && i.type === 'sweep');
    if (!item) return 'No Sweep to use';
    const hf = this.bestFix(me, now);
    if (!hf) return 'Your GPS is stale — nothing spent';
    if (!this.inArea(me, now)) return 'Get back inside the zone to Sweep — nothing spent';
    const drift = (f: Fix) => ((now - f.measuredAt) / 1000) * RULES.assumedSpeedMps; // an older fix could have moved
    const R = POWERS.sweep.radiusM;
    const w = this.routeSweep && this.worldId ? worlds.get(this.worldId) : undefined;
    const g = w && graphFor(w);
    const judge = g && routeJudge(g, { p: hf.p, r: hf.acc + drift(hf) }, R); // hunter side computed once for all runners
    const hits: Player[] = []; let uncertain = 0, unavailable = 0, usable = 0;
    const spike = { in: 0, uncertain: 0, out: 0, radiusIn: 0 }; // Phase 4 spike: how often does the route verdict come back uncertain?
    for (const r of this.activeRunners()) {
      const f = this.bestFix(r, now);
      if (!f) { unavailable++; continue; }
      usable++;
      const d = distanceM(hf.p, f.p), e = hf.acc + f.acc + drift(hf) + drift(f); // TDD M14 + movement since each fix
      const radius = d + e <= R ? 'in' : d - e <= R ? 'uncertain' : 'out';
      // Route can only make the answer stricter: "in" needs both, "out" by either (walking distance ≥ straight line).
      // Never upgrade "uncertain" to "in": a fix near a dead end could really be past it, on a lawn or indoors.
      const route = !judge || radius === 'out' ? radius : judge({ p: f.p, r: f.acc + drift(f) });
      const v = radius === 'out' || route === 'out' ? 'out' : radius === 'in' && route === 'in' ? 'in' : 'uncertain';
      if (g) { spike[v]++; if (radius === 'in') spike.radiusIn++; }
      if (v === 'in') hits.push(r); else if (v === 'uncertain') uncertain++;
    }
    if (g && usable) console.log(`[sweep:route] ${this.code} in=${spike.in} uncertain=${spike.uncertain} out=${spike.out} radius-in=${spike.radiusIn}`);
    if (!usable) return 'Scan unavailable — no runner signals right now (nothing spent)';
    me.items = me.items.filter(i => i.id !== item.id);
    me.sweepReadyAt = now + POWERS.sweep.cooldownMs;
    const mine = (this.sweepHits.get(me.id) ?? []).filter(d => d.expiresAt > now && !hits.some(h => h.id === d.runnerId));
    for (const r of hits) {
      const f = this.bestFix(r, now)!;
      const size = f.acc <= RULES.cellM ? RULES.cellM : RULES.wideCellM;
      mine.push({ runnerId: r.id, alias: r.alias, unavailable: false, source: 'sweep', cell: cellRing(f.p, zoneOrigin(this.zone!), size), sampledAt: f.measuredAt,
        revealedAt: now, brightUntil: now + POWERS.sweep.brightMs, expiresAt: now + RULES.disclosureMaxAgeMs });
      this.send(r.id, { t: 'event', event: { kind: 'scanned' } });
    }
    this.sweepHits.set(me.id, mine); // private to this hunter (BP §06.3)
    this.critical?.();
    this.send(me.id, { t: 'event', event: { kind: 'sweepResult', confirmed: hits.length, uncertain, unavailable, route: !!g } });
    this.broadcast(now);
    return null;
  }

  /** 3-4 stations, spread out, inside the zone, away from START and the edge. */
  private placeStations() {
    const z = this.zone!, base = zoneCircle(z), sp = startPoint(z), S = POWERS.station;
    const want = base.radiusM >= 180 ? 4 : 3;
    const finalCircle = this.stages.at(-1)?.circle; // at least one stays usable after the last shrink
    const tryPlace = (area: { center: LngLat; radiusM: number }, relax: number, max: number) => {
      const margin = S.edgeMarginM * relax, clear = S.startClearM * relax, spacing = S.minSpacingM * Math.max(relax, 0.5);
      const edgeOk = (p: LngLat) => margin <= 0 || Array.from({ length: 8 }, (_, i) => fromLocal([Math.cos(i * Math.PI / 4) * margin, Math.sin(i * Math.PI / 4) * margin], p)).every(q => inZone(q, z));
      for (let i = 0; i < 400 && this.stations.length < max; i++) {
        const a = Math.random() * 2 * Math.PI, d = Math.sqrt(Math.random()) * area.radiusM;
        const p = fromLocal([Math.cos(a) * d, Math.sin(a) * d], area.center);
        if (!inZone(p, z) || !edgeOk(p) || distanceM(p, sp) < clear) continue;
        if (this.stations.some(s => distanceM(s.p, p) < spacing)) continue;
        this.stations.push({ id: `s${this.stations.length + 1}`, p, gen: 1, availableAt: 0 });
      }
    };
    if (finalCircle) for (const relax of [1, 0.5, 0]) { if (this.stations.length) break; tryPlace(finalCircle, relax, 1); }
    for (const relax of [1, 0.5, 0]) tryPlace(base, relax, want); // small / thin zones: relax margins rather than place none
  }

  private stationOpen(st: { p: LngLat; availableAt: number }, now: number) {
    return st.availableAt <= now && (!this.zoneNow || distanceM(st.p, this.zoneNow.center) <= this.zoneNow.radiusM);
  }

  private claimStart(me: Player, stationId: string, now: number): string | null {
    if (!this.live(now)) return this.paused ? 'Game is paused' : 'Stations open during the chase';
    if (me.status !== 'active') return 'You’re out of this round';
    if (me.frozenUntil > now) return 'You’re frozen';
    const st = this.stations.find(s => s.id === stationId);
    if (!st || !this.stationOpen(st, now)) return 'That station isn’t available';
    const type = ITEM_FOR[me.role];
    if (me.items.some(i => i.type === type)) return `You already have a ${type === 'freeze' ? 'Freeze' : 'Sweep'}`;
    if (me.items.length >= POWERS.inventorySlots) return 'Your inventory is full';
    if (!this.inArea(me, now)) return 'Get back inside the zone first';
    this.claims.set(me.id, { stationId, gen: st.gen, startedAt: now, fixTs: [], lastAt: now }); // only fixes measured during the hold count (TDD M19)
    return null;
  }

  /** Each accepted fix during a hold: count it if it's inside the patch; leaving or a long gap cancels (TDD M19). */
  private trackClaim(me: Player, f: Fix, now: number) {
    const c = this.claims.get(me.id);
    if (!c) return;
    const st = this.stations.find(s => s.id === c.stationId);
    if (!st) return;
    if (f.measuredAt < c.startedAt) return; // measured before the hold began
    if (me.frozenUntil > f.measuredAt) return; // nothing counts while frozen
    const S = POWERS.station, good = f.acc <= S.maxAccM;
    const inside = distanceM(f.p, st.p) <= S.patchM;
    const fail = (reason: string) => { this.claims.delete(me.id); this.send(me.id, { t: 'event', event: { kind: 'claimFailed', stationId: st.id, reason } }); };
    if (!inside && good) return fail('You left the station');
    if (!inside || !good) return; // too blurry to say either way
    if (f.measuredAt - c.lastAt > S.maxGapMs && c.fixTs.length) return fail('GPS dropped out — hold again');
    const key = f.ts ?? f.measuredAt; // device timestamp: a re-uploaded fix doesn't count twice
    if (!c.fixTs.includes(key)) c.fixTs.push(key);
    c.lastAt = f.measuredAt;
    void now;
  }

  private claimFinish(me: Player, stationId: string, now: number): string | null {
    const c = this.claims.get(me.id);
    if (!c || c.stationId !== stationId) return 'Hold the station first';
    if (!this.live(now)) { this.claims.delete(me.id); return this.paused ? 'Game is paused' : 'Stations open during the chase'; }
    if (me.frozenUntil > now) { this.claims.delete(me.id); return 'You’re frozen'; }
    const need = POWERS.station.minFixes;
    if (now - c.lastAt > POWERS.station.maxGapMs + 2_000 && c.fixTs.length) { this.claims.delete(me.id); this.send(me.id, { t: 'event', event: { kind: 'claimFailed', stationId, reason: 'GPS dropped out — hold again' } }); return null; }
    if (now - c.startedAt < POWERS.station.holdMs || c.fixTs.length < need) {
      this.send(me.id, { t: 'event', event: { kind: 'claimProgress', stationId, fixes: c.fixTs.length, need } }); // keep holding
      return null;
    }
    this.claims.delete(me.id);
    const st = this.stations.find(s => s.id === stationId);
    if (!st || st.gen !== c.gen || !this.stationOpen(st, now)) {
      this.send(me.id, { t: 'event', event: { kind: 'claimFailed', stationId, reason: 'Already collected — nothing lost' } });
      return null;
    }
    const type = ITEM_FOR[me.role];
    if (me.items.some(i => i.type === type) || me.items.length >= POWERS.inventorySlots) return 'Your inventory is full';
    st.gen++; st.availableAt = now + POWERS.station.respawnMs; // first valid commit wins this generation
    me.items.push({ id: randomBytes(6).toString('hex'), type, reserved: false });
    this.critical?.();
    this.send(me.id, { t: 'event', event: { kind: 'claimed', stationId, item: type } });
    this.broadcast(now);
    return null;
  }

  private powersTick(now: number) {
    if (!this.powersOn) return;
    this.expireOffers(now);
    for (const h of this.activeHunters()) {
      if (!h.freezeEndSent && h.frozenUntil <= now) { h.freezeEndSent = true; this.send(h.id, { t: 'event', event: { kind: 'freezeEnded' } }); this.broadcast(now); }
    }
    for (const [k, r] of this.ackReceipts) if (r.until + 60_000 < now) this.ackReceipts.delete(k);
    for (const [hid, list] of this.sweepHits) { const live = list.filter(d => d.expiresAt > now); if (live.length !== list.length) this.sweepHits.set(hid, live); }
  }

  /** For the upload reply: a locked hunter learns about an incoming Freeze. */
  freezeOfferFor(id: string, now = Date.now()) {
    const o = [...this.offers.values()].find(x => x.targetId === id && x.expiresAt > now);
    return o ? { offerId: o.id, expiresAt: o.expiresAt, msLeft: o.expiresAt - now } : undefined; // msLeft: no clock sync on a locked phone
  }

  private activeRunners() { return [...this.players.values()].filter(p => p.role === 'runner' && p.status === 'active'); }
  private activeHunters() { return [...this.players.values()].filter(p => p.role === 'hunter' && p.status === 'active'); }

  private startRound(now: number) {
    const used = new Set<string>();
    for (const p of this.players.values()) {
      p.status = 'active'; p.wrongGuesses = 0; p.lockedUntil = 0; p.catchCode = undefined; p.bleId = undefined;
      p.origRole = p.role; p.infectedUntil = 0; p.shieldUntil = 0; p.slashReadyAt = 0;
      if (p.role !== 'runner') continue;
      p.catchCode = this.newCode(used); used.add(p.catchCode);
      p.bleId = randomBytes(4).toString('hex');
    }
    this.revealCells.clear();
    this.participants = [...this.players.keys()];
    this.usedCodes.clear(); this.degraded = false;
    for (const p of this.players.values()) { p.pauses = 0; p.techPaused = false; }
    this.phase = 'headstart';
    this.paused = undefined;
    for (const p of this.players.values()) { p.lastContact = now + RULES.lostContactPauseMs; p.lostAck = false; p.recentTs = []; } // grace while phones switch to background sharing
    this.headStartEndsAt = now + this.preset.headStartMs;
    this.worldHash = this.worldId ? worlds.get(this.worldId)?.hash : undefined; // pin the version this round uses
    this.planShrink(this.headStartEndsAt);
    this.offers.clear(); this.retry.clear(); this.sweepHits.clear(); this.claims.clear(); this.stations = [];
    for (const p of this.players.values()) {
      p.items = this.powersOn ? [{ id: randomBytes(6).toString('hex'), type: ITEM_FOR[p.role], reserved: false }] : [];
      p.frozenUntil = 0; p.immuneUntil = 0; p.freezeEndSent = true; p.sweepReadyAt = 0;
    }
    if (this.powersOn) this.placeStations();
    this.disclosures.clear(); this.lastRevealed.clear(); this.captures = [];
    this.withdrewDuringRound = false; this.result = undefined;
    this.emitAll({ kind: 'phase', phase: 'headstart' });
    this.broadcast(now);
  }

  private pulse(index: number, now: number) {
    const origin = zoneOrigin(this.zone!);
    for (const r of this.activeRunners()) {
      const base = { runnerId: r.id, alias: r.alias, revealedAt: now, brightUntil: now + RULES.pulseBrightMs, expiresAt: now + RULES.disclosureMaxAgeMs };
      const f = this.bestFix(r, now);
      if (!f) {
        this.disclosures.set(r.id, { ...base, unavailable: true }); // never an old dot as fresh (BP §05.2)
        this.send(r.id, { t: 'event', event: { kind: 'unavailable' } });
        continue;
      }
      const size = f.acc <= RULES.cellM ? RULES.cellM : RULES.wideCellM;
      this.disclosures.set(r.id, { ...base, unavailable: false, cell: cellRing(f.p, origin, size), sampledAt: f.measuredAt });
      this.lastRevealed.set(r.id, now);
      this.revealCells.set(r.id, { cell: this.disclosures.get(r.id)!.cell!, at: now, expiresAt: base.expiresAt });
      this.send(r.id, { t: 'event', event: { kind: 'revealed' } });
    }
    for (const h of this.players.values()) if (h.role === 'hunter') this.send(h.id, { t: 'event', event: { kind: 'pulse', index } });
    this.broadcast(now);
  }

  private capture(hunter: Player, code: string, now: number): string | null {
    if (this.paused) return 'Game is paused';
    if (this.phase !== 'chase') return 'Captures open after the head start';
    if (now >= this.chaseEndsAt!) { this.tick(now); return 'Time is up'; } // deadline beats a late catch
    if (hunter.role !== 'hunter' || hunter.status !== 'active') return 'Only active hunters can capture';
    if (hunter.frozenUntil > now) return `You’re frozen — ${Math.ceil((hunter.frozenUntil - now) / 1000)} s`;
    if (hunter.lockedUntil > now) return `Too many wrong codes — wait ${Math.ceil((hunter.lockedUntil - now) / 1000)} s`;
    if (!this.bestFix(hunter, now)) return 'Your GPS is stale — step into open sky, then enter the code again'; // before any lookup: no free code probing
    if (this.usedCodes.has(code)) return this.mode === 'infection' ? 'That code is no longer valid' : 'That runner is already caught';
    const found = [...this.players.values()].find(p => p.role === 'runner' && p.status === 'active' && p.catchCode === code);
    // Proximity gate: a correct code entered from far away counts as a wrong guess (stops remote brute force).
    // Uses only server-side fixes; unknown runner position doesn't block a real in-person catch.
    const hf = this.bestFix(hunter, now), rf = found && this.bestFix(found, now);
    const near = !found || (!rf ? found.shieldUntil <= now : hf && distanceM(hf.p, rf.p) - hf.acc - rf.acc <= RULES.catchRangeM); // shielded + no runner fix: don't confirm the code remotely
    const r = hf && near ? found : undefined;
    if (!hf && found) return 'Your GPS is stale — step into open sky, then enter the code again';
    if (!r) {
      hunter.wrongGuesses++;
      if (hunter.wrongGuesses >= RULES.catchWrongBeforeCooldown) { hunter.wrongGuesses = 0; hunter.lockedUntil = now + RULES.catchCooldownMs; }
      this.send(hunter.id, { t: 'event', event: { kind: 'catchFailed', attemptsLeft: RULES.catchWrongBeforeCooldown - hunter.wrongGuesses, lockedUntil: hunter.lockedUntil > now ? hunter.lockedUntil : undefined } });
      this.broadcast(now);
      return null; // catchFailed event carries the feedback
    }
    if (r.shieldUntil > now) return `${r.alias} just recovered — safe for ${Math.ceil((r.shieldUntil - now) / 1000)} s`; // only reached when GPS puts you next to them
    hunter.wrongGuesses = 0;
    this.catchRunner(hunter, r, now);
    return null;
  }

  /** Shared by code and slash catches. Classic: the runner is out. Infection: they hunt for `infectMs`, then turn back. */
  private catchRunner(hunter: Player, r: Player, now: number) {
    const infected = this.mode === 'infection';
    if (r.catchCode) this.usedCodes.add(r.catchCode);
    r.catchCode = undefined; r.bleId = undefined;
    if (infected) {
      r.role = 'hunter'; r.infectedUntil = now + this.infectMs; r.shieldUntil = 0;
      r.frozenUntil = 0; r.immuneUntil = 0; r.freezeEndSent = true; r.sweepReadyAt = 0; r.wrongGuesses = 0; r.lockedUntil = 0; r.slashReadyAt = 0;
    } else { r.status = 'caught'; r.loc = undefined; r.fixes = []; } // an infected player keeps uploading: they're still playing
    this.cancelOffers(o => o.casterId === r.id, infected ? 'You were infected — Freeze cancelled' : 'You were caught — Freeze cancelled', false); // capture beats a pending ack (TDD §09.2)
    r.items = []; this.claims.delete(r.id);
    for (const [hid, l] of this.sweepHits) this.sweepHits.set(hid, l.filter(d => d.runnerId !== r.id)); // capture revokes all tracking
    this.disclosures.delete(r.id); this.revealCells.delete(r.id); this.lastRevealed.delete(r.id);
    this.captures.push({ runnerId: r.id, alias: r.alias, byAlias: hunter.alias, atChaseMs: now - this.chaseStartedAt!, ...(infected && { infected: true }) });
    this.critical?.();
    this.emitAll({ kind: 'captured', runnerId: r.id, alias: r.alias, byAlias: hunter.alias, ...(infected && { infected: true }) });
    if (infected) this.send(r.id, { t: 'event', event: { kind: 'infected', byAlias: hunter.alias, until: r.infectedUntil } });
    if (!this.activeRunners().length) {
      if (this.withdrewDuringRound) this.finish(now, null, 'All remaining runners caught — a player withdrew, practice result');
      else this.finish(now, 'hunters', infected ? 'Everyone got infected' : 'All runners caught');
    } else this.broadcast(now);
  }

  private newCode(taken: Set<string>) {
    const live = new Set([...this.players.values()].map(p => p.catchCode).filter(Boolean));
    let c: string;
    do c = String(randomInt(0, 10 ** RULES.catchCodeLength)).padStart(RULES.catchCodeLength, '0'); while (taken.has(c) || live.has(c) || this.usedCodes.has(c));
    return c;
  }

  /** Infection over: back to runner with a fresh code / BLE id and a short shield. */
  private cure(p: Player, now: number) {
    p.role = 'runner'; p.infectedUntil = 0; p.shieldUntil = now + INFECTION.cureShieldMs;
    p.catchCode = this.newCode(new Set()); p.bleId = randomBytes(4).toString('hex');
    this.cancelOffers(o => o.targetId === p.id, `${p.alias} recovered — Freeze returned`, false);
    p.items = []; this.claims.delete(p.id); this.sweepHits.delete(p.id);
    p.frozenUntil = 0; p.immuneUntil = 0; p.freezeEndSent = true; p.sweepReadyAt = 0; p.lockedUntil = 0; p.wrongGuesses = 0; p.slashReadyAt = 0;
    this.critical?.();
    this.send(p.id, { t: 'event', event: { kind: 'cured' } });
    if (!this.activeHunters().length) return this.finish(now, null, 'No hunters left — round incomplete'); // the original hunter withdrew earlier
    this.broadcast(now);
  }

  /**
   * Slash: the hunter's phone heard these BLE ids. Strongest in-range runner (by RSSI, and plausible by GPS) is caught.
   * Ids are per-runner, per-round, never sent to hunters: you can only know one by hearing it nearby.
   */
  private slash(h: Player, seen: { id: string; rssi: number }[], now: number): string | null {
    if (this.catchMethod !== 'slash') return 'Slash is off — use the catch code';
    if (this.paused) return 'Game is paused';
    if (this.phase !== 'chase') return 'Catching opens after the head start';
    if (now >= this.chaseEndsAt!) { this.tick(now); return 'Time is up'; }
    if (h.role !== 'hunter' || h.status !== 'active') return 'Only active hunters can slash';
    if (h.frozenUntil > now) return `You’re frozen — ${Math.ceil((h.frozenUntil - now) / 1000)} s`;
    if (h.slashReadyAt > now) return `Slash recharging — ${Math.ceil((h.slashReadyAt - now) / 1000)} s`;
    const hf = this.bestFix(h, now);
    if (!hf) return 'Your GPS is stale — step into open sky, then slash again';
    h.slashReadyAt = now + SLASH.cooldownMs;
    const byId = new Map(this.activeRunners().filter(r => r.bleId).map(r => [r.bleId!, r]));
    // Unlike codes, a BLE id can be overheard and replayed: no runner fix = can't vouch for proximity = no catch (use the code).
    const near = (r: Player) => { const f = this.bestFix(r, now); return !!f && distanceM(hf.p, f.p) - hf.acc - f.acc <= RULES.catchRangeM; };
    const hit = seen.filter(s => s.rssi >= SLASH.minRssi && byId.has(s.id)).sort((a, b) => b.rssi - a.rssi)
      .map(s => byId.get(s.id)!).find(r => r.shieldUntil <= now && near(r));
    if (!hit) {
      const reason = !seen.some(s => byId.has(s.id)) ? 'No runner in range' : 'Nobody close enough — get right next to them (weak GPS? use their code)';
      this.send(h.id, { t: 'event', event: { kind: 'slashMiss', reason } });
      this.broadcast(now);
      return null;
    }
    this.catchRunner(h, hit, now);
    return null;
  }

  private leave(p: Player, now: number, dropped = false) {
    this.send(p.id, { t: 'kicked', reason: dropped ? 'The host continued without you (connection lost). Location sharing stopped.' : 'You left the match. Location sharing stopped.' });
    if (this.phase === 'lobby' || this.phase === 'ended') this.players.delete(p.id);
    else {
      if (p.status === 'active') this.withdrewDuringRound = true;
      p.status = p.status === 'caught' ? 'caught' : 'withdrawn';
      p.loc = undefined; p.fixes = []; p.catchCode = undefined; p.bleId = undefined; p.connected = false; p.infectedUntil = 0;
      this.cancelOffers(o => o.casterId === p.id || o.targetId === p.id, 'Freeze cancelled — player left', false);
      p.items = []; this.claims.delete(p.id);
      for (const [hid, l] of this.sweepHits) this.sweepHits.set(hid, l.filter(d => d.runnerId !== p.id));
      this.disclosures.delete(p.id);
    }
    if (this.hostId === p.id) this.passHost(p.id);
    if (this.ownerId === p.id) this.ownerId = this.hostId;
    if (this.phase === 'headstart' || this.phase === 'chase') {
      if (!this.activeHunters().length) return this.finish(now, null, 'No hunters left — round incomplete');
      const comingBack = [...this.players.values()].some(x => x.status === 'active' && x.infectedUntil > 0 && x.infectedUntil < this.chaseEndsAt!); // infection: cured before the end
      if (!this.activeRunners().length && !comingBack) return this.finish(now, null, 'No runners left — round incomplete');
    }
    this.broadcast(now);
  }

  private finish(now: number, winner: Result['winner'], reason: string) {
    if (!this.players.get(this.hostId)?.connected) this.passHost(this.hostId); // someone must be able to rematch
    const clock = this.paused ? this.paused.since : now; // ending during a pause: paused time doesn't count
    if (this.players.get(this.ownerId)?.connected && this.hostId !== this.ownerId) this.setHost(this.ownerId); // organiser runs the rematch
    this.phase = 'ended';
    this.paused = undefined;
    this.endedAt = now;
    this.result = {
      winner, complete: winner !== null && !this.withdrewDuringRound && !this.degraded, degraded: this.degraded, reason, captures: this.captures,
      participants: this.participants,
      runners: this.participants.map(id => this.players.get(id)).filter(p => p && (p.origRole ?? p.role) === 'runner').map(p => ({ id: p!.id, alias: p!.alias })),
      chaseMs: this.chaseStartedAt ? Math.max(0, Math.min(clock, this.chaseEndsAt!) - this.chaseStartedAt) : 0,
      survivors: this.activeRunners().map(r => r.alias),
    };
    for (const p of this.players.values()) { // purge raw locations at round end; infected go back to what they started as
      p.loc = undefined; p.fixes = []; p.catchCode = undefined; p.bleId = undefined;
      if (p.origRole) p.role = p.origRole;
      p.origRole = undefined; p.infectedUntil = 0; p.shieldUntil = 0;
    }
    this.disclosures.clear(); this.revealCells.clear();
    this.offers.clear(); this.claims.clear(); this.sweepHits.clear();
    this.emitAll({ kind: 'phase', phase: 'ended' });
    this.broadcast(now);
    this.critical?.();
  }

  private rematch(now: number) {
    for (const [id, p] of this.players) if (p.status === 'withdrawn') this.players.delete(id);
    const ps = [...this.players.values()];
    const oldHunters = ps.filter(p => p.role === 'hunter');
    const pool = ps.filter(p => p.role === 'runner').sort(() => Math.random() - 0.5);
    const n = Math.max(1, Math.min(oldHunters.length, pool.length));
    for (const p of ps) { p.role = 'runner'; p.ready = false; p.status = 'active'; }
    pool.slice(0, n).forEach(p => (p.role = 'hunter'));
    if (!ps.some(p => p.role === 'hunter') && ps[0]) ps[0].role = 'hunter';
    this.phase = 'lobby';
    this.stages = []; this.stageIdx = 0; this.zoneNow = undefined; this.graceUntil = undefined; this.exposeNextAt = undefined;
    this.stations = []; for (const p of this.players.values()) p.items = [];
    this.result = undefined; this.captures = []; this.headStartEndsAt = this.chaseStartedAt = this.chaseEndsAt = this.endedAt = undefined;
    this.emitAll({ kind: 'phase', phase: 'lobby' });
  }

  private powerView(me: Player, now: number): Partial<View> {
    if (!this.powersOn || (this.phase !== 'headstart' && this.phase !== 'chase')) return {};
    const v: Partial<View> = {
      items: me.items.map(i => ({ ...i })),
      stations: this.stations.map(s => ({ id: s.id, p: s.p, available: this.stationOpen(s, now), availableAt: s.availableAt > now ? s.availableAt : undefined })),
    };
    const c = this.claims.get(me.id);
    if (c) v.claim = { stationId: c.stationId, startedAt: c.startedAt, fixes: c.fixTs.length };
    if (me.role === 'runner' && me.status === 'active') {
      v.hunterStates = this.activeHunters().map(h => {
        const retry = this.retry.get(`${me.id}|${h.id}`) ?? 0;
        const offerOn = [...this.offers.values()].find(o => o.targetId === h.id);
        return offerOn?.casterId === me.id ? { id: h.id, alias: h.alias, state: 'offered' as const }
          : offerOn ? { id: h.id, alias: h.alias, state: 'unreachable' as const } // someone else's Freeze: don't reveal it
          : h.frozenUntil > now ? { id: h.id, alias: h.alias, state: 'frozen' as const, until: h.immuneUntil } // frozen then immune: both block
          : h.immuneUntil > now ? { id: h.id, alias: h.alias, state: 'immune' as const, until: h.immuneUntil }
          : !this.reachable(h, now) ? { id: h.id, alias: h.alias, state: 'unreachable' as const }
          : retry > now ? { id: h.id, alias: h.alias, state: 'retry' as const, until: retry }
          : { id: h.id, alias: h.alias, state: 'available' as const };
      });
      const o = [...this.offers.values()].find(x => x.casterId === me.id);
      if (o) v.pendingFreeze = { targetAlias: this.players.get(o.targetId)?.alias ?? '', expiresAt: o.expiresAt };
    }
    if (me.role === 'hunter') {
      v.freezeOffer = this.freezeOfferFor(me.id, now);
      if (me.frozenUntil > now) v.frozenUntil = me.frozenUntil;
      if (me.immuneUntil > now) v.immuneUntil = me.immuneUntil;
      if (me.sweepReadyAt > now) v.sweepReadyAt = me.sweepReadyAt;
    }
    return v;
  }

  /** Snapshot for crash recovery. Raw locations are deliberately not persisted. */
  toJSON() {
    return {
      code: this.code, phase: this.phase, hostId: this.hostId, ownerId: this.ownerId, participants: this.participants, presetId: this.presetId, zone: this.zone,
      players: [...this.players.values()].map(({ loc: _l, fixes: _f, ...p }) => p),
      headStartEndsAt: this.headStartEndsAt, chaseStartedAt: this.chaseStartedAt, chaseEndsAt: this.chaseEndsAt, pulseIndex: this.pulseIndex,
      disclosures: [...this.disclosures.values()], lastRevealed: [...this.lastRevealed], revealCells: [...this.revealCells],
      captures: this.captures, withdrewDuringRound: this.withdrewDuringRound, result: this.result, endedAt: this.endedAt,
      lastActivity: this.lastActivity, paused: this.paused, usedCodes: [...this.usedCodes], degraded: this.degraded, contact: this.contact,
      worldId: this.worldId, worldHash: this.worldHash,
      mode: this.mode, infectMs: this.infectMs, catchMethod: this.catchMethod,
      powersOn: this.powersOn, routeSweep: this.routeSweep, stations: this.stations, sweepHits: [...this.sweepHits], retry: [...this.retry],
      shrinkOn: this.shrinkOn, stages: this.stages, stageIdx: this.stageIdx, zoneNow: this.zoneNow, graceUntil: this.graceUntil, exposeNextAt: this.exposeNextAt,
    };
  }

  static fromJSON(j: ReturnType<Match['toJSON']>, send: Send, now: number, savedAt = now): Match {
    const m = new Match(j.code, send);
    Object.assign(m, {
      phase: j.phase, hostId: j.hostId, ownerId: j.ownerId ?? j.hostId, participants: j.participants ?? [], presetId: j.presetId, zone: j.zone,
      headStartEndsAt: j.headStartEndsAt, chaseStartedAt: j.chaseStartedAt, chaseEndsAt: j.chaseEndsAt, pulseIndex: j.pulseIndex,
      captures: j.captures, withdrewDuringRound: j.withdrewDuringRound, result: j.result, endedAt: j.endedAt, lastActivity: now, paused: j.paused,
      usedCodes: new Set(j.usedCodes ?? []), degraded: j.degraded ?? false, contact: j.contact ?? '',
      worldId: j.worldId && worlds.has(j.worldId) ? j.worldId : null, worldHash: j.worldHash,
      mode: j.mode ?? 'classic', infectMs: j.infectMs ?? INFECTION.defaultMs, catchMethod: j.catchMethod ?? 'code',
      powersOn: j.powersOn ?? true, routeSweep: !!j.routeSweep && !!j.worldId && worlds.has(j.worldId), stations: j.stations ?? [], sweepHits: new Map(j.sweepHits ?? []), retry: new Map(j.retry ?? []),
      shrinkOn: j.shrinkOn ?? true, stages: j.stages ?? [], stageIdx: j.stageIdx ?? 0, zoneNow: j.zoneNow, graceUntil: j.graceUntil, exposeNextAt: j.exposeNextAt,
    });
    for (const p of j.players) m.players.set(p.id, {
      ...p, fixes: [], connected: false, lastContact: now, lostAck: false, recentTs: [], techPaused: p.techPaused ?? false,
      items: (p.items ?? []).map(i => ({ ...i, reserved: false })), // pending offers don't survive a restart: refund
      frozenUntil: p.frozenUntil ?? 0, immuneUntil: p.immuneUntil ?? 0, freezeEndSent: p.freezeEndSent ?? true, sweepReadyAt: p.sweepReadyAt ?? 0,
      infectedUntil: p.infectedUntil ?? 0, shieldUntil: p.shieldUntil ?? 0, slashReadyAt: p.slashReadyAt ?? 0,
    });
    for (const d of j.disclosures) m.disclosures.set(d.runnerId, d);
    m.lastRevealed = new Map(j.lastRevealed); m.revealCells = new Map(j.revealCells);
    // A live round resumes only through an explicit recovery pause (TDD D07): the gap was unobserved.
    if ((m.phase === 'headstart' || m.phase === 'chase') && !m.paused) m.paused = { reason: 'recovery', since: Math.min(savedAt, m.chaseEndsAt ?? savedAt) }; // downtime isn't charged to the round
    if (m.phase === 'headstart' || m.phase === 'chase') m.degraded = true; // unobserved gap (TDD D07)
    // the world pack changed or vanished while the server was down: play on, but the round isn't a clean result
    if (j.worldHash && (!m.worldId || worlds.get(m.worldId)?.hash !== j.worldHash) && m.phase !== 'lobby' && m.phase !== 'ended') m.degraded = true;
    if (m.paused && m.paused.reason !== 'recovery' && (m.phase === 'headstart' || m.phase === 'chase')) m.paused.reason = 'recovery';
    if (m.paused) m.paused.resumeAt = undefined;
    return m;
  }

  private emitAll(event: GameEvent) { for (const p of this.players.values()) this.send(p.id, { t: 'event', event }); }

  broadcast(now: number) { this.dirty = true; for (const p of this.players.values()) this.send(p.id, { t: 'view', view: this.viewFor(p, now) }); }

  /** Per-recipient projection. Built field by field so nothing private leaks by accident (TDD §12.1). */
  viewFor(me: Player, now: number): View {
    const hunterView = me.role === 'hunter' && me.status === 'active' && this.phase === 'chase';
    return {
      code: this.code,
      phase: this.phase,
      serverNow: now,
      preset: this.preset,
      zone: this.zone,
      you: {
        id: me.id, alias: me.alias, role: me.role, isHost: me.id === this.hostId, status: me.status, catchCode: me.catchCode,
        infectedUntil: me.infectedUntil || undefined, shieldUntil: me.shieldUntil > now ? me.shieldUntil : undefined,
        bleId: this.catchMethod === 'slash' && me.status === 'active' && (this.phase === 'headstart' || this.phase === 'chase') ? me.bleId : undefined,
      },
      mode: this.mode,
      infectMs: this.infectMs,
      catchMethod: this.catchMethod,
      slashReadyAt: me.role === 'hunter' && me.slashReadyAt > now ? me.slashReadyAt : undefined,
      players: [...this.players.values()].map(p => ({
        id: p.id, alias: p.alias, role: p.role, isHost: p.id === this.hostId, ready: p.ready,
        connected: p.connected, hasFix: this.phase === 'lobby' ? this.freshLoc(p, now) : false, status: p.status, alerts: p.alerts,
        ...(p.infectedUntil > 0 && { infected: true }),
      })),
      headStartEndsAt: this.headStartEndsAt,
      chaseStartedAt: this.chaseStartedAt,
      chaseEndsAt: this.chaseEndsAt,
      nextPulseAt: this.nextPulseAt(),
      pulseIndex: this.pulseIndex - 1,
      disclosures: hunterView ? [...this.disclosures.values(), ...(this.sweepHits.get(me.id) ?? [])].filter(d => d.expiresAt > now).sort((a, b) => b.revealedAt - a.revealedAt) : [],
      lastRevealedAt: me.role === 'runner' ? this.lastRevealed.get(me.id) : undefined,
      yourReveal: me.role === 'runner' && me.status === 'active' ? this.revealCells.get(me.id) : undefined,
      captureLockedUntil: me.role === 'hunter' && me.lockedUntil > now ? me.lockedUntil : undefined,
      paused: this.paused,
      contact: this.contact || undefined,
      shrink: this.shrinkOn,
      zoneNow: this.phase === 'chase' || this.phase === 'headstart' ? this.zoneNow : undefined,
      zoneNext: (() => {
        const st = this.stages[this.stageIdx];
        return (this.phase === 'chase') && st?.announced ? { ...st.circle, at: st.at, stage: this.stageIdx + 1 } : undefined;
      })(),
      graceUntil: this.graceUntil,
      powers: this.powersOn,
      routeSweep: this.routeSweep,
      world: (() => { const w = this.worldId ? worlds.get(this.worldId) : undefined; return w ? { id: w.id, name: w.name, version: w.version, hash: w.hash } : undefined; })(),
      worlds: this.phase === 'lobby' && me.id === this.hostId ? [...worlds.values()].map(w => ({ id: w.id, name: w.name })) : undefined,
      ...this.powerView(me, now),
      shrinkAt: this.phase === 'headstart' || this.phase === 'chase' ? this.stages.slice(this.stageIdx).map(x => x.at) : undefined,
      result: this.result,
    };
  }
}

export class Lobby {
  matches = new Map<string, Match>();
  byToken = new Map<string, { match: Match; playerId: string }>();
  onDelete?: (code: string) => void;

  constructor(private send: Send) {}

  onCritical?: (m: Match) => void;

  restore(m: Match) {
    m.critical = () => this.onCritical?.(m);
    this.matches.set(m.code, m);
    for (const p of m.players.values()) this.byToken.set(p.tokenHash, { match: m, playerId: p.id });
  }

  create(alias: string, now: number): ReturnType<Lobby['join']> {
    if (this.matches.size >= MAX_MATCHES) return 'Server is full, try again later';
    let code: string;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (this.matches.has(code));
    const m = new Match(code, this.send);
    m.critical = () => this.onCritical?.(m);
    this.matches.set(code, m);
    return this.join(code, alias, now);
  }

  join(code: string, alias: string, now: number): { match: Match; player: Player; token: string } | string {
    const m = this.matches.get(code.toUpperCase());
    if (!m) return 'No match with that code';
    const err = m.canJoin(now); if (err) return err;
    const { player, token } = m.addPlayer(alias, now);
    this.byToken.set(player.tokenHash, { match: m, playerId: player.id });
    return { match: m, player, token };
  }

  /** Look up a session by its raw token (only hashes are stored). */
  find(token: string) { return token.length <= 128 ? this.byToken.get(hashToken(token)) : undefined; }

  tick(now: number) {
    for (const [t, ref] of this.byToken) if (!ref.match.players.has(ref.playerId)) this.byToken.delete(t);
    for (const [code, m] of this.matches) {
      m.tick(now);
      if (m.phase === 'lobby') m.refreshFixes(now);
      const idle = now - m.lastActivity;
      const allGone = ![...m.players.values()].some(p => p.connected);
      const abandonedLobby = m.phase === 'lobby' && allGone && idle > 300_000; // stops lobby-slot exhaustion
      if ((m.phase === 'ended' && now - m.endedAt! > 3_600_000) || (allGone && idle > 1_800_000) || abandonedLobby || m.players.size === 0) {
        this.matches.delete(code);
        this.onDelete?.(code);
        for (const [t, ref] of this.byToken) if (ref.match === m) this.byToken.delete(t);
      }
    }
  }
}
