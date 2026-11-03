import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { inZone, type LngLat, type WorldPack, type Zone } from '@echo/shared';
import { send } from '../net';
import { useLocation } from '../location';
import { GameMap } from '../components/GameMap';
import { Button, Pill, styles as u } from '../components/ui';
import { C, S } from '../theme';

const RADII = [100, 200, 300, 500, 800];

export function ZoneEditor({ zone, onDone, world }: { zone: Zone | null; onDone: () => void; world?: WorldPack }) {
  const insets = useSafeAreaInsets();
  const { fix } = useLocation();
  const [mode, setMode] = useState<'circle' | 'polygon'>(zone?.kind ?? 'circle');
  const [radius, setRadius] = useState(zone?.kind === 'circle' ? zone.radiusM : 200);
  const [picked, setCenter] = useState<LngLat | undefined>(zone?.kind === 'circle' ? zone.center : undefined);
  const center = picked ?? fix?.p ?? world?.center; // GPS may arrive after the editor opens
  const [pts, setPts] = useState<LngLat[]>(zone?.kind === 'polygon' ? zone.ring : []);
  const [recenter, setRecenter] = useState(0);

  const preview: Zone | null = mode === 'circle' ? (center ? { kind: 'circle', center, radiusM: radius } : null) : (pts.length >= 3 ? { kind: 'polygon', ring: pts } : null);
  const canSave = mode === 'circle' ? !!center : pts.length >= 3;
  const youInside = fix && preview ? inZone(fix.p, preview) : undefined;

  const save = () => {
    const z: Zone = mode === 'circle' ? { kind: 'circle', center: center!, radiusM: radius } : { kind: 'polygon', ring: pts };
    if (send({ t: 'setZone', zone: z })) onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GameMap zone={preview} draft={mode === 'polygon' ? pts : undefined} fix={fix} center={center ?? fix?.p} zoom={16} pitch={0} world={world}
        mode={recenter ? 'follow' : 'free'} fitKey={recenter} showStart={false}
        padding={{ top: insets.top + 60, bottom: 260, left: 30, right: 30 }}
        onCenter={mode === 'circle' ? setCenter : undefined}
        onUserPan={() => setRecenter(0)}
        onPress={mode === 'polygon' ? p => setPts(x => (x.length < 64 ? [...x, p] : x)) : undefined} />

      {mode === 'circle' && (
        <View style={st.crosshair} pointerEvents="none">
          <View style={st.cross}><View style={st.crossDot} /></View>
        </View>
      )}

      <View style={[st.top, { paddingTop: insets.top + S.sm }]}>
        <Pressable hitSlop={10} onPress={onDone}><Pill icon="close" label="CANCEL" color={C.text} /></Pressable>
        <View style={st.seg}>
          {(['circle', 'polygon'] as const).map(m => (
            <Pressable key={m} onPress={() => setMode(m)} style={[st.segBtn, mode === m && { backgroundColor: C.cyan }]}>
              <Text style={[st.segText, mode === m && { color: C.bg }]}>{m === 'circle' ? 'Circle' : 'Draw'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[st.panel, { paddingBottom: insets.bottom + S.md }]}>
        <View style={st.rowBetween}>
          <Text style={u.h2}>{mode === 'circle' ? 'Circle zone' : `Custom zone · ${pts.length} corners`}</Text>
          {fix && <Pressable hitSlop={8} onPress={() => setRecenter(r => r + 1)}><Pill icon="crosshairs-gps" label="ME" color={C.cyan} /></Pressable>}
        </View>
        {mode === 'circle' ? (
          <>
            <Text style={u.muted}>Drag the map to move the centre. The centre is where hunters wait (START).</Text>
            <View style={st.chips}>
              {RADII.map(r => (
                <Pressable key={r} onPress={() => setRadius(r)} style={[st.chip, radius === r && { borderColor: C.cyan, backgroundColor: C.cyan + '22' }]}>
                  <Text style={[st.chipText, radius === r && { color: C.cyan }]}>{r} m</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={u.muted}>Tap corners around the area. Keep roads, buildings and private spaces outside. START is where the shape’s middle is (or your first corner).</Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <Button icon="undo" title="Undo" variant="ghost" style={{ flex: 1 }} disabled={!pts.length} onPress={() => setPts(x => x.slice(0, -1))} />
              <Button icon="delete-outline" title="Clear" variant="ghost" color={C.warn} style={{ flex: 1 }} disabled={!pts.length} onPress={() => setPts([])} />
            </View>
          </>
        )}
        {youInside === false && <Text style={[u.muted, { color: C.amber }]}>You’re outside this zone — players must be inside to ready up.</Text>}
        <Button big title={canSave ? 'SAVE ZONE' : mode === 'polygon' ? `ADD ${3 - pts.length} MORE CORNER${3 - pts.length > 1 ? 'S' : ''}` : 'WAITING FOR GPS…'} disabled={!canSave} onPress={save} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  crosshair: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  crossDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.amber },
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg },
  seg: { flexDirection: 'row', backgroundColor: C.panelSolid, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: C.border },
  segBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  segText: { color: C.text, fontWeight: '800', fontSize: 14 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: S.md, padding: S.lg, backgroundColor: C.panelSolid, borderTopWidth: 1, borderColor: C.border },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { color: C.muted, fontWeight: '800', fontSize: 14 },
});
