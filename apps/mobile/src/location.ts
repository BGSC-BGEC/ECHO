// Foreground GPS, one subscription for the whole app (map puck + uplink share it).
// Watching only runs while you're in a match; uploads only while you're an active participant.
// ponytail: foreground only; background task + Android foreground service lands in Phase 1.5.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';
import { kvDel, kvSet } from './kv';
import * as Location from 'expo-location';
import { RULES, type LngLat } from '@echo/shared';
import { send, serverNow, useNet, wsOpen } from './net';
import { notifyNow } from './notify';
import { lastBgFixAt, serviceRunning, setBackgroundFixListener, startBackground, stopBackground, uploadViaHttp } from './background';

export interface Fix { p: LngLat; acc: number; ts: number; heading?: number }
interface LocState { permission: 'unknown' | 'granted' | 'denied'; canAskAgain: boolean; servicesOff: boolean; coarse: boolean; fix?: Fix; prev?: Fix }

let st: LocState = { permission: 'unknown', canAskAgain: true, servicesOff: false, coarse: false };
const subs = new Set<() => void>();
const set = (patch: Partial<LocState>) => { st = { ...st, ...patch }; subs.forEach(f => f()); };
let sub: Location.LocationSubscription | null = null;
let starting = false;
let gen = 0; // bumps on stop so an in-flight start can't resurrect tracking

export function useLocation() {
  return useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => st);
}

export const fixAge = (f?: Fix) => (f ? Date.now() - f.ts : Infinity);
/** Same freshness rule the server applies (RULES.maxLocationAgeMs / maxAccuracyM). */
export const fixGood = (f?: Fix) => !!f && fixAge(f) <= RULES.maxLocationAgeMs && f.acc <= RULES.maxAccuracyM;

/** "Approximate" / Precise-off gives ±1-3 km: unplayable, and "step outside" won't fix it. */
const isCoarse = (p: Location.LocationPermissionResponse) => p.android?.accuracy === 'coarse' || p.ios?.accuracy === 'reduced';

export async function checkPermission() {
  const p = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (p) set({ permission: p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'unknown', canAskAgain: p.canAskAgain, coarse: p.granted && isCoarse(p) });
}

/** Ask (or send to Settings if the OS won't ask again). */
export async function requestLocation() {
  if ((st.permission === 'denied' && !st.canAskAgain) || st.coarse) return Linking.openSettings().catch(() => {});
  const r = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (r) set({ permission: r.granted ? 'granted' : 'denied', canAskAgain: r.canAskAgain, coarse: r.granted && isCoarse(r) });
}

export async function startWatching() {
  if (sub || starting) return;
  starting = true;
  const g = ++gen;
  try {
    if (st.permission !== 'granted') return; // the Lobby asks, with context
    set({ servicesOff: !(await Location.hasServicesEnabledAsync().catch(() => true)) });
    const s = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 0, mayShowUserSettingsDialog: true },
      l => {
        const acc = l.coords.accuracy != null && l.coords.accuracy >= 0 ? l.coords.accuracy : 999;
        set({ servicesOff: false, prev: st.fix, fix: { p: [l.coords.longitude, l.coords.latitude], acc, ts: l.timestamp, heading: l.coords.heading ?? undefined } });
      },
    );
    if (g !== gen) s.remove(); // stopped while we were starting
    else sub = s;
  } catch {
    sub = null;
  } finally {
    starting = false;
  }
}

export function stopWatching() {
  gen++;
  sub?.remove();
  sub = null;
  set({ fix: undefined, prev: undefined });
}

/** After returning from background the OS may have torn the watcher down: rebuild it. */
export function restartWatching() {
  if (wantLive && !bgOn) { goLive(liveRole); return; } // retry the background service now that we're foregrounded
  // watchdog: Android can report the service "started" while it silently failed to run — restart it
  // (only when the service really died — a GPS gap indoors is not a dead service)
  if (bgOn && Date.now() - lastBgFixAt > 20_000 && Date.now() > watchdogQuietUntil) {
    serviceRunning().then(running => { if (!running && bgOn) { bgOn = false; goLive(liveRole); } else lastBgFixAtTouch(); });
    return;
  }
  if (!sub) return; // background service survives on its own
  stopWatching();
  startWatching();
}

const toFix = (l: Location.LocationObject): Fix => ({
  p: [l.coords.longitude, l.coords.latitude],
  acc: l.coords.accuracy != null && l.coords.accuracy >= 0 ? l.coords.accuracy : 999,
  ts: l.timestamp, heading: l.coords.heading ?? undefined,
});
setBackgroundFixListener(
  l => { if (bgOn) set({ servicesOff: false, prev: st.fix, fix: toFix(l) }); },
  () => { bgOn = false; wantLive = false; }, // server said stop (caught / ended / left) while we were locked
);
let bgOn = false;
let wantLive = false; // live round wanted but service couldn't start (e.g. phone was locked at round start)

/** Live round: background service (survives screen lock). Falls back to the foreground watch if it can't start. */
let liveRole: 'hunter' | 'runner' = 'runner';
let watchdogQuietUntil = 0;
const lastBgFixAtTouch = () => { watchdogQuietUntil = Date.now() + 20_000; };
async function goLive(role: 'hunter' | 'runner') {
  liveRole = role;
  wantLive = true;
  if (bgOn) return;
  // Android only starts a location foreground service from the foreground; it fails *silently* otherwise.
  if (AppState.currentState !== 'active') {
    notifyNow('Round started — open ECHO', liveRole === 'hunter'
      ? 'Tap to start sharing. Stay at START until the head start ends.'
      : 'Tap to start sharing your location — hunters can’t get your signal until you do.');
    return; // restartWatching() retries on next foreground
  }
  if (st.permission !== 'granted' || !wantLive) return;
  const ok = await startBackground();
  if (!wantLive) { await stopBackground(); return; } // round ended / caught while we were starting
  bgOn = ok;
  if (bgOn) { gen++; sub?.remove(); sub = null; } // one GPS source at a time
  else startWatching();
}

export const backgroundActive = () => bgOn;
async function goIdle() {
  wantLive = false;
  bgOn = false;
  await stopBackground();
}

/** Mount once at app root: GPS on while in a match, streamed to the server while participating. */
export function useLocationUplink() {
  const { view, token } = useNet();
  const { fix, permission } = useLocation();
  const inMatch = !!view && view.phase !== 'ended' && view.you.status === 'active';
  const liveRound = inMatch && (view!.phase === 'headstart' || view!.phase === 'chase');
  const meReady = !!view?.players.find(p => p.id === view.you.id)?.ready;
  // Ready in the lobby counts too: a phone locked while waiting for START keeps its fix (and its READY).
  const live = liveRound || (inMatch && view!.phase === 'lobby' && meReady);
  const sharing = inMatch; // push() picks WS or HTTPS
  const booting = !view && !!token; // cold start: don't tear down a running service before the view arrives

  // Safety net for the background uploader: stop by itself well after the round's deadline.
  const endsAt = view?.chaseEndsAt ?? (view?.headStartEndsAt ? view.headStartEndsAt + view.preset.chaseMs : undefined);
  const paused = !!view?.paused;
  useEffect(() => {
    if (!liveRound) { kvDel('roundStopAt'); return; } // lobby / after the round: no stale self-stop for the HTTPS fallback
    // during a pause deadlines aren't shifted yet: push the self-stop well out until the round resumes
    if (paused) kvSet('roundStopAt', String(Date.now() + 3 * 3_600_000));
    else if (endsAt) kvSet('roundStopAt', String(endsAt - (serverNow() - Date.now()) + 30 * 60_000));
  }, [liveRound, endsAt, paused]);

  // foreground watchdog for the background service (Android may report it running while it isn't)
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { if (AppState.currentState === 'active') restartWatching(); }, 10_000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (permission === 'denied' || booting) return;
    if (live) goLive(view!.you.role);
    else if (inMatch) { goIdle(); startWatching(); }
    else { goIdle(); stopWatching(); } // tracking genuinely stops on capture / leave / end
  }, [inMatch, live, permission, view?.you.role]);

  useEffect(() => {
    if (!sharing || !fix) return;
    const push = () => {
      // backgrounded with the service running: the HTTPS uploader owns the uplink (no double sends)
      if (bgOn && (AppState.currentState !== 'active' || !wsOpen())) return;
      const ok = send({ t: 'loc', lng: fix.p[0], lat: fix.p[1], acc: fix.acc, ageMs: Date.now() - fix.ts, ts: fix.ts }, true);
      // socket down in the foreground: don't drop the fix, send it over HTTPS
      if (!ok && inMatch) uploadViaHttp({ coords: { longitude: fix.p[0], latitude: fix.p[1], accuracy: fix.acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: fix.ts });
    };
    push();
    const id = setInterval(push, 4000); // stationary phones may not emit; resend with honest age
    return () => clearInterval(id);
  }, [sharing, fix]);
  return sharing;
}
