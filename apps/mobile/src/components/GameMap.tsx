import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { circleRing, fromLocal, startPoint, zoneOrigin, zoneRing, type Circle, type Disclosure, type LngLat, type Zone } from '@echo/shared';
import type { Fix } from '../location';
import { C, MAP_STYLE } from '../theme';

// No internet (LAN-only Wi-Fi / captive portal): plain background, but every game layer still draws.
const OFFLINE_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#0E1C2A' } }] };

const WORLD: LngLat[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
type F = GeoJSON.Feature;
const poly = (rings: LngLat[][], props: object = {}): F => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
const point = (p: LngLat, props: object = {}): F => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: p } });
const fc = (features: F[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const centroid = (ring: LngLat[]): LngLat => {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
};
const circle = (c: LngLat, r: number): LngLat[] =>
  Array.from({ length: 33 }, (_, i) => fromLocal([Math.cos((i / 32) * 2 * Math.PI) * r, Math.sin((i / 32) * 2 * Math.PI) * r], c));
const bbox = (pts: LngLat[]): [number, number, number, number] => [
  Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])),
];

export type CameraMode = 'follow' | 'zone' | 'free';
type Pad = { top: number; bottom: number; left: number; right: number };

export const GameMap = memo(function GameMap({
  zone, disclosures, now = 0, draft, fix, center, zoom = 16, pitch = 50, mode = 'free', fitKey = 0, fitExtra, padding,
  ownReveal, showStart = true, interactive = true, onPress, onCenter, onUserPan, children, zoneNow, zoneNext,
}: {
  zoneNow?: Circle; zoneNext?: Circle;
  zone?: Zone | null; disclosures?: Disclosure[]; now?: number; draft?: LngLat[]; fix?: Fix; center?: LngLat; zoom?: number; pitch?: number;
  /** follow = keep own GPS centred; zone = fit play zone; free = user controls camera */
  mode?: CameraMode; fitKey?: number; fitExtra?: LngLat[]; padding?: Pad;
  ownReveal?: { cell: LngLat[]; expiresAt: number }; showStart?: boolean;
  interactive?: boolean; onPress?: (p: LngLat) => void; onCenter?: (p: LngLat) => void; onUserPan?: () => void; children?: ReactNode;
}) {
  const cam = useRef<CameraRef>(null);
  const [offline, setOffline] = useState(false);
  const zoneKey = zone ? JSON.stringify(zone) : '';
  const ring = useMemo(() => (zone ? zoneRing(zone) : undefined), [zoneKey]);
  const pad = padding ?? { top: 60, bottom: 60, left: 40, right: 40 };
  const start = center ?? fix?.p ?? (zone ? zoneOrigin(zone) : undefined);
  // initialViewState is mount-only: start already framed (zone bounds when fitting the zone).
  const initial = useRef(
    mode === 'zone' && ring ? { bounds: bbox(ring), padding: pad, pitch }
    : start ? { center: start, zoom, pitch } : { zoom: 2 },
  ).current;
  const progAt = useRef(0); // programmatic camera moves must not count as user pans
  const move = (f: (c: CameraRef) => void) => { progAt.current = Date.now(); try { if (cam.current) f(cam.current); } catch {} };

  // (a) Zone mode: fit the play zone whenever entered or the zone changes.
  const zoneMode = mode === 'zone';
  useEffect(() => {
    if (!zoneMode || !ring) return;
    const id = setTimeout(() => move(c => c.fitBounds(bbox(ring), { padding: pad, pitch, duration: 700 })), 60);
    return () => clearTimeout(id);
  }, [zoneMode, zoneKey]);

  // (b) One-shot overview of extra points (e.g. fresh pulse cells) plus me — only when fitKey bumps.
  useEffect(() => {
    if (!fitKey || !fitExtra?.length) return;
    const pts = [...fitExtra, ...(fix ? [fix.p] : [])];
    const id = setTimeout(() => move(c => c.fitBounds(bbox(pts), { padding: pad, pitch, duration: 700 })), 60);
    return () => clearTimeout(id);
  }, [fitKey]);

  // initialViewState only applies at mount: jump once when the first position arrives later.
  const hadStart = useRef(!!start);
  const hasStart = !!start;
  useEffect(() => {
    if (hadStart.current || !start || zoneMode) return;
    hadStart.current = true;
    move(c => c.jumpTo({ center: start, zoom, pitch }));
  }, [hasStart]);

  // Follow mode: ease to each new fix (one GPS source for the whole app; no native tracking).
  const follow = mode === 'follow';
  useEffect(() => { if (follow && fix) move(c => c.easeTo({ center: fix.p, duration: 600 })); }, [follow, fix?.ts]);
  useEffect(() => { if (follow && fix) move(c => c.easeTo({ center: fix.p, zoom, pitch, duration: 500 })); }, [follow]);

  const mask = useMemo(() => fc(ring ? [poly([WORLD, ring])] : []), [ring]);
  // shrinking zone: darken everything outside the active circle too; dashed amber ring for the next one
  const nowKey = zoneNow ? `${zoneNow.center}|${zoneNow.radiusM}` : '';
  const nextKey = zoneNext ? `${zoneNext.center}|${zoneNext.radiusM}` : '';
  const shrinkMask = useMemo(() => fc(zoneNow ? [poly([WORLD, circleRing(zoneNow)])] : []), [nowKey]);
  const shrinkLine = useMemo(() => fc(zoneNow ? [poly([circleRing(zoneNow)])] : []), [nowKey]);
  const nextLine = useMemo(() => fc(zoneNext ? [poly([circleRing(zoneNext)])] : []), [nextKey]);
  const border = useMemo(() => fc(ring ? [poly([ring])] : []), [ring]);
  const startPt = useMemo(() => fc(zone && showStart ? [point(startPoint(zone), { label: 'START' })] : []), [zoneKey, showStart]);

  const sec = Math.floor(now / 1000);
  const live = useMemo(() => (disclosures ?? []).filter(d => d.cell && d.expiresAt > now), [disclosures, sec]);
  const signals = useMemo(() => fc(live.map(d =>
    poly([d.cell!], { bright: d.brightUntil > now ? 1 : 0, fade: Math.max(0.15, 1 - (now - d.revealedAt) / (d.expiresAt - d.revealedAt)) }))), [live, sec]);
  const labels = useMemo(() => fc(live.map(d => point(centroid(d.cell!), {
    label: `${d.alias}${d.exposed ? ' · OUTSIDE' : ''}\n${Math.round((now - (d.sampledAt ?? d.revealedAt)) / 1000)}s ago`,
  }))), [live, sec]);
  const mine = useMemo(() => fc(ownReveal && ownReveal.expiresAt > now ? [poly([ownReveal.cell])] : []), [ownReveal, sec]);
  const draftFc = useMemo(() => fc(draft?.length ? [
    ...(draft.length >= 3 ? [poly([[...draft, draft[0]]])] : []),
    ...draft.map((p, i) => point(p, { n: String(i + 1) })),
  ] : []), [draft]);
  const me = useMemo(() => fc(fix ? [poly([circle(fix.p, Math.min(fix.acc, 200))], { kind: 'acc' }), point(fix.p, { kind: 'dot' })] : []), [fix?.ts]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      key={offline ? 'offline' : 'online'}
      mapStyle={offline ? OFFLINE_STYLE : MAP_STYLE}
      onDidFailLoadingMap={() => setOffline(true)}
      logo={false}
      compass={false}
      attributionPosition={{ top: pad.top, right: 8 }}
      dragPan={interactive} touchZoom={interactive} touchRotate={interactive} touchPitch={interactive} doubleTapZoom={interactive}
      onPress={onPress ? e => onPress(e.nativeEvent.lngLat) : undefined}
      onRegionDidChange={onCenter || onUserPan ? e => {
        onCenter?.(e.nativeEvent.center);
        if (e.nativeEvent.userInteraction && Date.now() - progAt.current > 900) onUserPan?.();
      } : undefined}
    >
      <Camera ref={cam} initialViewState={initial} />

      {/* 3D-ish campus: extrude OSM buildings from the style's own vector tiles */}
      {!offline && <Layer id="echo-buildings" type="fill-extrusion" source="openmaptiles" source-layer="building" minzoom={14}
        paint={{
          'fill-extrusion-color': '#1B3550',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        }} />}

      <GeoJSONSource id="zone-mask" data={mask}>
        <Layer id="zone-mask-fill" type="fill" paint={{ 'fill-color': C.unknown, 'fill-opacity': 0.72 }} />
      </GeoJSONSource>
      <GeoJSONSource id="shrink-mask" data={shrinkMask}>
        <Layer id="shrink-mask-fill" type="fill" paint={{ 'fill-color': C.warn, 'fill-opacity': 0.32 }} />
      </GeoJSONSource>
      <GeoJSONSource id="shrink-line" data={shrinkLine}>
        <Layer id="shrink-line-glow" type="line" paint={{ 'line-color': C.text, 'line-width': 9, 'line-opacity': 0.15, 'line-blur': 4 }} />
        <Layer id="shrink-line-line" type="line" paint={{ 'line-color': C.text, 'line-width': 2.5 }} />
      </GeoJSONSource>
      <GeoJSONSource id="next-line" data={nextLine}>
        <Layer id="next-line-line" type="line" paint={{ 'line-color': C.amber, 'line-width': 3, 'line-dasharray': [1.5, 1.2] }} />
      </GeoJSONSource>
      <GeoJSONSource id="zone-border" data={border}>
        <Layer id="zone-border-glow" type="line" paint={{ 'line-color': C.cyan, 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 5 }} />
        <Layer id="zone-border-line" type="line" paint={{ 'line-color': C.cyan, 'line-width': 2.5, 'line-dasharray': [2, 1.5] }} />
      </GeoJSONSource>
      <GeoJSONSource id="start" data={startPt}>
        <Layer id="start-dot" type="circle" paint={{ 'circle-radius': 6, 'circle-color': C.amber, 'circle-stroke-color': C.bg, 'circle-stroke-width': 2 }} />
        <Layer id="start-label" type="symbol"
          layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-letter-spacing': 0.2, 'text-allow-overlap': true }}
          paint={{ 'text-color': C.amber, 'text-halo-color': C.bg, 'text-halo-width': 2 }} />
      </GeoJSONSource>

      <GeoJSONSource id="mine" data={mine}>
        <Layer id="mine-fill" type="fill" paint={{ 'fill-color': C.warn, 'fill-opacity': 0.18 }} />
        <Layer id="mine-line" type="line" paint={{ 'line-color': C.warn, 'line-width': 2, 'line-dasharray': [1, 1] }} />
      </GeoJSONSource>

      <GeoJSONSource id="signals" data={signals}>
        <Layer id="signals-fill" type="fill" paint={{
          'fill-color': ['case', ['==', ['get', 'bright'], 1], C.amber, C.cyan],
          'fill-opacity': ['case', ['==', ['get', 'bright'], 1], 0.55, ['*', 0.35, ['get', 'fade']]],
        }} />
        <Layer id="signals-line" type="line" paint={{ 'line-color': ['case', ['==', ['get', 'bright'], 1], C.amber, C.cyan], 'line-width': 2 }} />
      </GeoJSONSource>
      <GeoJSONSource id="signal-labels" data={labels}>
        <Layer id="signal-labels-text" type="symbol"
          layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, -2], 'text-allow-overlap': true }}
          paint={{ 'text-color': C.text, 'text-halo-color': C.bg, 'text-halo-width': 2 }} />
      </GeoJSONSource>

      <GeoJSONSource id="draft" data={draftFc}>
        <Layer id="draft-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'fill-color': C.cyan, 'fill-opacity': 0.15 }} />
        <Layer id="draft-line" type="line" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'line-color': C.cyan, 'line-width': 2 }} />
        <Layer id="draft-pts" type="circle" filter={['==', ['geometry-type'], 'Point']} paint={{ 'circle-radius': 9, 'circle-color': C.bg, 'circle-stroke-color': C.cyan, 'circle-stroke-width': 3 }} />
        <Layer id="draft-num" type="symbol" filter={['==', ['geometry-type'], 'Point']}
          layout={{ 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true }} paint={{ 'text-color': C.cyan }} />
      </GeoJSONSource>

      {/* own position puck (from the app's single GPS subscription) */}
      <GeoJSONSource id="me" data={me}>
        <Layer id="me-acc" type="fill" filter={['==', ['get', 'kind'], 'acc']} paint={{ 'fill-color': C.cyan, 'fill-opacity': 0.12 }} />
        <Layer id="me-halo" type="circle" filter={['==', ['get', 'kind'], 'dot']} paint={{ 'circle-radius': 13, 'circle-color': C.cyan, 'circle-opacity': 0.25 }} />
        <Layer id="me-dot" type="circle" filter={['==', ['get', 'kind'], 'dot']} paint={{ 'circle-radius': 7, 'circle-color': C.cyan, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 }} />
      </GeoJSONSource>
      {children}
    </Map>
  );
});
