import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESETS, RULES, inZone, type PresetId, type View as GameView } from '@echo/shared';
import { leaveMatch, send, toast, useNet } from '../net';
import { testBuzz, useAlertPermission } from '../notify';
import { fixAge, fixGood, requestLocation, useLocation } from '../location';
import { GameMap } from '../components/GameMap';
import { Button, Card, Pill, RoleGlyph, styles as u } from '../components/ui';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { ServerMoved } from '../components/ServerMoved';
import { C, S, fmt, roleColor } from '../theme';

const BRIEF = {
  runner: [
    ['Run', 'Get away during the head start. Hunters wait at START.'],
    ['Pulses', `Every pulse, hunters see your ~${RULES.cellM} m area — move before it hits.`],
    ['Caught?', 'If a hunter calls your alias within ~3 m, show them your catch code.'],
    ['Zone', 'If the zone shrinks, get inside the new ring in time — outside it, hunters see you every 20 s.'],
  ],
  hunter: [
    ['Wait', 'Stay at START until the head start ends.'],
    ['Track', 'Pulses show each runner’s rough area and how old it is. It doesn’t follow them.'],
    ['Catch', 'Get within ~3 m, call their alias, type the code they show you. No touching.'],
  ],
} as const;

export function Lobby({ view, onEditZone }: { view: GameView; onEditZone: () => void }) {
  const insets = useSafeAreaInsets();
  const net = useNet();
  const loc = useLocation();
  const [preview, setPreview] = useState(false);
  const [alerts, askAlerts] = useAlertPermission();
  const [contactDraft, setContactDraft] = useState<string | null>(null); // only what the host is typing; otherwise show the server value
  // keep the host's NO ALERTS badge honest if permission changes after tapping Ready
  const meReady = !!view.players.find(p => p.id === view.you.id)?.ready;
  useEffect(() => { if (meReady && alerts.known) send({ t: 'ready', ready: true, alerts: alerts.granted }, true); }, [alerts.granted, alerts.known]);
  // roles flip on rematch / host changes: say so
  const prevRole = useRef(view.you.role);
  useEffect(() => {
    if (prevRole.current !== view.you.role) toast(`You’re a ${view.you.role.toUpperCase()} now`);
    prevRole.current = view.you.role;
  }, [view.you.role]);
  const me = view.players.find(p => p.id === view.you.id);
  if (!me) return null;
  const host = view.you.isHost;
  const hunters = view.players.filter(p => p.role === 'hunter').length;
  const runners = view.players.length - hunters;
  const fixOk = fixGood(loc.fix);
  const inside = !!loc.fix && !!view.zone && inZone(loc.fix.p, view.zone);

  // Why can't I ready / start? Always say it (BP §11.6).
  const readyBlock =
    loc.permission !== 'granted' ? 'Allow location to play'
    : loc.coarse ? 'Turn on Precise location for ECHO'
    : !view.zone ? (host ? 'Set a play zone first' : 'Waiting for host to set the zone')
    : !loc.fix ? 'Waiting for GPS…'
    : !fixOk ? (loc.fix.acc > RULES.maxAccuracyM ? `GPS too weak (±${Math.round(loc.fix.acc)} m) — step outside` : 'GPS signal stale…')
    : !inside ? 'Walk inside the zone'
    : null;
  const notReady = view.players.filter(p => !p.ready);
  const startBlock =
    hunters === 0 ? 'Need at least 1 hunter'
    : runners === 0 ? 'Need at least 1 runner'
    : notReady.length ? `Waiting on: ${notReady.map(p => p.alias + (!p.connected ? ' (offline)' : !p.hasFix ? ' (no GPS)' : '')).join(', ')}`
    : null;

  const checks: [string, boolean][] = [
    ['Location allowed', loc.permission === 'granted'],
    [loc.fix ? `GPS ±${Math.round(loc.fix.acc)} m · ${Math.round(fixAge(loc.fix) / 1000)}s old` : 'GPS fix', fixOk],
    ['Play zone set', !!view.zone],
    ['You are inside the zone', inside],
    ['Connected', net.status === 'open'],
    [alerts.granted ? 'Alerts on (buzz before reveals)' : 'Alerts off — you won’t be warned with the phone locked', alerts.granted],
  ];

  const playerMenu = (p: GameView['players'][number]) => {
    if (!host || p.id === view.you.id) return;
    Alert.alert(p.alias, undefined, [
      { text: `Make ${p.role === 'hunter' ? 'runner' : 'hunter'}`, onPress: () => send({ t: 'setRole', playerId: p.id, role: p.role === 'hunter' ? 'runner' : 'hunter' }) },
      { text: 'Remove from match', style: 'destructive', onPress: () => send({ t: 'kick', playerId: p.id }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Pressable style={st.mapBox} onPress={() => view.zone && setPreview(true)} accessibilityLabel="Open zone preview">
        <GameMap zone={view.zone} fix={loc.fix} mode={view.zone ? 'zone' : 'free'} zoom={15} pitch={35} interactive={false}
          padding={{ top: insets.top + 50, bottom: 20, left: 20, right: 20 }} />
        <View style={[st.mapOverlay, { paddingTop: insets.top + S.sm }]}>
          <Pressable hitSlop={8} onPress={() => Alert.alert('Leave lobby?', undefined, [{ text: 'Stay' }, { text: 'Leave', style: 'destructive', onPress: leaveMatch }])}>
            <Pill icon="close" label="LEAVE" color={C.text} />
          </Pressable>
          {host
            ? <Pressable hitSlop={8} onPress={onEditZone}><Pill icon={view.zone ? 'pencil-outline' : 'plus'} label={view.zone ? 'EDIT ZONE' : 'SET ZONE'} color={C.cyan} /></Pressable>
            : view.zone && <Pill icon="arrow-expand" label="VIEW ZONE" color={C.cyan} />}
        </View>
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: 190 }}>
        {loc.permission !== 'granted' && (
          <Card style={{ gap: S.sm, borderColor: C.warn }}>
            <Text style={u.h2}>Location needed</Text>
            <Text style={u.muted}>ECHO shares your rough area with your match only while a round runs, and stops when you’re caught or leave.</Text>
            <Button title={loc.canAskAgain ? 'Allow location' : 'Open settings'} color={C.warn} onPress={requestLocation} />
          </Card>
        )}
        {loc.permission === 'granted' && loc.coarse && (
          <Card style={{ gap: S.sm, borderColor: C.warn }}>
            <Text style={u.h2}>Precise location is off</Text>
            <Text style={u.muted}>“Approximate” location is off by 1–3 km, so ECHO can’t place you in the zone. Turn on Precise location for ECHO in Settings.</Text>
            <Button icon="cog-outline" title="Open settings" color={C.warn} onPress={requestLocation} />
          </Card>
        )}
        {alerts.known && !alerts.granted && (
          <Card style={{ gap: S.sm, borderColor: C.amber }}>
            <Text style={u.h2}>Turn on alerts</Text>
            <Text style={u.muted}>ECHO buzzes you 10 s before you’re revealed and when the round pauses — even with your phone locked.</Text>
            <Button icon="bell-ring-outline" title={alerts.canAskAgain ? 'Allow alerts' : 'Open settings'} color={C.amber} onPress={askAlerts} />
          </Card>
        )}
        {net.status === 'closed' && (
          <Card style={{ gap: S.sm, borderColor: C.warn }}>
            <Text style={u.h2}>Can’t reach the game server</Text>
            <ServerMoved />
          </Card>
        )}
        {loc.servicesOff && <Card style={{ borderColor: C.warn }}><Text style={u.body}>Location services are off. Turn on GPS in quick settings.</Text></Card>}

        <Pressable onPress={() => Share.share({ message: `Join my ECHO hunt! Install the ECHO app I sent you, open it and enter code ${view.code}` }).catch(() => {})} accessibilityLabel={`Join code ${view.code.split('').join(' ')}, tap to share`}>
          <Card style={st.codeCard}>
            <View>
              <Text style={u.label}>Join code · tap to share</Text>
              <Text style={st.code}>{view.code}</Text>
            </View>
            <Pill label={`${view.players.length} IN`} color={C.cyan} />
          </Card>
        </Pressable>

        {(host || !!view.contact) && (
          <Card style={{ gap: S.sm }}>
            <Text style={u.label}>Organiser contact · meeting point</Text>
            {host ? (
              <TextInput value={contactDraft ?? view.contact ?? ''} onChangeText={setContactDraft} maxLength={120} placeholder="e.g. Call Maya 98xxxxxx · meet at the library steps"
                placeholderTextColor={C.muted} style={st.input}
                onEndEditing={() => { if (contactDraft !== null && contactDraft !== (view.contact ?? '')) send({ t: 'setContact', contact: contactDraft }); setContactDraft(null); }} />
            ) : <Text style={u.body}>{view.contact}</Text>}
            <Text style={u.muted}>Shown to everyone whenever the round pauses. ECHO isn’t an emergency service.</Text>
          </Card>
        )}

        <Card style={{ gap: S.sm, borderColor: roleColor(view.you.role) + '88' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <RoleGlyph role={view.you.role} />
            <Text style={[u.h2, { color: roleColor(view.you.role) }]}>You are a {view.you.role.toUpperCase()}</Text>
          </View>
          {BRIEF[view.you.role].map(([k, v]) => (
            <Text key={k} style={u.body}><Text style={{ fontWeight: '900', color: roleColor(view.you.role) }}>{k}  </Text>{v}</Text>
          ))}
        </Card>

        <View style={{ gap: S.sm }}>
          <Text style={u.label}>Mode {host ? '' : '· host picks'}</Text>
          <View style={st.chips}>
            {(Object.keys(PRESETS) as PresetId[]).map(id => {
              const on = view.preset.id === id;
              return (
                <Pressable key={id} disabled={!host} onPress={() => send({ t: 'setPreset', preset: id })}
                  style={[st.chip, on && { borderColor: C.cyan, backgroundColor: C.cyan + '22' }, !host && !on && { opacity: 0.45 }]}>
                  <Text style={[st.chipText, on && { color: C.cyan }]}>{PRESETS[id].label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={u.muted}>Head start {fmt(view.preset.headStartMs)} · pulse every {fmt(view.preset.pulseIntervalMs)} · chase {fmt(view.preset.chaseMs)}</Text>
          <Pressable disabled={!host} onPress={() => send({ t: 'setShrink', on: !view.shrink })} accessibilityRole="switch" accessibilityState={{ checked: view.shrink }}
            style={[st.shrinkRow, view.shrink && { borderColor: C.amber + 'AA' }]}>
            <Icon name={view.shrink ? 'target' : 'circle-outline'} size={24} color={view.shrink ? C.amber : C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={[u.body, { fontWeight: '800', color: view.shrink ? C.amber : C.text }]}>Shrinking zone {view.shrink ? 'ON' : 'OFF'}{host ? '' : ' · host decides'}</Text>
              <Text style={u.muted}>Shrinks up to 3 times inside your zone, announced ahead with a dashed ring. Runners left outside after the grace period get exposed to hunters every 20 s.</Text>
            </View>
          </Pressable>
        </View>

        <View style={{ gap: S.sm }}>
          <View style={st.rowBetween}>
            <Text style={u.label}>Roster {host && '· tap to swap · hold for more'}</Text>
          </View>
          {host && view.players.length > 2 && (
            <View style={st.chips}>
              <Text style={[u.muted, { alignSelf: 'center' }]}>Shuffle with</Text>
              {[1, 2, 3].filter(n => n < view.players.length).map(n => (
                <Pressable key={n} onPress={() => send({ t: 'shuffleRoles', hunters: n })} style={st.chip}>
                  <Text style={[st.chipText, { color: C.amber }]}>Shuffle · {n} hunter{n > 1 ? 's' : ''}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {view.players.map(p => (
            <Pressable key={p.id} disabled={!host}
              onPress={() => send({ t: 'setRole', playerId: p.id, role: p.role === 'hunter' ? 'runner' : 'hunter' })}
              onLongPress={() => playerMenu(p)}>
              <View style={[st.player, { borderLeftColor: roleColor(p.role) }, !p.connected && { opacity: 0.55 }]}>
                <RoleGlyph role={p.role} />
                <View style={{ flex: 1 }}>
                  <Text style={u.h2} numberOfLines={1}>{p.alias}{p.id === view.you.id ? ' (you)' : ''}{p.isHost ? '  ★' : ''}</Text>
                  <Text style={[st.roleText, { color: roleColor(p.role) }]}>{p.role.toUpperCase()}{!p.connected ? ' · OFFLINE' : ''}</Text>
                </View>
                <View style={st.badges}>
                  <Pill dot label="GPS" color={p.hasFix ? C.ok : C.muted} />
                  {host && p.ready && !p.alerts && <Pill icon="bell-off-outline" label="NO ALERTS" color={C.amber} />}
                  <Pill label={p.ready ? 'READY' : '…'} color={p.ready ? C.ok : C.muted} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <Card style={{ gap: 6 }}>
          <Text style={u.label}>Your readiness</Text>
          {checks.map(([label, ok], i) => (
            <Text key={i} style={[u.body, { color: ok ? C.text : C.muted }]}><Text style={{ color: ok ? C.ok : C.muted }}>{ok ? '✓' : '○'}</Text>  {label}</Text>
          ))}
          <Text style={[u.muted, { marginTop: 4 }]}>You can lock your phone during the round — ECHO keeps sharing in the background{alerts.granted ? ' and buzzes you before reveals' : ''}. Don’t swipe ECHO away from recent apps. Sharing stops when you’re caught, leave, or the round ends.</Text>
          {alerts.granted && <Button icon="vibrate" title="Test buzz (lock your phone now)" variant="ghost" onPress={() => { testBuzz(); toast('Lock your phone — it should buzz in ~6 s'); }} />}
        </Card>
      </ScrollView>

      <View style={[st.bottom, { paddingBottom: insets.bottom + S.md }]}>
        <Text style={[u.muted, { textAlign: 'center', color: (me.ready ? (host ? startBlock : null) : readyBlock) ? C.amber : C.ok }]} numberOfLines={2}>
          {!me.ready ? readyBlock ?? 'Tap Ready when you’re at the start'
            : host ? startBlock ?? 'Everyone ready — start when you are' : 'Waiting for the host to start…'}
        </Text>
        <View style={{ flexDirection: 'row', gap: S.md }}>
          <Button big style={{ flex: 1 }} icon={me.ready ? 'check-circle' : 'check'} title={me.ready ? 'READY' : "I'M READY"} variant={me.ready ? 'ghost' : 'solid'} color={C.ok}
            disabled={!me.ready && !!readyBlock} onPress={() => send({ t: 'ready', ready: !me.ready, alerts: alerts.granted })} />
          {host && <Button big style={{ flex: 1 }} icon="play" title="START" color={C.hunter} disabled={!!startBlock} onPress={() => send({ t: 'start' })} />}
        </View>
      </View>

      <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <GameMap zone={view.zone} fix={loc.fix} mode="zone" pitch={45} padding={{ top: 100, bottom: 100, left: 30, right: 30 }} />
          <View style={[st.mapOverlay, { paddingTop: insets.top + S.md }]}>
            <Pressable hitSlop={10} onPress={() => setPreview(false)}><Pill icon="close" label="CLOSE" color={C.text} /></Pressable>
            <Pill label={inside ? 'YOU ARE INSIDE' : 'YOU ARE OUTSIDE'} color={inside ? C.ok : C.warn} dot />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  mapBox: { height: 250, overflow: 'hidden', borderBottomWidth: 1, borderColor: C.border },
  mapOverlay: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.lg },
  codeCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: C.text, fontSize: 40, fontWeight: '900', letterSpacing: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { color: C.muted, fontWeight: '800', fontSize: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  player: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.panel, borderRadius: 14, padding: S.md, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  roleText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 150 },
  shrinkRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: S.md, backgroundColor: C.panel },
  input: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, fontSize: 16, paddingHorizontal: 12, minHeight: 48 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: S.sm, padding: S.lg, backgroundColor: C.panelSolid, borderTopWidth: 1, borderColor: C.border },
});
