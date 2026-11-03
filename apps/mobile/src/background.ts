// Background location for a live round (Android foreground service / iOS background location mode).
// Must be imported at app entry so the task is defined before the OS delivers updates.
// Socket open + app foreground: fixes go out over the WebSocket (location.ts). Otherwise — locked,
// backgrounded, or the socket is reconnecting — this posts them over HTTPS (TDD §07.2).
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RULES } from '@echo/shared';
import { cancelAlerts, notifyNow } from './notify';
import { kvGet } from './kv';
import { wsOpen } from './net';

export const BG_TASK = 'echo-location';
type Sample = { lng: number; lat: number; acc: number; ageMs: number; ts: number };

let onFix: ((l: Location.LocationObject) => void) | undefined;
let onStopped: (() => void) | undefined;
export const setBackgroundFixListener = (f: typeof onFix, stopped?: () => void) => { onFix = f; onStopped = stopped; };
export let lastBgFixAt = 0; // watchdog: service "started" but delivering nothing

const toSample = (l: Location.LocationObject, now = Date.now()): Sample => ({
  lng: l.coords.longitude, lat: l.coords.latitude,
  acc: l.coords.accuracy != null && l.coords.accuracy >= 0 ? l.coords.accuracy : 999, ageMs: now - l.timestamp, ts: l.timestamp,
});

/** ws(s)://host/ws -> http(s)://host/loc */
export const locUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '') + '/loc';

let queue: Sample[] = [];
let posting = false;
let lastPaused = false; // locked phones learn about pauses only through the upload reply
let lastPostAt = 0;
let failingSince = 0; // locked phone that can't reach the server: tell the player once
let warnedUnreachable = false;
let lastOfferAlert = ''; // locked hunter: alert once per Freeze offer

/** Foreground fallback: a fix the WebSocket couldn't carry goes over HTTPS instead of being lost. */
export const uploadViaHttp = (l: Location.LocationObject) => flush([l]);
export const serviceRunning = () => Location.hasStartedLocationUpdatesAsync(BG_TASK).catch(() => false);

async function flush(locations: Location.LocationObject[]) {
  const now = Date.now();
  // re-derive ages at send time; never drain an old route as fresh
  queue = [...queue.map(q => ({ ...q, ageMs: now - q.ts })), ...locations.map(l => toSample(l, now))]
    .filter(s => s.ageMs <= RULES.maxLocationAgeMs * 3).slice(-RULES.maxBatch);
  if (posting || !queue.length || now - lastPostAt < 3000) return; // ≥3 s between posts (iOS delivers ~1 Hz)
  posting = true;
  lastPostAt = now;
  try {
    const [sessionRaw, url, endsAt] = await Promise.all([kvGet('session'), kvGet('serverUrlResolved'), kvGet('roundStopAt')]);
    if (sessionRaw === undefined || url === undefined || endsAt === undefined) return; // keychain locked: keep samples, retry next fix
    const session = sessionRaw ? JSON.parse(sessionRaw) as { url: string; token: string } : null;
    const token = session && session.url === url ? session.token : null;
    if (!token || !url || (endsAt && Date.now() > Number(endsAt))) { // no session / round long over: stop by ourselves
      await stopBackground(); onStopped?.(); return;
    }
    const batch = queue; queue = [];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000); // a hung mobile-data socket must not wedge the uplink
    try {
      const res = await fetch(locUrl(url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, samples: batch }), signal: ctl.signal });
      const body = await res.json().catch(() => ({}));
      failingSince = 0; warnedUnreachable = false;
      const paused = !!body?.paused;
      if (paused && !lastPaused) {
        await cancelAlerts(); // stale reveal/pulse alerts must not fire during a pause
        notifyNow('PAUSED — stop where it’s safe', `${body.paused.by ?? 'Someone'} paused the round for everyone. Open ECHO.`);
      } else if (!paused && lastPaused && !body?.stop) {
        notifyNow('Round resuming', 'Open ECHO to get reveal alerts again.');
      }
      lastPaused = paused;
      if (body?.freezeOffer?.offerId && body.freezeOffer.offerId !== lastOfferAlert && body.freezeOffer.msLeft > 1500) {
        lastOfferAlert = body.freezeOffer.offerId;
        notifyNow('❄ FREEZE INCOMING', `Stop somewhere safe, open ECHO and tap I’VE STOPPED — about ${Math.floor(body.freezeOffer.msLeft / 1000)} s left.`);
      }
      if (res.status === 401 || body?.stop) { // caught / ended / left: tracking stops
        await cancelAlerts();
        if (body?.phase === 'ended') notifyNow('Round over', 'Open ECHO for the results.');
        else if (body?.status === 'caught') notifyNow('You were caught', 'Location sharing stopped. Head back to START.');
        await stopBackground();
        onStopped?.();
      } else if (!res.ok) queue = [...batch, ...queue].slice(-RULES.maxBatch); // retry next time
    } catch {
      queue = [...batch, ...queue].slice(-RULES.maxBatch); // offline / timeout: keep newest few (age-filtered on next flush)
      failingSince ||= Date.now();
      if (!warnedUnreachable && Date.now() - failingSince > 30_000) {
        warnedUnreachable = true;
        notifyNow('ECHO can’t reach the game', 'Get back on the game Wi-Fi (or turn off “switch to mobile data”). Hunters see you as “signal unavailable”.');
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // storage read failed; try again on the next fix
  } finally {
    posting = false;
  }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BG_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations[data.locations.length - 1];
  lastBgFixAt = Date.now();
  onFix?.(latest);
  // Socket asleep (locked / backgrounded / reconnecting): HTTPS is the uplink.
  if (AppState.currentState !== 'active' || !wsOpen()) await flush(data.locations);
});

export async function startBackground(): Promise<boolean> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) return true;
    lastBgFixAt = Date.now(); lastPaused = false; failingSince = 0; warnedUnreachable = false;
    await Location.startLocationUpdatesAsync(BG_TASK, {
      accuracy: Location.Accuracy.High, // Android: same GPS priority as BestForNavigation; iOS: ~10 m, far less battery
      timeInterval: 3000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ECHO · sharing your location',
        notificationBody: 'Your match gets your approximate area. Don’t swipe ECHO away. Stops when you’re caught, leave, or the round ends.',
        notificationColor: '#18B6C4',
        killServiceOnDestroy: false, // swiping ECHO from recents must not end sharing mid-round; goIdle stops it
      },
    });
    return true;
  } catch {
    return false; // e.g. started while app not foregrounded; caller falls back to foreground watch
  }
}

export async function stopBackground() {
  queue = [];
  try { if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) await Location.stopLocationUpdatesAsync(BG_TASK); } catch {}
}
