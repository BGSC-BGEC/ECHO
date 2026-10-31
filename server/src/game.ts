// Authoritative match logic. Pure w.r.t. time: every entry point takes `now`.
// ponytail: single process; state snapshotted to SQLite (store.ts) and restored into a recovery pause.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  CODE_LENGTH, PRESETS, RULES, SHRINK, cellRing, clearlyOutside, distanceM, fromLocal, inZone, rimInZone, startPoint, zoneCircle, zoneOrigin,
  type Circle,
  type ClientMsg, type Disclosure, type GameEvent, type LngLat, type Phase, type PlayerSummary,
  type PauseReason, type PauseState, type PresetId, type Result, type Role, type ServerMsg, type View, type Zone,
} from '@echo/shared';

type Send = (playerId: string, msg: ServerMsg) => void;
type Fix = { p: LngLat; acc: number; measuredAt: number };
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
  catchCode?: string;
  wrongGuesses: number; // hunter: wrong codes since last cooldown
  lockedUntil: number; // hunter: capture cooldown after repeated wrong codes
  hadFix: boolean;
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
        const f: Fix = { p: [msg.lng, msg.lat], acc: msg.acc, measuredAt: now - Math.max(0, msg.ageMs) - RULES.transitAllowanceMs };
        if (msg.ts !== undefined) { if (me.recentTs.includes(msg.ts)) return null; me.recentTs = [...me.recentTs, msg.ts].slice(-20); } // same fix via WS + HTTP
        if (me.loc && f.measuredAt <= me.loc.measuredAt) return null; // out-of-order / older sample
        if (me.loc) { // teleport quarantine: a review signal, never a punishment (BP §14.2)
          const dt = Math.max(1, (f.measuredAt - me.loc.measuredAt) / 1000);
          if ((distanceM(me.loc.p, f.p) - f.acc - me.loc.acc) / dt > RULES.maxSpeedMps && now - me.loc.measuredAt < RULES.maxLocationAgeMs) return null;
        }
        me.loc = f;
        me.fixes = [...me.fixes.filter(x => now - x.measuredAt <= RULES.fixBufferMs), f].slice(-15);
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
    if (this.phase === 'chase' && now >= this.chaseEndsAt!) { // terminal deadline first (TDD §03.4)
      const alive = this.activeRunners();
      return this.finish(now, alive.length ? 'runners' : 'hunters', alive.length ? 'Time ran out — runners survived' : 'All runners caught');
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
      const alive = this.activeRunners();
      this.finish(now, alive.length ? 'runners' : 'hunters', alive.length ? 'Time ran out — runners survived' : 'All runners caught');
      return;
    }
    const I = this.preset.pulseIntervalMs, L = this.preset.chaseMs;
    let due = 0;
    while (this.pulseIndex * I < L && this.chaseStartedAt! + this.pulseIndex * I <= now) { due = this.pulseIndex; this.pulseIndex++; }
    if (due) this.pulse(due, now); // a late wake-up emits one fresh pulse, not a stale burst
    this.shrinkTick(now);
  }

  private lost(p: Player, now: number, ms: number = RULES.lostContactPauseMs) { return !p.connected && now - p.lastContact > ms; }

  private pause(reason: PauseReason, by: string | undefined, now: number, byId?: string) {
    this.paused = { reason, by, byId, since: now };
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

  private activeRunners() { return [...this.players.values()].filter(p => p.role === 'runner' && p.status === 'active'); }
  private activeHunters() { return [...this.players.values()].filter(p => p.role === 'hunter' && p.status === 'active'); }

  private startRound(now: number) {
    const used = new Set<string>();
    for (const p of this.players.values()) {
      p.status = 'active'; p.wrongGuesses = 0; p.lockedUntil = 0; p.catchCode = undefined;
      if (p.role !== 'runner') continue;
      let c: string;
      do c = String(randomInt(0, 10 ** RULES.catchCodeLength)).padStart(RULES.catchCodeLength, '0'); while (used.has(c));
      used.add(c); p.catchCode = c;
    }
    this.revealCells.clear();
    this.participants = [...this.players.keys()];
    this.usedCodes.clear(); this.degraded = false;
    for (const p of this.players.values()) { p.pauses = 0; p.techPaused = false; }
    this.phase = 'headstart';
    this.paused = undefined;
    for (const p of this.players.values()) { p.lastContact = now + RULES.lostContactPauseMs; p.lostAck = false; p.recentTs = []; } // grace while phones switch to background sharing
    this.headStartEndsAt = now + this.preset.headStartMs;
    this.planShrink(this.headStartEndsAt);
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
    if (hunter.lockedUntil > now) return `Too many wrong codes — wait ${Math.ceil((hunter.lockedUntil - now) / 1000)} s`;
    if (this.usedCodes.has(code)) return 'That runner is already caught';
    const found = [...this.players.values()].find(p => p.role === 'runner' && p.status === 'active' && p.catchCode === code);
    // Proximity gate: a correct code entered from far away counts as a wrong guess (stops remote brute force).
    // Uses only server-side fixes; unknown runner position doesn't block a real in-person catch.
    const hf = this.bestFix(hunter, now), rf = found && this.bestFix(found, now);
    const near = !found || !rf || (hf && distanceM(hf.p, rf.p) - hf.acc - rf.acc <= RULES.catchRangeM);
    const r = hf && near ? found : undefined;
    if (!hf && found) return 'Your GPS is stale — step into open sky, then enter the code again';
    if (!r) {
      hunter.wrongGuesses++;
      if (hunter.wrongGuesses >= RULES.catchWrongBeforeCooldown) { hunter.wrongGuesses = 0; hunter.lockedUntil = now + RULES.catchCooldownMs; }
      this.send(hunter.id, { t: 'event', event: { kind: 'catchFailed', attemptsLeft: RULES.catchWrongBeforeCooldown - hunter.wrongGuesses, lockedUntil: hunter.lockedUntil > now ? hunter.lockedUntil : undefined } });
      this.broadcast(now);
      return null; // catchFailed event carries the feedback
    }
    hunter.wrongGuesses = 0;
    this.usedCodes.add(code);
    r.status = 'caught'; r.catchCode = undefined; r.loc = undefined; r.fixes = [];
    this.disclosures.delete(r.id); this.revealCells.delete(r.id);
    this.captures.push({ runnerId: r.id, alias: r.alias, byAlias: hunter.alias, atChaseMs: now - this.chaseStartedAt! });
    this.critical?.();
    this.emitAll({ kind: 'captured', runnerId: r.id, alias: r.alias, byAlias: hunter.alias });
    if (!this.activeRunners().length) {
      if (this.withdrewDuringRound) this.finish(now, null, 'All remaining runners caught — a player withdrew, practice result');
      else this.finish(now, 'hunters', 'All runners caught');
    } else this.broadcast(now);
    return null;
  }

  private leave(p: Player, now: number, dropped = false) {
    this.send(p.id, { t: 'kicked', reason: dropped ? 'The host continued without you (connection lost). Location sharing stopped.' : 'You left the match. Location sharing stopped.' });
    if (this.phase === 'lobby' || this.phase === 'ended') this.players.delete(p.id);
    else {
      if (p.status === 'active') this.withdrewDuringRound = true;
      p.status = p.status === 'caught' ? 'caught' : 'withdrawn';
      p.loc = undefined; p.fixes = []; p.catchCode = undefined; p.connected = false;
      this.disclosures.delete(p.id);
    }
    if (this.hostId === p.id) this.passHost(p.id);
    if (this.ownerId === p.id) this.ownerId = this.hostId;
    if (this.phase === 'headstart' || this.phase === 'chase') {
      if (!this.activeHunters().length) return this.finish(now, null, 'No hunters left — round incomplete');
      if (!this.activeRunners().length) return this.finish(now, null, 'No runners left — round incomplete');
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
      runners: this.participants.map(id => this.players.get(id)).filter(p => p && p.role === 'runner').map(p => ({ id: p!.id, alias: p!.alias })),
      chaseMs: this.chaseStartedAt ? Math.max(0, Math.min(clock, this.chaseEndsAt!) - this.chaseStartedAt) : 0,
      survivors: this.activeRunners().map(r => r.alias),
    };
    for (const p of this.players.values()) { p.loc = undefined; p.fixes = []; p.catchCode = undefined; } // purge raw locations at round end
    this.disclosures.clear(); this.revealCells.clear();
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
    this.result = undefined; this.captures = []; this.headStartEndsAt = this.chaseStartedAt = this.chaseEndsAt = this.endedAt = undefined;
    this.emitAll({ kind: 'phase', phase: 'lobby' });
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
      shrinkOn: j.shrinkOn ?? true, stages: j.stages ?? [], stageIdx: j.stageIdx ?? 0, zoneNow: j.zoneNow, graceUntil: j.graceUntil, exposeNextAt: j.exposeNextAt,
    });
    for (const p of j.players) m.players.set(p.id, { ...p, fixes: [], connected: false, lastContact: now, lostAck: false, recentTs: [], techPaused: p.techPaused ?? false });
    for (const d of j.disclosures) m.disclosures.set(d.runnerId, d);
    m.lastRevealed = new Map(j.lastRevealed); m.revealCells = new Map(j.revealCells);
    // A live round resumes only through an explicit recovery pause (TDD D07): the gap was unobserved.
    if ((m.phase === 'headstart' || m.phase === 'chase') && !m.paused) m.paused = { reason: 'recovery', since: Math.min(savedAt, m.chaseEndsAt ?? savedAt) }; // downtime isn't charged to the round
    if (m.phase === 'headstart' || m.phase === 'chase') m.degraded = true; // unobserved gap (TDD D07)
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
      you: { id: me.id, alias: me.alias, role: me.role, isHost: me.id === this.hostId, status: me.status, catchCode: me.catchCode },
      players: [...this.players.values()].map(p => ({
        id: p.id, alias: p.alias, role: p.role, isHost: p.id === this.hostId, ready: p.ready,
        connected: p.connected, hasFix: this.phase === 'lobby' ? this.freshLoc(p, now) : false, status: p.status, alerts: p.alerts,
      })),
      headStartEndsAt: this.headStartEndsAt,
      chaseStartedAt: this.chaseStartedAt,
      chaseEndsAt: this.chaseEndsAt,
      nextPulseAt: this.nextPulseAt(),
      pulseIndex: this.pulseIndex - 1,
      disclosures: hunterView ? [...this.disclosures.values()].filter(d => d.expiresAt > now) : [],
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
