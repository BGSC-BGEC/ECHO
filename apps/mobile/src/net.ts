// Connection + game state store. One WebSocket, auto-reconnect, liveness check, session persisted.
import { useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import type { ClientMsg, GameEvent, ServerMsg, View } from '@echo/shared';
import { kvDel, kvGet, kvSet } from './kv';

// Release builds bake EXPO_PUBLIC_SERVER_URL (wss://your-domain/ws). In dev, the Metro host runs the server.
const BUILD_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const DEFAULT_SERVER = BUILD_URL || (devHost ? `ws://${devHost}:8787/ws` : '');

/** wss:// anywhere; plain ws:// only to a private LAN address (tokens must never cross the internet in cleartext). */
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
export function validServerUrl(u: string) {
  const m = /^(wss?):\/\/([^\s/:]+)(:\d+)?(\/\S*)?$/.exec(u);
  return !!m && (m[1] === 'wss' || PRIVATE.test(m[2]));
}

type Status = 'connecting' | 'open' | 'closed';
interface State {
  status: Status;
  serverUrl: string;
  view?: View;
  token?: string;
  error?: { msg: string; at: number };
  kicked?: string;
  offset: number; // serverTime ≈ Date.now() + offset
  synced: boolean; // offset measured by ping (better than the view's serverNow)
  downSince?: number; // when the socket last stopped being open
}

let state: State = { status: 'closed', serverUrl: DEFAULT_SERVER, offset: 0, synced: false };
const subs = new Set<() => void>();
const eventSubs = new Set<(e: GameEvent) => void>();
let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let connectTimer: ReturnType<typeof setTimeout> | undefined;
let bestRtt = Infinity;
let lastPong = 0;
let pendingLeave: { url: string; token: string } | undefined; // leave requested offline: flushed on reconnect

const set = (patch: Partial<State>) => {
  if (patch.status) patch.downSince = patch.status === 'open' ? undefined : state.downSince ?? Date.now();
  state = { ...state, ...patch }; subs.forEach(f => f());
};
export const toast = (msg: string) => set({ error: { msg, at: Date.now() } });

export function useNet() {
  return useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => state);
}
export function onGameEvent(f: (e: GameEvent) => void) { eventSubs.add(f); return () => { eventSubs.delete(f); }; }
export const serverNow = () => Date.now() + state.offset;
export const wsOpen = () => ws?.readyState === WebSocket.OPEN;

/** Returns false (and toasts) when offline so callers never lose an action silently. */
export function send(msg: ClientMsg, quiet = false): boolean {
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return true; }
  if (!quiet) toast('Not connected — reconnecting…');
  return false;
}

/** The session is bound to the server that issued it; it's never offered to another server. */
const saveSession = (token?: string) => (token ? kvSet('session', JSON.stringify({ url: state.serverUrl, token })) : kvDel('session'));

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'session':
      retry = 0;
      saveSession(msg.token);
      return set({ token: msg.token, kicked: undefined });
    case 'view':
      retry = 0;
      if (!state.synced) set({ offset: msg.view.serverNow - Date.now() }); // rough until the first pong
      return set({ view: msg.view });
    case 'event':
      return eventSubs.forEach(f => f(msg.event));
    case 'error':
      return toast(msg.msg);
    case 'kicked':
      saveSession(undefined);
      return set({ view: undefined, token: undefined, kicked: msg.reason });
    case 'pong': {
      // TDD M05: keep the lowest-RTT sample's offset.
      const c3 = Date.now();
      lastPong = c3;
      const rtt = c3 - msg.c0;
      if (rtt <= bestRtt * 1.5) { bestRtt = Math.min(bestRtt, rtt); set({ offset: msg.s - (msg.c0 + c3) / 2, synced: true }); }
    }
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
}

function connect() {
  clearTimeout(retryTimer); clearTimeout(connectTimer);
  const old = ws;
  ws = null;
  try { old?.close(); } catch {}
  if (!state.serverUrl) { set({ status: 'closed' }); return; } // no server configured yet
  set({ status: 'connecting' });
  let sock: WebSocket;
  try { sock = new WebSocket(state.serverUrl); } catch { set({ status: 'closed' }); return scheduleRetry(); }
  ws = sock;
  // A handshake on a dead Wi-Fi/LTE handoff can hang until the OS TCP timeout: give up after 6 s.
  connectTimer = setTimeout(() => { if (ws === sock && sock.readyState === WebSocket.CONNECTING) { set({ status: 'closed' }); connect(); } }, 6000);
  sock.onopen = () => {
    if (ws !== sock) return;
    clearTimeout(connectTimer);
    retry = 0; // reachable again: next drop retries fast
    bestRtt = Infinity; lastPong = Date.now();
    set({ status: 'open' });
    if (pendingLeave?.url === state.serverUrl) {
      send({ t: 'hello', token: pendingLeave.token }, true); send({ t: 'leave' }, true); pendingLeave = undefined;
    } else if (state.token) send({ t: 'hello', token: state.token }, true);
    for (let i = 0; i < 3; i++) setTimeout(() => send({ t: 'ping', c0: Date.now() }, true), i * 300);
  };
  sock.onmessage = e => { if (ws === sock) try { onMessage(JSON.parse(String(e.data))); } catch {} };
  sock.onclose = () => {
    if (ws !== sock) return;
    clearTimeout(connectTimer);
    set({ status: 'closed' });
    scheduleRetry();
  };
}

// Liveness: ping every 5 s; a half-open socket (Wi-Fi handoff) never fires onclose, so force it.
setInterval(() => {
  if (ws?.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastPong > 15_000) { connect(); return; }
  send({ t: 'ping', c0: Date.now() }, true);
}, 5_000);

export async function boot() {
  const [sessionRaw, savedRaw] = await Promise.all([kvGet('session'), kvGet('serverUrl')]);
  // A user-entered server only wins while the app was built with the same default (new builds bring new defaults).
  let url = DEFAULT_SERVER;
  try { const s = savedRaw ? JSON.parse(savedRaw) : null; if (s && s.build === BUILD_URL && validServerUrl(s.url)) url = s.url; } catch {}
  let token: string | undefined;
  try { const s = sessionRaw ? JSON.parse(sessionRaw) : null; if (s?.url === url) token = s.token; } catch {}
  set({ token, serverUrl: url });
  kvSet('serverUrlResolved', url); // for the background uploader
  if (token) saveSession(token); // re-save: migrates items written with the old keychain class
  kvDel('token'); // legacy plain-token key from early builds
  connect();
}

export function setServerUrl(url: string): boolean {
  if (!validServerUrl(url)) { toast('Use wss://your-domain/ws (or ws:// only for a laptop on the same Wi-Fi)'); return false; }
  // Never offer a session to a different server — except the same LAN game server whose IP changed (DHCP).
  const lanMove = (u: string) => u.startsWith('ws://') && validServerUrl(u);
  if (url !== state.serverUrl && !(lanMove(url) && lanMove(state.serverUrl))) { saveSession(undefined); set({ token: undefined, view: undefined }); }
  else if (url !== state.serverUrl && state.token) kvSet('session', JSON.stringify({ url, token: state.token }));
  kvSet('serverUrl', JSON.stringify({ url, build: BUILD_URL }));
  kvSet('serverUrlResolved', url);
  set({ serverUrl: url, kicked: undefined });
  retry = 0;
  connect();
  return true;
}

/** Foreground again: JS timers were paused, so probe before tearing down a socket that may be fine. */
export function resumeNow() {
  if (ws?.readyState !== WebSocket.OPEN) { retry = 0; connect(); return; }
  const asked = Date.now();
  send({ t: 'ping', c0: asked }, true);
  setTimeout(() => { if (lastPong < asked) { retry = 0; connect(); } }, 3000);
}

export function leaveMatch() {
  // Leave works offline too: local sharing stops now, the server is told on reconnect.
  if (!send({ t: 'leave' }, true) && state.token) pendingLeave = { url: state.serverUrl, token: state.token };
  saveSession(undefined);
  set({ view: undefined, token: undefined, kicked: 'You left. Location sharing stopped.' });
}

export const clearKicked = () => set({ kicked: undefined });

/** Acknowledge a Freeze even if the socket isn't back yet (phone just woken by the alert). */
export async function ackFreeze(offerId: string) {
  if (send({ t: 'ackFreeze', offerId }, true)) return;
  if (!state.token || !state.serverUrl) return toast('Not connected — reconnecting…');
  const url = state.serverUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '') + '/ack';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: state.token, offerId }) });
    const body = await res.json().catch(() => ({}));
    if (!body?.ok) toast(body?.error ?? 'Couldn’t acknowledge — reconnecting…');
  } catch { toast('Not connected — reconnecting…'); }
}
