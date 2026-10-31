// Shared protocol + rules constants for ECHO Phase 1 (baseline GPS manhunt).
// Server is authoritative; clients only ever receive their own projected View.

export type LngLat = [lng: number, lat: number];
export type Role = 'hunter' | 'runner';
export type Phase = 'lobby' | 'headstart' | 'chase' | 'ended';

export type Zone =
  | { kind: 'circle'; center: LngLat; radiusM: number }
  | { kind: 'polygon'; ring: LngLat[] };

export type PauseReason = 'safety' | 'technical' | 'recovery';
export interface PauseState {
  reason: PauseReason;
  by?: string; // alias who paused, or who was lost (technical)
  byId?: string; // technical: the lost player's id (auto-resume when they're back)
  since: number; // clocks are frozen at this instant
  resumeAt?: number; // countdown to resume, if the host has resumed
}

/** Active play circle while the zone shrinks; the real play area is (host zone ∩ this circle). */
export interface Circle { center: LngLat; radiusM: number }

/**
 * Shrinking zone (opt-in per match). Stages at fractions of the chase; each is announced `announceMs` ahead
 * with the next circle shown. It only ever shrinks inside the host-drawn zone (BP §07: no pressure through
 * roads/locked gates — the host's zone already excludes them). Runners outside after a grace period are
 * "exposed": hunters get their rough area every `exposeEveryMs`. Nobody is eliminated for it.
 */
export const SHRINK = {
  stages: [{ at: 0.45, factor: 0.75 }, { at: 0.65, factor: 0.55 }, { at: 0.85, factor: 0.4 }],
  minRadiusM: 80, // well above GPS error (≤50 m), so the edge isn't decided by noise
  announceMs: 60_000, // capped at 15% of the chase for short rounds
  graceMs: 20_000,
  exposeEveryMs: 20_000,
} as const;

export type PresetId = 'test' | 'quick' | 'classic' | 'long';

export interface Preset {
  id: PresetId;
  label: string;
  headStartMs: number;
  chaseMs: number;
  pulseIntervalMs: number;
}

// BP §04.1 Classic Signals values; others are shorter/longer variants for testing.
export const PRESETS: Record<PresetId, Preset> = {
  test: { id: 'test', label: 'Test · 3 min', headStartMs: 10_000, chaseMs: 180_000, pulseIntervalMs: 30_000 },
  quick: { id: 'quick', label: 'Quick · 8 min', headStartMs: 30_000, chaseMs: 480_000, pulseIntervalMs: 60_000 },
  classic: { id: 'classic', label: 'Classic · 18 min', headStartMs: 60_000, chaseMs: 1_080_000, pulseIntervalMs: 90_000 },
  long: { id: 'long', label: 'Long · 30 min', headStartMs: 90_000, chaseMs: 1_800_000, pulseIntervalMs: 120_000 },
};

export const CODE_LENGTH = 6; // join codes (server generates, client input accepts exactly this)

export const RULES = {
  pulseBrightMs: 12_000, // BP §05.2
  disclosureMaxAgeMs: 90_000,
  cellM: 25, // BP §05.3
  wideCellM: 50, // used when accuracy is 25-50 m (enlarge, don't fake precision)
  maxAccuracyM: 50,
  maxLocationAgeMs: 10_000,
  catchCodeLength: 4,
  catchWrongBeforeCooldown: 3,
  catchCooldownMs: 30_000,
  lostContactPauseMs: 30_000, // last runner/hunter unreachable this long -> technical pause (BP §04.6)
  lostAnyPauseMs: 90_000, // any active player unreachable this long -> technical pause
  heartbeatTimeoutMs: 20_000, // silent socket considered dead (clients ping every 5 s)
  resumeCountdownMs: 5_000,
  fixBufferMs: 30_000, // bounded private quality buffer (TDD §08.1)
  assumedSpeedMps: 1.5, // trade older-but-sharper fixes against movement when picking the best fix
  maxBatch: 20,
  transitAllowanceMs: 1_000, // upload delay we can't measure: count it against freshness (TDD §08.2)
  maxSpeedMps: 12, // faster than a sprint between fixes = quarantined jump (TDD §08.5)
  catchRangeM: 40, // hunter must plausibly be near the runner whose code they enter (beyond GPS error)
  maxPausesPerPlayer: 3,
} as const;

// ---- wire messages ----

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'create'; alias: string }
  | { t: 'join'; code: string; alias: string }
  | { t: 'setRole'; playerId: string; role: Role }
  | { t: 'shuffleRoles'; hunters: number }
  | { t: 'setPreset'; preset: PresetId }
  | { t: 'setZone'; zone: Zone }
  | { t: 'ready'; ready: boolean; alerts?: boolean } // alerts = notifications allowed on this phone
  | { t: 'setContact'; contact: string } // host: event contact / meeting instructions (BP §13)
  | { t: 'setShrink'; on: boolean } // host, lobby: shrinking zone on/off
  | { t: 'start' }
  | { t: 'loc'; lng: number; lat: number; acc: number; ageMs: number; ts?: number } // ageMs = fix age at send; ts = device fix timestamp (dedupe key)
  | { t: 'capture'; code: string } // codes are unique per round; server resolves the runner
  | { t: 'kick'; playerId: string } // host, lobby/ended only
  | { t: 'endRound' } // host, live round
  | { t: 'pause' } // any non-withdrawn participant incl. caught (safety: no vote, BP §13/§04.7); non-host players 3 per round, host unlimited
  | { t: 'resume' } // host; starts a short countdown
  | { t: 'dropPlayer'; playerId: string } // host, while paused: continue without an unreachable player
  | { t: 'leave' }
  | { t: 'rematch' }
  | { t: 'ping'; c0: number };

export type GameEvent =
  | { kind: 'pulse'; index: number }
  | { kind: 'revealed' }
  | { kind: 'unavailable' } // your fix was too old/inaccurate at a pulse
  | { kind: 'captured'; runnerId: string; alias: string; byAlias: string }
  | { kind: 'phase'; phase: Phase }
  | { kind: 'catchFailed'; attemptsLeft: number; lockedUntil?: number }
  | { kind: 'readyReset'; reason: string }
  | { kind: 'paused'; reason: PauseReason; by?: string }
  | { kind: 'resumed' }
  | { kind: 'hostChanged'; alias: string; you: boolean }
  | { kind: 'zoneWarning'; at: number } // next shrink announced
  | { kind: 'zoneShrunk'; stage: number }
  | { kind: 'exposed' }; // runner: you're outside the shrinking zone and hunters just saw you

export type ServerMsg =
  | { t: 'session'; token: string; playerId: string; code: string }
  | { t: 'view'; view: View }
  | { t: 'event'; event: GameEvent }
  | { t: 'error'; msg: string }
  | { t: 'kicked'; reason: string }
  | { t: 'pong'; c0: number; s: number };

export interface PlayerSummary {
  id: string;
  alias: string;
  role: Role;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  hasFix: boolean;
  alerts: boolean; // can receive pocket alerts
  status: 'active' | 'caught' | 'withdrawn';
}

export interface Disclosure {
  runnerId: string;
  alias: string;
  unavailable: boolean;
  exposed?: boolean; // revealed because they were outside the shrinking zone (a declared game rule)
  cell?: LngLat[]; // closed ring polygon of the coarse area
  sampledAt?: number;
  revealedAt: number;
  brightUntil: number;
  expiresAt: number;
}

export interface Result {
  winner: 'hunters' | 'runners' | null;
  complete: boolean; // false = practice/incomplete (withdrawals etc.)
  reason: string;
  chaseMs: number; // how long the chase actually ran
  participants: string[]; // player ids who played this round (late joiners excluded)
  runners: { id: string; alias: string }[]; // who ran this round (kept even if they leave the results screen)
  degraded: boolean; // server restart or host continued past an unreachable player: not a clean competitive result
  captures: { runnerId: string; alias: string; byAlias: string; atChaseMs: number }[];
  survivors: string[];
}

export interface View {
  code: string;
  phase: Phase;
  serverNow: number;
  preset: Preset;
  zone: Zone | null;
  you: { id: string; alias: string; role: Role; isHost: boolean; status: PlayerSummary['status']; catchCode?: string };
  players: PlayerSummary[];
  headStartEndsAt?: number;
  chaseStartedAt?: number;
  chaseEndsAt?: number;
  nextPulseAt?: number;
  pulseIndex: number;
  disclosures: Disclosure[]; // hunters only; empty for runners
  lastRevealedAt?: number; // runners: when you were last revealed
  yourReveal?: { cell: LngLat[]; at: number; expiresAt: number }; // runners: the area hunters just saw
  captureLockedUntil?: number; // hunters: wrong-code cooldown
  paused?: PauseState;
  contact?: string; // host-entered event contact / meeting instructions
  shrink: boolean; // shrinking zone enabled for this match
  zoneNow?: Circle; // current active circle (round in progress, shrink on)
  zoneNext?: Circle & { at: number; stage: number }; // announced next circle and when it applies
  graceUntil?: number; // after a shrink: no exposure until this time
  shrinkAt?: number[]; // when upcoming shrinks happen (times only — the circles stay secret until announced)
  result?: Result;
}

// ---- geo helpers (local equirectangular metres; fine at campus scale) ----

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

export function toLocal(p: LngLat, origin: LngLat): [e: number, n: number] {
  const k = Math.cos((origin[1] * Math.PI) / 180) * M_PER_DEG_LNG_EQ;
  return [(p[0] - origin[0]) * k, (p[1] - origin[1]) * M_PER_DEG_LAT];
}

export function fromLocal(en: [number, number], origin: LngLat): LngLat {
  const k = Math.cos((origin[1] * Math.PI) / 180) * M_PER_DEG_LNG_EQ;
  return [origin[0] + en[0] / k, origin[1] + en[1] / M_PER_DEG_LAT];
}

export function distanceM(a: LngLat, b: LngLat): number {
  const [e, n] = toLocal(b, a);
  return Math.hypot(e, n);
}

export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function zoneOrigin(z: Zone): LngLat {
  if (z.kind === 'circle') return z.center;
  const n = z.ring.length;
  return [z.ring.reduce((s, p) => s + p[0], 0) / n, z.ring.reduce((s, p) => s + p[1], 0) / n];
}

/** Where hunters wait / players regroup: centre for circles; centroid if it's inside a polygon, else its first corner. */
export function startPoint(z: Zone): LngLat {
  if (z.kind === 'circle') return z.center;
  const c = zoneOrigin(z);
  return pointInRing(c, z.ring) ? c : z.ring[0];
}

/** In the playable area right now: host zone, and inside the active shrink circle if there is one. */
export function inPlay(p: LngLat, z: Zone, c?: Circle): boolean {
  return inZone(p, z) && (!c || distanceM(p, c.center) <= c.radiusM);
}

/** Tight-ish circle around a zone — the starting shrink circle. Tries bounds centre and vertex mean, keeps the smaller. */
export function zoneCircle(z: Zone): Circle {
  if (z.kind === 'circle') return { center: z.center, radiusM: z.radiusM };
  const lng = z.ring.map(p => p[0]), lat = z.ring.map(p => p[1]);
  const cands: LngLat[] = [[(Math.min(...lng) + Math.max(...lng)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2], zoneOrigin(z)];
  return cands.map(center => ({ center, radiusM: Math.max(...z.ring.map(p => distanceM(center, p))) }))
    .sort((a, b) => a.radiusM - b.radiusM)[0];
}

/** Share of a circle's rim that lies in the host zone (cheap proxy for "this circle is mostly playable ground"). */
export function rimInZone(c: Circle, z: Zone, n = 16): number {
  return circleRing(c, n).slice(0, n).filter(p => inZone(p, z)).length / n;
}

/** Outside the playable area, with GPS error in the player's favour (a ±45 m fix near the edge isn't "outside"). */
export function clearlyOutside(p: LngLat, acc: number, z: Zone, c?: Circle): boolean {
  if (c && distanceM(p, c.center) - acc > c.radiusM) return true;
  return !inZone(p, z);
}

export function circleRing(c: Circle, n = 64): LngLat[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return fromLocal([Math.cos(a) * c.radiusM, Math.sin(a) * c.radiusM], c.center);
  });
}

export function inZone(p: LngLat, z: Zone): boolean {
  return z.kind === 'circle' ? distanceM(p, z.center) <= z.radiusM : pointInRing(p, z.ring);
}

/** Zone boundary as a closed ring (circle approximated with 64 segments). */
export function zoneRing(z: Zone): LngLat[] {
  if (z.kind === 'polygon') return [...z.ring, z.ring[0]];
  const pts: LngLat[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push(fromLocal([Math.cos(a) * z.radiusM, Math.sin(a) * z.radiusM], z.center));
  }
  return pts;
}

/** Stable grid cell containing p (TDD M13: mathematical floor, fixed origin). */
export function cellRing(p: LngLat, origin: LngLat, sizeM: number): LngLat[] {
  const [e, n] = toLocal(p, origin);
  const i = Math.floor(e / sizeM);
  const j = Math.floor(n / sizeM);
  const c = (a: number, b: number) => fromLocal([a * sizeM, b * sizeM], origin);
  return [c(i, j), c(i + 1, j), c(i + 1, j + 1), c(i, j + 1), c(i, j)];
}
