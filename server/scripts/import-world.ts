// Build a world pack from OpenStreetMap:  npm run world:import -- bits-goa
// Reads worlds/<id>/source.json + overrides.json, writes worlds/<id>/world.json (versioned, hashed).
// Data © OpenStreetMap contributors (ODbL) — the attribution travels inside the pack.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pointInRing, type BuildingKind, type LngLat, type WorldPack } from '@echo/shared';

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
type Source = { name: string; campusWay: number; bbox: [number, number, number, number] };
type Overrides = { heights?: Record<string, number>; names?: Record<string, string>; exclude?: string[] };
const queryFor = (src: Source) => {
  const [w, s, e, n] = src.bbox, bb = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:90];(way(${src.campusWay});way["building"]${bb};way["highway"]${bb};way["leisure"]${bb};way["amenity"="parking"]${bb};rel["building"]${bb};);out body geom;`; // body: relations keep their member geometry
};

type Geom = { lat: number; lon: number }[];
type El = { type: string; id: number; tags?: Record<string, string>; geometry?: Geom; members?: { type: string; role: string; geometry?: Geom }[] };

/** Join a multipolygon's outer ways into closed rings (OSM splits big outlines across several ways). */
export function assembleRings(parts: LngLat[][]): LngLat[][] {
  const eq = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
  const open = parts.filter(p => p.length > 1).map(p => [...p]);
  const rings: LngLat[][] = [];
  while (open.length) {
    let cur = open.shift()!;
    for (let grew = true; grew && !eq(cur[0], cur.at(-1)!);) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        if (eq(cur.at(-1)!, p[0])) cur = [...cur, ...p.slice(1)];
        else if (eq(cur.at(-1)!, p.at(-1)!)) cur = [...cur, ...p.reverse().slice(1)];
        else if (eq(cur[0], p.at(-1)!)) cur = [...p, ...cur.slice(1)];
        else if (eq(cur[0], p[0])) cur = [...p.reverse(), ...cur.slice(1)];
        else continue;
        open.splice(i, 1); grew = true; break;
      }
    }
    if (cur.length >= 4 && eq(cur[0], cur.at(-1)!)) rings.push(cur); // drop anything that can't close
  }
  return rings;
}
async function fetchOsm(query: string): Promise<El[]> {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'ECHO-world-import/0.1' }, body: new URLSearchParams({ data: query }) });
      if (!res.ok) { console.warn(`${url} → HTTP ${res.status}`); continue; }
      const j = await res.json() as { elements?: El[]; remark?: string };
      // Overpass can answer 200 with a "remark" (e.g. timeout) and partial data: never write a half-empty world
      if (!Array.isArray(j.elements) || j.remark) { console.warn(`${url} → incomplete answer: ${j.remark ?? 'no elements'}`); continue; }
      return j.elements;
    } catch (err) { console.warn(`${url} → ${(err as Error).message}`); }
  }
  throw new Error('All Overpass mirrors failed — try again later');
}

const ring = (g: El['geometry']): LngLat[] => (g ?? []).map(p => [+p.lon.toFixed(7), +p.lat.toFixed(7)] as LngLat);
const centroid = (r: LngLat[]): LngLat => {
  const pts = r.length > 1 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r.slice(0, -1) : r;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
};

/** Kind + estimated height (metres) when OSM has none. Patterns tuned for Indian campus naming. */
export function classify(tags: Record<string, string>): { kind: BuildingKind; heightM: number } {
  const name = tags.name ?? '', b = tags.building ?? '';
  const t = (k: BuildingKind, h: number) => ({ kind: k, heightM: h });
  if (b === 'dormitory' || /^(?:[A-Z]{1,2}H)\s*-?\s*\d+\b/.test(name) || /hostel|bhawan/i.test(name)) return t('hostel', 14);
  if (b === 'food' || /mess|canteen|caf[eé]|domino|food|dhaba|night\s*canteen/i.test(name)) return t('dining', 6);
  if (/library/i.test(name)) return t('academic', 13);
  if (/^D?LT-?\d+/i.test(name) || /lecture|auditorium/i.test(name)) return t('academic', 9);
  if (['university', 'school', 'college', 'laboratory'].includes(b) || /lab|NAB|academic|block|AUGSD|observatory|CC\b/i.test(name)) return t('academic', 11);
  if (/SAC|sport|gym|dome|pool|court|stadium/i.test(name)) return t('sports', 10);
  if (/admission|admin|office|guest\s*house|director/i.test(name)) return t('admin', 8);
  if (/mandir|temple|church|mosque/i.test(name)) return t('religious', 12);
  if (b === 'greenhouse' || b === 'shed' || b === 'roof' || b === 'garage') return t('other', 4);
  return t('other', 7);
}

function wayKind(h: string) {
  if (['footway', 'path', 'pedestrian', 'cycleway', 'living_street'].includes(h)) return 'walkway' as const;
  if (h === 'steps') return 'steps' as const;
  if (['service', 'track'].includes(h)) return 'service' as const;
  if (['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'road'].includes(h)) return 'road' as const;
  return undefined; // proposed / construction / etc.
}

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('usage: npm run world:import -- <world-id>');
  const dir = fileURLToPath(new URL(`../../worlds/${id}/`, import.meta.url));
  const src = JSON.parse(readFileSync(dir + 'source.json', 'utf8')) as Source;
  const ov: Overrides = existsSync(dir + 'overrides.json') ? JSON.parse(readFileSync(dir + 'overrides.json', 'utf8')) : {};
  const query = queryFor(src);
  const els = await fetchOsm(query);
  const campus = els.find(x => x.type === 'way' && x.id === src.campusWay);
  if (!campus?.geometry) throw new Error(`Campus outline way ${src.campusWay} not found`);
  const outline = ring(campus.geometry);
  // keep anything touching the campus: a vertex inside, or a segment crossing the fence
  const cross = (a: LngLat, b: LngLat, c: LngLat, d: LngLat) => {
    const o = (p: LngLat, q: LngLat, r: LngLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const inside = (r: LngLat[]) => r.some(p => pointInRing(p, outline))
    || r.some((p, i) => i > 0 && outline.some((q, j) => j > 0 && cross(r[i - 1], p, outline[j - 1], q)));
  const closed = (r: LngLat[]) => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r);
  // multipolygon buildings (e.g. the AH/CH hostels): flatten into one building per outer ring
  let skippedRel = 0;
  for (const rel of els.filter(x => x.type === 'relation' && x.tags?.building)) {
    const rings = assembleRings((rel.members ?? []).filter(m => m.type === 'way' && m.role === 'outer' && m.geometry).map(m => ring(m.geometry)));
    if (!rings.length) { skippedRel++; continue; }
    rings.forEach((r, i) => els.push({ type: 'way', id: rel.id, tags: rel.tags, geometry: r.map(([lon, lat]) => ({ lat, lon })), relPart: rings.length > 1 ? i : undefined, fromRel: true } as El & { relPart?: number; fromRel: boolean }));
  }
  const skip = new Set(ov.exclude ?? []);
  const pack: Omit<WorldPack, 'hash' | 'version'> = {
    schema: 'echo.world/1', id, name: src.name, center: centroid(outline),
    bbox: [Math.min(...outline.map(p => p[0])), Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[0])), Math.max(...outline.map(p => p[1]))],
    attribution: '© OpenStreetMap contributors (ODbL)', source: { kind: 'osm', fetchedAt: new Date().toISOString(), query },
    buildings: [], ways: [], areas: [], landmarks: [],
  };
  for (const el of els) {
    const fromRel = !!(el as { fromRel?: boolean }).fromRel;
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2 || (!fromRel && el.id === src.campusWay)) continue;
    const part = (el as El & { relPart?: number }).relPart;
    const sid = fromRel ? `osm:relation/${el.id}${part !== undefined ? `#${part}` : ''}` : `osm:way/${el.id}`, tags = el.tags ?? {}, r = ring(el.geometry);
    if (skip.has(sid) || !inside(r)) continue;
    const name = ov.names?.[sid] ?? tags.name;
    if (tags.building) {
      const c = classify({ ...tags, name: name ?? '' });
      const osmH = parseFloat(tags.height) || (parseFloat(tags['building:levels']) ? parseFloat(tags['building:levels']) * 3.4 : NaN);
      const heightM = ov.heights?.[sid] ?? (Number.isFinite(osmH) ? osmH : c.heightM);
      if (r.length < 3) continue;
      pack.buildings.push({ id: sid, name, kind: c.kind, heightM: +heightM.toFixed(1), heightEstimated: ov.heights?.[sid] === undefined && !Number.isFinite(osmH), ring: closed(r) });
      if (name) pack.landmarks.push({ id: sid, name, p: centroid(r), kind: 'building' });
    } else if (tags.highway) {
      const k = wayKind(tags.highway);
      if (k) pack.ways.push({ id: sid, name, kind: k, line: r });
    } else if (tags.leisure || tags.amenity === 'parking') {
      const kind = tags.amenity === 'parking' ? 'parking' as const : ['garden', 'park'].includes(tags.leisure) ? 'lawn' as const : ['pitch', 'sports_centre', 'track'].includes(tags.leisure) ? 'pitch' as const : 'other' as const;
      if (r.length < 3) continue;
      pack.areas.push({ id: sid, name, kind, ring: closed(r) });
      if (name) pack.landmarks.push({ id: sid, name, p: centroid(r), kind: 'area' });
    }
  }
  // one label per place: same name (any case) within 80 m is the same landmark (e.g. B-Dome mapped twice)
  const seen: { name: string; p: LngLat }[] = [];
  pack.landmarks = pack.landmarks.filter(l => {
    const key = l.name.trim().toLowerCase();
    if (seen.some(x => x.name === key && Math.hypot((x.p[0] - l.p[0]) * 107_000, (x.p[1] - l.p[1]) * 110_500) < 80)) return false;
    seen.push({ name: key, p: l.p });
    return true;
  });
  const order = <T extends { id: string }>(a: T[]) => a.sort((x, y) => x.id.localeCompare(y.id));
  order(pack.buildings); order(pack.ways); order(pack.areas); order(pack.landmarks);
  const { source: _s, ...content } = pack; // the hash covers geometry/names, not the fetch time
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  const prev = existsSync(dir + 'world.json') ? JSON.parse(readFileSync(dir + 'world.json', 'utf8')) as WorldPack : undefined;
  const version = prev ? (prev.hash === hash ? prev.version : prev.version + 1) : 1;
  writeFileSync(dir + 'world.json', JSON.stringify({ ...pack, version, hash }) + '\n');
  const est = pack.buildings.filter(b => b.heightEstimated).length;
  console.log(`${id} v${version} (${hash}): ${pack.buildings.length} buildings (${est} with estimated height), ${pack.ways.length} ways, ${pack.areas.length} areas, ${pack.landmarks.length} landmarks`);
  if (prev && prev.hash === hash) console.log('unchanged since last import');
  if (skippedRel) console.log(`note: ${skippedRel} multipolygon building relation(s) had no closable outline — skipped`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(err => { console.error(err.message); process.exit(1); });
