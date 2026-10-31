// Trust boundary: every client message is checked here before game logic sees it.
import { PRESETS, type ClientMsg, type LngLat, type Zone } from '@echo/shared';

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const lngLat = (v: unknown): v is LngLat => Array.isArray(v) && v.length === 2 && num(v[0], -180, 180) && num(v[1], -90, 90);

function zone(z: any): Zone | null {
  if (z?.kind === 'circle' && lngLat(z.center) && num(z.radiusM, 30, 3000)) return { kind: 'circle', center: z.center, radiusM: z.radiusM };
  if (z?.kind === 'polygon' && Array.isArray(z.ring) && z.ring.length >= 3 && z.ring.length <= 64 && z.ring.every(lngLat))
    return { kind: 'polygon', ring: z.ring };
  return null;
}

export function parseClientMsg(raw: string): ClientMsg | null {
  let m: any;
  try { m = JSON.parse(raw); } catch { return null; }
  switch (m?.t) {
    case 'hello': return str(m.token, 128) ? { t: 'hello', token: m.token } : null;
    case 'create': return str(m.alias, 16) ? { t: 'create', alias: m.alias.trim() } : null;
    case 'join': return str(m.code, 8) && str(m.alias, 16) ? { t: 'join', code: m.code.trim().toUpperCase(), alias: m.alias.trim() } : null;
    case 'setRole': return str(m.playerId, 64) && (m.role === 'hunter' || m.role === 'runner') ? { t: 'setRole', playerId: m.playerId, role: m.role } : null;
    case 'shuffleRoles': return num(m.hunters, 1, 15) ? { t: 'shuffleRoles', hunters: Math.floor(m.hunters) } : null;
    case 'setPreset': return typeof m.preset === 'string' && Object.hasOwn(PRESETS, m.preset) ? { t: 'setPreset', preset: m.preset } : null;
    case 'setZone': { const z = zone(m.zone); return z ? { t: 'setZone', zone: z } : null; }
    case 'ready': return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready, alerts: m.alerts === true } : null;
    case 'loc': return num(m.lng, -180, 180) && num(m.lat, -90, 90) && num(m.acc, 0, 10_000) && num(m.ageMs, -60_000, 3_600_000)
      ? { t: 'loc', lng: m.lng, lat: m.lat, acc: m.acc, ageMs: m.ageMs, ts: num(m.ts, 0, Number.MAX_SAFE_INTEGER) ? m.ts : undefined } : null;
    case 'capture': return typeof m.code === 'string' && /^\d{4}$/.test(m.code) ? { t: 'capture', code: m.code } : null;
    case 'dropPlayer': return str(m.playerId, 64) ? { t: 'dropPlayer', playerId: m.playerId } : null;
    case 'kick': return str(m.playerId, 64) ? { t: 'kick', playerId: m.playerId } : null;
    case 'ping': return num(m.c0, 0, Number.MAX_SAFE_INTEGER) ? { t: 'ping', c0: m.c0 } : null;
    case 'start': case 'leave': case 'rematch': case 'endRound': case 'pause': case 'resume': return { t: m.t };
    case 'setShrink': return typeof m.on === 'boolean' ? { t: 'setShrink', on: m.on } : null;
    case 'setContact': return typeof m.contact === 'string' && m.contact.length <= 120 ? { t: 'setContact', contact: m.contact.trim() } : null;
    default: return null;
  }
}
