import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INFECTION, PRESETS, RULES, inZone, type PresetId, type View as GameView } from '@echo/shared';
import { leaveMatch, send, toast, useNet } from '../net';
import { testBuzz, useAlertPermission } from '../notify';
import { fixAge, fixGood, requestLocation, useLocation } from '../location';
import { GameMap } from '../components/GameMap';
import { Button, Card, Pill, RoleGlyph, styles as u, type IconName } from '../components/ui';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { ServerMoved } from '../components/ServerMoved';
import { useWorldPack } from '../world';
import { C, S, fmt, roleColor } from '../theme';
import { canAdvertise, useBle } from '../slash';

const BRIEF = {
  runner: [
    ['Run', 'Get away during the head start. Hunters wait at START.'],
    ['Pulses', `Every pulse, hunters see your ~${RULES.cellM} m area — move before it hits.`],
    ['Caught?', 'If a hunter calls your alias within ~3 m, show them your catch code.'],
    ['Slash', 'Hunters catch by standing right next to you and tapping SLASH — keep Bluetooth on. Your catch code is the backup.'],
    ['Infected', 'Caught = you hunt for a while, then you’re cured and run again (safe for 30 s). Runners win if one of you is clean at the end.'],
    ['Zone', 'If the zone shrinks, get inside the new ring in time — outside it, hunters see you every 20 s.'],
    ['Freeze', 'Stops one hunter for 8 s once they acknowledge — but every hunter sees your area. Stations give you another.'],
  ],
  hunter: [
    ['Wait', 'Stay at START until the head start ends.'],
    ['Track', 'Pulses show each runner’s rough area and how old it is. It doesn’t follow them.'],
    ['Catch', 'Get within ~3 m, call their alias, type the code they show you. No touching.'],
    ['Slash', 'Get right next to a runner and tap SLASH — your phone catches the closest one. 5 s recharge. Codes still work as backup.'],
    ['Infection', 'Everyone you catch hunts with you for a while. Infect everyone at once and you win.'],
    ['Sweep', 'Scan 100 m around you: confirmed runners show up only for you. 60 s recharge. Stations give you another.'],
    ['Frozen?', 'When FREEZE INCOMING appears, stop safely and tap I’VE STOPPED. 8 s later you’re free and immune for 45 s.'],
  ],
} as const;

export function Lobby({ view, onEditZone }: { view: GameView; onEditZone: () => void }) {
  const insets = useSafeAreaInsets();
  const net = useNet();
  const loc = useLocation();
  const [preview, setPreview] = useState(false);
  const [settings, setSettings] = useState(false);
  const [brief, setBrief] = useState(false);
  const world = useWorldPack(view.world);
  const [alerts, askAlerts] = useAlertPermission();
  const [ble, askBle] = useBle();
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
  const slash = view.catchMethod === 'slash';
  const inside = !!loc.fix && !!view.zone && inZone(loc.fix.p, view.zone);

  // Why can't I ready / start? Always say it (BP §11.6).
  const readyBlock =
    loc.permission !== 'granted' ? 'Allow location to play'
    : loc.coarse ? 'Turn on Precise location for ECHO'
    : !view.zone ? (host ? 'Set a play zone first' : 'Waiting for host to set the zone')
    : !loc.fix ? 'Waiting for GPS…'
    : !fixOk ? (loc.fix.acc > RULES.maxAccuracyM ? `GPS too weak (±${Math.round(loc.fix.acc)} m) — step outside` : 'GPS signal stale…')
    : !inside ? 'Walk inside the zone'
    : slash && ble === 'unauthorized' ? 'Allow Bluetooth for Slash'
    : slash && ble === 'location' ? 'Allow precise location for Slash'
    : slash && ble === 'off' ? 'Turn on Bluetooth for Slash'
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
    ...(slash ? [(
      ble === 'unsupported' ? [view.you.role === 'hunter' ? 'This phone can’t Slash — catch with codes' : 'This phone can’t Slash — hunters use your catch code', true] // informational, not a blocker
      : ble !== 'on' ? ['Bluetooth needed for Slash', false]
      : view.you.role === 'runner' && !canAdvertise() ? ['This phone can’t broadcast — hunters use your catch code', true]
      : ['Bluetooth on (Slash)', true]) as [string, boolean]] : []),
  ];

  const summary: [IconName, string, string][] = [
    view.mode === 'infection' ? ['biohazard', `Infection · ${view.infectMs / 60_000} min`, C.hunter] : ['run-fast', 'Classic', C.text],
    slash ? ['sword', 'Slash catch', C.hunter] : ['numeric', 'Code catch', C.text],
    ['timer-outline', view.preset.label, C.text],
    [view.world ? 'cube-outline' : 'map-outline', view.world ? `3D · ${view.world.name.split(',')[0]}` : 'Plain map', C.text],
    ...(view.powers ? [['lightning-bolt', view.routeSweep ? 'Powers · route Sweep' : 'Powers', C.cyan] as [IconName, string, string]] : []),
    ...(view.shrink ? [['target', 'Shrinking zone', C.amber] as [IconName, string, string]] : []),
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
        <GameMap zone={view.zone} fix={loc.fix} mode={view.zone ? 'zone' : 'free'} zoom={15.5} pitch={45} interactive={false} world={world}
          center={loc.fix?.p ?? world?.center}
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
        {slash && (ble === 'unauthorized' || ble === 'off' || ble === 'location') && (
          <Card style={{ gap: S.sm, borderColor: C.warn }}>
            <Text style={u.h2}>{ble === 'off' ? 'Turn on Bluetooth' : 'Bluetooth needed'}</Text>
            <Text style={u.muted}>This match uses Slash: hunters catch the phone right next to them. ECHO only broadcasts an anonymous round code — no name, no location.</Text>
            {ble === 'unauthorized' && <Button icon="bluetooth" title="Allow Bluetooth" color={C.warn} onPress={askBle} />}
            {ble === 'location' && <Button icon="crosshairs-gps" title="Allow precise location" color={C.warn} onPress={askBle} />}
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

        <Pressable onPress={() => setBrief(b => !b)} accessibilityRole="button" accessibilityState={{ expanded: brief }}>
          <Card style={{ gap: S.sm, borderColor: roleColor(view.you.role) + '88' }}>
            <View style={st.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                <RoleGlyph role={view.you.role} />
                <Text style={[u.h2, { color: roleColor(view.you.role) }]}>You are a {view.you.role.toUpperCase()}</Text>
              </View>
              <Text style={[u.muted, { fontWeight: '800' }]}>{brief ? 'HIDE' : 'HOW TO PLAY'}</Text>
            </View>
            {brief && BRIEF[view.you.role].filter(([k]) => (k !== 'Zone' || view.shrink) && (!['Freeze', 'Sweep', 'Frozen?'].includes(k) || view.powers)
              && (k !== 'Slash' || slash) && (!['Infected', 'Infection'].includes(k) || view.mode === 'infection')).map(([k, v]) => (
              <Text key={k} style={u.body}><Text style={{ fontWeight: '900', color: roleColor(view.you.role) }}>{k}  </Text>{k === 'Sweep' && view.routeSweep ? v.replace('around you', 'by walking path from you') : v}</Text>
            ))}
          </Card>
        </Pressable>

        <Pressable disabled={!host} onPress={() => setSettings(true)} accessibilityRole="button" accessibilityLabel="Match settings">
          <Card style={{ gap: S.sm }}>
            <View style={st.rowBetween}>
              <Text style={u.label}>Match {host ? '' : '· host decides'}</Text>
              {host && <Pill icon="tune-variant" label="SETTINGS" color={C.cyan} />}
            </View>
            <View style={st.chips}>
              {summary.map(([icon, label, color]) => <Pill key={label} icon={icon} label={label} color={color} />)}
            </View>
            <Text style={u.muted}>Head start {fmt(view.preset.headStartMs)} · pulse every {fmt(view.preset.pulseIntervalMs)} · chase {fmt(view.preset.chaseMs)}</Text>
            {!!view.contact && <Text style={u.body}><Icon name="phone-outline" size={15} color={C.muted} />  {view.contact}</Text>}
          </Card>
        </Pressable>

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
          <Text style={u.label}>Your phone</Text>
          {checks.every(([, ok]) => ok)
            ? <Text style={[u.body, { color: C.ok }]}>✓  All set — GPS ±{Math.round(loc.fix!.acc)} m, inside the zone, alerts on</Text>
            : checks.filter(([, ok]) => !ok).map(([label], i) => <Text key={i} style={[u.body, { color: C.muted }]}>○  {label}</Text>)}
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

      {host && <SettingsSheet open={settings} onClose={() => setSettings(false)} view={view} />}

      <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <GameMap zone={view.zone} fix={loc.fix} mode="zone" pitch={55} padding={{ top: 100, bottom: 100, left: 30, right: 30 }} world={world} />
          <View style={[st.mapOverlay, { paddingTop: insets.top + S.md }]}>
            <Pressable hitSlop={10} onPress={() => setPreview(false)}><Pill icon="close" label="CLOSE" color={C.text} /></Pressable>
            <Pill label={inside ? 'YOU ARE INSIDE' : 'YOU ARE OUTSIDE'} color={inside ? C.ok : C.warn} dot />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Host-only match settings. Each section is one decision; add new ones (mode, catch method) as sections here, not on the lobby. */
function SettingsSheet({ open, onClose, view }: { open: boolean; onClose: () => void; view: GameView }) {
  const insets = useSafeAreaInsets();
  const [contactDraft, setContactDraft] = useState<string | null>(null); // only what the host is typing; otherwise show the server value
  const flush = () => { if (contactDraft !== null && contactDraft !== (view.contact ?? '')) send({ t: 'setContact', contact: contactDraft }); setContactDraft(null); };
  const close = () => { flush(); onClose(); }; // closing with the keyboard up mustn't drop the edit
  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} accessibilityState={{ selected: on }}
      style={[st.chip, on && { borderColor: C.cyan, backgroundColor: C.cyan + '22' }]}>
      <Text style={[st.chipText, on && { color: C.cyan }]}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={st.scrim} onPress={close} accessibilityLabel="Close settings" />
      <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + S.md }]}>
        <View style={st.grabber} />
        <Text style={u.h2}>Match settings</Text>
        <ScrollView contentContainerStyle={{ gap: S.lg, paddingBottom: S.md }}>
          <View style={{ gap: S.sm }}>
            <Text style={u.label}>Mode</Text>
            <View style={st.chips}>
              {chip('classic', 'Classic', view.mode === 'classic', () => send({ t: 'setMode', mode: 'classic' }))}
              {chip('infection', 'Infection', view.mode === 'infection', () => send({ t: 'setMode', mode: 'infection' }))}
            </View>
            <Text style={u.muted}>{view.mode === 'infection'
              ? 'Caught runners hunt for a while, then turn back into runners. Hunters win the moment everyone is infected; runners win if one is clean at the end.'
              : 'Caught runners are out. Hunters win by catching everyone before time runs out.'}</Text>
            {view.mode === 'infection' && (
              <View style={st.chips}>
                <Text style={[u.muted, { alignSelf: 'center' }]}>Infection lasts</Text>
                {INFECTION.durationsMs.map(ms => chip(`i${ms}`, `${ms / 60_000} min`, view.infectMs === ms, () => send({ t: 'setMode', mode: 'infection', infectMs: ms })))}
              </View>
            )}
          </View>

          <View style={{ gap: S.sm }}>
            <Text style={u.label}>Catching</Text>
            <View style={st.chips}>
              {chip('code', 'Catch code', view.catchMethod === 'code', () => send({ t: 'setCatch', method: 'code' }))}
              {chip('slash', 'Slash · Bluetooth', view.catchMethod === 'slash', () => send({ t: 'setCatch', method: 'slash' }))}
            </View>
            <Text style={u.muted}>{view.catchMethod === 'slash'
              ? 'Hunter stands right next to a runner and taps SLASH; the closest runner by Bluetooth is caught. Android only — iPhones and phones without Bluetooth fall back to codes.'
              : 'Hunter calls the runner’s alias within ~3 m and types the 4-digit code they show.'}</Text>
          </View>

          <View style={{ gap: S.sm }}>
            <Text style={u.label}>Length</Text>
            <View style={st.chips}>{(Object.keys(PRESETS) as PresetId[]).map(id => chip(id, PRESETS[id].label, view.preset.id === id, () => send({ t: 'setPreset', preset: id })))}</View>
            <Text style={u.muted}>Head start {fmt(view.preset.headStartMs)} · pulse every {fmt(view.preset.pulseIntervalMs)} · chase {fmt(view.preset.chaseMs)}</Text>
          </View>

          {(view.worlds?.length ?? 0) > 0 && (
            <View style={{ gap: S.sm }}>
              <Text style={u.label}>Map</Text>
              <View style={st.chips}>
                {[{ id: null as string | null, name: 'Plain map' }, ...(view.worlds ?? [])].map(w =>
                  chip(w.id ?? 'plain', w.id ? `3D · ${w.name}` : w.name, (view.world?.id ?? null) === w.id, () => send({ t: 'setWorld', worldId: w.id })))}
              </View>
            </View>
          )}

          <View style={{ gap: S.sm }}>
            <Text style={u.label}>Rules</Text>
            <Toggle on={view.powers} color={C.cyan} icon="lightning-bolt" title="Powers" onPress={() => send({ t: 'setPowers', on: !view.powers })}
              sub="Runners start with a Freeze, hunters with a Sweep. Stations on the map restock them." />
            {view.powers && (
              <Toggle on={view.routeSweep} color={C.cyan} icon="routes" title="Route Sweep" disabled={!view.world}
                onPress={() => send({ t: 'setRouteSweep', on: !view.routeSweep })}
                sub={view.world ? 'Sweep counts walking distance along campus paths, not straight line — a runner behind a building isn’t “near”.' : 'Needs a 3D campus map.'} />
            )}
            <Toggle on={view.shrink} color={C.amber} icon="target" title="Shrinking zone" onPress={() => send({ t: 'setShrink', on: !view.shrink })}
              sub="Shrinks up to 3 times, announced ahead with a dashed ring. Runners left outside get exposed every 20 s." />
          </View>

          <View style={{ gap: S.sm }}>
            <Text style={u.label}>Organiser contact · meeting point</Text>
            <TextInput value={contactDraft ?? view.contact ?? ''} onChangeText={setContactDraft} maxLength={120} placeholder="e.g. Call Maya 98xxxxxx · meet at the library steps"
              placeholderTextColor={C.muted} style={st.input}
              onEndEditing={flush} />
            <Text style={u.muted}>Shown to everyone whenever the round pauses. ECHO isn’t an emergency service.</Text>
          </View>
        </ScrollView>
        <Button title="Done" onPress={close} />
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Toggle({ on, color, icon, title, sub, onPress, disabled }: { on: boolean; color: string; icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on, disabled }}
      style={[st.toggle, on && { borderColor: color + 'AA' }, disabled && { opacity: 0.5 }]}>
      <Icon name={icon} size={24} color={on ? color : C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[u.body, { fontWeight: '800', color: on ? color : C.text }]}>{title} {on ? 'ON' : 'OFF'}</Text>
        <Text style={u.muted}>{sub}</Text>
      </View>
    </Pressable>
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: S.md, backgroundColor: C.panel },
  input: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, fontSize: 16, paddingHorizontal: 12, minHeight: 48 },
  scrim: { flex: 1, backgroundColor: '#000A' },
  sheet: { maxHeight: '88%', backgroundColor: C.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.xl, gap: S.md, borderWidth: 1, borderColor: C.border },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginTop: -8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: S.sm, padding: S.lg, backgroundColor: C.panelSolid, borderTopWidth: 1, borderColor: C.border },
});
