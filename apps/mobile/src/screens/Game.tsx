import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { RULES, SHRINK, clearlyOutside, distanceM, type GameEvent, type LngLat, type View as GameView } from '@echo/shared';
import { leaveMatch, onGameEvent, send, serverNow, useNet } from '../net';
import { fixAge, fixGood, useLocation } from '../location';
import { GameMap, type CameraMode } from '../components/GameMap';
import { ServerMoved } from '../components/ServerMoved';
import { Button, EchoRings, Pill, RoleGlyph, styles as u } from '../components/ui';
import { C, S, ago, bearingLabel, fmt, roleColor } from '../theme';

function useNow(ms = 250) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const id = setInterval(() => setNow(serverNow()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

type Flash = { key: number; title: string; sub?: string; color: string; ms?: number };

export function Game({ view, keepAwake, onToggleAwake }: { view: GameView; keepAwake: boolean; onToggleAwake: () => void }) {
  const insets = useSafeAreaInsets();
  const realNow = useNow();
  const paused = view.paused;
  // Clocks are frozen while paused (server shifts deadlines on resume), so render against the pause instant.
  const now = paused && (!paused.resumeAt || realNow < paused.resumeAt) ? paused.since : realNow;
  const net = useNet();
  const { fix, prev, permission } = useLocation();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [cam, setCam] = useState<CameraMode>('follow');
  const [fit, setFit] = useState<{ key: number; pts: LngLat[] }>({ key: 0, pts: [] });
  const panned = useRef(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setCamManual = (m: CameraMode) => { clearTimeout(backTimer.current); panned.current = m === 'free'; setCam(m); };
  useEffect(() => () => clearTimeout(backTimer.current), []);

  const role = view.you.role;
  const hunter = role === 'hunter';
  const caught = view.you.status !== 'active';
  const rc = roleColor(role);
  const runners = view.players.filter(p => p.role === 'runner');
  const runnersLeft = runners.filter(p => p.status === 'active').length;
  // Outside only when the last two fixes agree, so boundary jitter doesn't flicker the warning.
  const isOut = (f?: typeof fix) => !!f && !!view.zone && clearlyOutside(f.p, f.acc, view.zone, view.zoneNow); // GPS error in the player's favour
  const outside = !caught && isOut(fix) && isOut(prev);
  const mapNow = Math.floor(now / 1000) * 1000; // map redraws once a second, not 4x
  const pulseIn = view.nextPulseAt ? view.nextPulseAt - now : undefined;
  const pulseSoon = !hunter && !caught && pulseIn !== undefined && pulseIn < 10_000;

  const show = (f: Omit<Flash, 'key'>) => setFlash({ ...f, key: Date.now() });
  // Role reveal for the first seconds of the round.
  const [intro, setIntro] = useState(view.phase === 'headstart');
  const caughtRef = useRef(caught);
  const stageRef = useRef(view.shrinkAt?.length ?? 0);
  const stagesLeft = view.shrinkAt?.length ?? 0;
  useEffect(() => { caughtRef.current = caught; stageRef.current = stagesLeft; }, [caught, stagesLeft]);
  const exposedStage = useRef(-1);

  // Frame fresh pulse cells + me for a few seconds, then go back to following (unless the user took over).
  const overview = (pts: LngLat[]) => {
    if (!pts.length) return;
    clearTimeout(backTimer.current);
    panned.current = false;
    setCam('free');
    setFit(f => ({ key: f.key + 1, pts }));
    backTimer.current = setTimeout(() => { if (!panned.current) setCam('follow'); }, 5000);
  };

  useEffect(() => onGameEvent((e: GameEvent) => {
    if (e.kind === 'pulse') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      show({ title: 'PULSE', sub: 'Runner signals updated', color: C.amber });
    }
    if (e.kind === 'revealed') { Vibration.vibrate([0, 400, 120, 400]); show({ title: 'REVEALED', sub: 'Hunters saw your area — move!', color: C.warn }); }
    if (e.kind === 'unavailable') { Vibration.vibrate(300); setToast('Your GPS was too weak at that pulse — hunters saw “signal unavailable”'); }
    if (e.kind === 'phase' && e.phase === 'chase') { Vibration.vibrate([0, 600]); show({ title: 'HUNT ON', sub: hunter ? 'Go find them' : 'Hunters released', color: C.hunter }); }
    if (e.kind === 'paused') { Vibration.vibrate([0, 700, 200, 700]); setCaptureOpen(false); setIntro(false); } // a pause closes sheets/intro; nothing reopens on resume
    if (caughtRef.current && (e.kind === 'zoneWarning' || e.kind === 'zoneShrunk')) return; // out of the round: no zone nagging
    if (e.kind === 'exposed') { if (exposedStage.current === stageRef.current) return; exposedStage.current = stageRef.current; } // flash once per stage; banner covers the rest
    if (e.kind === 'zoneWarning') { Vibration.vibrate([0, 300, 120, 300, 120, 300]); show({ title: 'ZONE SHRINKING', sub: `New zone in ${Math.max(1, Math.round((e.at - serverNow()) / 1000))} s — dashed ring`, color: C.amber, ms: 2600 }); }
    if (e.kind === 'zoneShrunk') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); show({ title: 'ZONE SHRUNK', sub: hunter ? 'Runners outside it get exposed' : `Get inside in ${SHRINK.graceMs / 1000} s or you’re exposed`, color: C.amber, ms: 2400 }); }
    if (e.kind === 'exposed') { Vibration.vibrate([0, 500, 150, 500]); show({ title: 'EXPOSED', sub: 'You’re outside the zone — hunters can see you', color: C.warn }); }
    if (e.kind === 'resumed') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); show({ title: 'GO', sub: 'Round resumed', color: C.ok }); }
    if (e.kind === 'captured') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (e.runnerId === view.you.id) show({ title: 'CAUGHT', sub: `by ${e.byAlias}`, color: C.warn, ms: 2600 });
      else if (e.byAlias === view.you.alias) show({ title: 'CAPTURED', sub: e.alias, color: C.hunter, ms: 2600 });
      else setToast(`${e.alias} was caught by ${e.byAlias}`);
    }
  }), [hunter, view.you.id, view.you.alias]);

  // Hunter: when a new pulse lands, frame the revealed cells.
  const lastPulse = useRef(view.pulseIndex);
  useEffect(() => {
    if (!hunter || view.pulseIndex === lastPulse.current) return;
    lastPulse.current = view.pulseIndex;
    overview(view.disclosures.filter(d => d.cell).flatMap(d => d.cell!));
  }, [view.pulseIndex]);

  // Countdown haptics: head start 3-2-1, runner pulse warning at 10 s.
  const buzzed = useRef('');
  useEffect(() => {
    const hs = view.phase === 'headstart' ? Math.ceil((view.headStartEndsAt! - now) / 1000) : 0;
    if (hs >= 1 && hs <= 3 && buzzed.current !== `hs${hs}`) { buzzed.current = `hs${hs}`; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }
    if (pulseSoon && pulseIn! > 9_000 && buzzed.current !== `p${view.pulseIndex}`) {
      buzzed.current = `p${view.pulseIndex}`; Vibration.vibrate([0, 250, 150, 250]);
    }
  }, [mapNow]);

  // Zone-edge crossing buzz.
  const lastEdgeBuzz = useRef(0);
  useEffect(() => {
    if (outside && Date.now() - lastEdgeBuzz.current > 20_000) { lastEdgeBuzz.current = Date.now(); Vibration.vibrate([0, 200, 100, 200, 100, 200]); }
  }, [outside]);

  useEffect(() => { if (intro) { const id = setTimeout(() => setIntro(false), 3200); return () => clearTimeout(id); } }, [intro]);

  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), flash.ms ?? 1800); return () => clearTimeout(id); }, [flash]);
  useEffect(() => { if (!toastMsg) return; const id = setTimeout(() => setToast(null), 4000); return () => clearTimeout(id); }, [toastMsg]);

  // timer + next-event line (BP §11.2)
  let big = '', line = '';
  if (view.phase === 'headstart') {
    big = fmt(view.headStartEndsAt! - now);
    line = hunter ? 'Stay at START · release in' : 'Head start — get away!';
  } else {
    big = fmt(view.chaseEndsAt! - now);
    if (caught) line = 'You are out · location sharing stopped';
    else if (pulseIn !== undefined) line = hunter ? `Next pulse in ${fmt(pulseIn)}` : `You reveal in ${fmt(pulseIn)}`;
    else line = 'No more pulses — final stretch';
  }

  const nowSec = Math.floor(now / 1000);
  const fixTs = fix?.ts;
  // Hunter intel list: one row per runner with the freshest evidence.
  const intel = useMemo(() => runners.map(r => {
    if (r.status !== 'active') return { id: r.id, alias: r.alias, text: r.status === 'caught' ? 'caught' : 'left', tone: C.muted, cell: undefined as LngLat[] | undefined };
    const d = view.disclosures.find(x => x.runnerId === r.id && x.expiresAt > now);
    if (!d) return { id: r.id, alias: r.alias, text: view.pulseIndex ? 'no recent signal' : 'awaiting first pulse', tone: C.muted, cell: undefined };
    if (d.unavailable) return { id: r.id, alias: r.alias, text: 'signal unavailable', tone: C.warn, cell: undefined };
    const c = d.cell!; const mid: LngLat = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2];
    const where = fix ? `${Math.round(distanceM(fix.p, mid) / 10) * 10} m ${bearingLabel(fix.p, mid)}` : '';
    return { id: r.id, alias: r.alias, text: `${d.exposed ? 'OUTSIDE ZONE · ' : ''}${where} · ${ago(now - (d.sampledAt ?? d.revealedAt))}`, tone: d.exposed ? C.warn : d.brightUntil > now ? C.amber : C.cyan, cell: c };
  }), [view.disclosures, view.players, nowSec, fixTs]);

  const confirmLeave = () => Alert.alert(caught ? 'Leave the match?' : 'Leave and stop sharing?',
    caught ? 'You can still see the result if you stay.' : 'Your team plays on without you; the round becomes a practice result.', [
      { text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: leaveMatch },
    ]);
  const menu = () => Alert.alert('Match', undefined, [
    { text: keepAwake ? 'Let screen sleep' : 'Keep screen on', onPress: onToggleAwake },
    ...(view.you.isHost ? [{ text: 'End round for everyone', style: 'destructive' as const, onPress: () =>
      Alert.alert('End the round now?', 'No winner will be recorded.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End round', style: 'destructive', onPress: () => send({ t: 'endRound' }) }]) }] : []),
    { text: 'Leave match', style: 'destructive' as const, onPress: confirmLeave },
    { text: 'Cancel', style: 'cancel' as const },
  ]);

  const gpsBad = !caught && permission === 'granted' && !fixGood(fix);
  // Most important first; at most two on screen so the map stays visible.
  const banners: { text: string; color: string; onPress?: () => void }[] = [];
  if (net.status !== 'open') banners.push({ text: 'Connection lost — reconnecting…', color: C.warn });
  if (permission !== 'granted' && !caught) banners.push({ text: 'Location is off for ECHO — tap to open Settings', color: C.warn, onPress: () => Linking.openSettings() });
  if (outside) banners.push({ color: C.warn, text:
    view.zoneNow && !hunter && view.graceUntil && now < view.graceUntil ? `⚠ Zone shrank — get inside in ${Math.ceil((view.graceUntil - now) / 1000)} s`
    : view.zoneNow && !hunter ? `⚠ Outside the zone — hunters see you every ${SHRINK.exposeEveryMs / 1000} s`
    : '⚠ Outside the zone — head back in' });
  if (view.zoneNext && !caught) banners.push({ color: C.amber, text: hunter ? `Zone shrinks in ${fmt(view.zoneNext.at - now)}` : `Zone shrinks in ${fmt(view.zoneNext.at - now)} — get inside the dashed ring` });
  if (gpsBad) banners.push({ color: C.amber, text: !fix ? 'Waiting for GPS…' : fix.acc > RULES.maxAccuracyM ? `Weak GPS (±${Math.round(fix.acc)} m) — get under open sky` : `GPS stale (${Math.round(fixAge(fix) / 1000)}s) — step into open sky` });
  const offlineLong = !paused && !!net.downSince && realNow - net.downSince > 10_000; // TDD §06.6 local stop-play
  const bottomH = caught ? 120 : hunter ? 210 : 170; // tray height, for map padding

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GameMap zone={view.zone} disclosures={view.disclosures} now={mapNow} fix={caught ? undefined : fix} zoom={17}
        mode={cam} fitKey={fit.key} fitExtra={fit.pts}
        padding={{ top: insets.top + 240, bottom: bottomH + 30, left: 40, right: 40 }}
        ownReveal={view.yourReveal} zoneNow={view.zoneNow} zoneNext={view.zoneNext}
        onUserPan={() => setCamManual('free')} />

      {/* top HUD */}
      <View style={[st.top, { paddingTop: insets.top + S.sm }]} pointerEvents="box-none">
        <View style={st.topRow}>
          <View style={[st.roleBadge, { borderColor: rc }]}>
            <RoleGlyph role={role} size={12} />
            <Text style={[st.roleText, { color: rc }]}>{caught ? (view.you.status === 'caught' ? 'CAUGHT' : 'LEFT') : role.toUpperCase()}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Pressable hitSlop={8} onPress={onToggleAwake} accessibilityLabel={keepAwake ? 'Let screen sleep' : 'Keep screen on'} style={[st.iconBtn, keepAwake && { borderColor: C.amber }]}>
              <Icon name={keepAwake ? 'white-balance-sunny' : 'weather-night'} size={20} color={keepAwake ? C.amber : C.muted} />
            </Pressable>
            {view.you.status !== 'withdrawn' && !paused && (
              <Pressable hitSlop={8} onPress={() => send({ t: 'pause' })} accessibilityLabel="Pause the round for everyone" style={[st.iconBtn, st.pauseBtn]}>
                <Icon name="pause" size={18} color={C.amber} />
                <Text style={st.pauseTxt}>PAUSE ALL</Text>
              </Pressable>
            )}
            <Pressable hitSlop={8} onPress={menu} accessibilityLabel="Match menu" style={st.iconBtn}>
              <Icon name="dots-horizontal" size={22} color={C.text} />
            </Pressable>
          </View>
        </View>
        <View style={[st.timerCard, pulseSoon ? { borderColor: C.warn, backgroundColor: '#2A1214' } : null]}>
          <Text style={st.timer} maxFontSizeMultiplier={1.2}>{big}</Text>
          <Text style={[st.line, pulseSoon ? { color: C.warn } : null]} maxFontSizeMultiplier={1.3}>{line}</Text>
          <Pressable hitSlop={8} onPress={() => setRosterOpen(true)} accessibilityLabel="Show players" style={{ marginTop: 6 }}>
            <Pill icon="account-group" label={`${runnersLeft}/${runners.length} RUNNERS LEFT`} color={C.cyan} />
          </Pressable>
        </View>
        {banners.slice(0, 2).map(bn => <Banner key={bn.text} color={bn.color} text={bn.text} onPress={bn.onPress} />)}
      </View>

      {/* map controls */}
      <View style={[st.mapBtns, { bottom: bottomH + S.md }]}>
        <MapBtn icon="vector-square" on={cam === 'zone'} onPress={() => setCamManual(cam === 'zone' ? 'follow' : 'zone')} a11y="Show whole zone" />
        <MapBtn icon="crosshairs-gps" on={cam === 'follow'} onPress={() => setCamManual('follow')} a11y="Center on me" />
      </View>

      {/* bottom tray */}
      <View style={[st.bottom, { paddingBottom: insets.bottom + S.md }]}>
        {caught ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={u.h2}>{view.you.status === 'caught' ? 'You were caught' : 'You left the round'}</Text>
            <Text style={[u.muted, { textAlign: 'center' }]}>Location sharing stopped. Walk back to START — don’t tip off your team.</Text>
          </View>
        ) : hunter ? (
          <View style={{ gap: S.sm }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {intel.map(i => (
                <Pressable key={i.id} disabled={!i.cell} onPress={() => i.cell && overview(i.cell)} style={[st.intel, { borderColor: i.tone + '88' }]}>
                  <Text style={[st.intelName, { color: i.tone }]} numberOfLines={1}>{i.alias}</Text>
                  <Text style={st.intelText} numberOfLines={1}>{i.text}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button big icon="handcuffs" title={view.phase === 'chase' ? 'CAPTURE' : 'CAPTURE · AFTER HEAD START'} color={C.hunter}
              disabled={view.phase !== 'chase'} onPress={() => setCaptureOpen(true)} />
          </View>
        ) : (
          <View style={{ gap: S.sm }}>
            <Text style={[u.muted, { textAlign: 'center' }]}>
              {view.lastRevealedAt ? `Last revealed ${ago(now - view.lastRevealedAt)}${view.yourReveal && view.yourReveal.expiresAt > now ? ' · red box = what hunters saw' : ''}` : 'Not revealed yet'}
              {fix ? `  ·  GPS ±${Math.round(fix.acc)} m` : ''}
            </Text>
            <Pressable onPress={() => setShowCode(s => !s)} style={st.codeCard} accessibilityLabel={showCode ? `Catch code ${view.you.catchCode?.split('').join(' ')}` : 'Reveal catch code'}>
              <Text style={u.label}>Catch code · show a hunter only when caught</Text>
              <Text style={st.codeBig}>{showCode ? view.you.catchCode : '• • • •'}</Text>
              <Text style={u.muted}>{showCode ? 'Tap to hide' : 'Tap to reveal'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {toastMsg && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[st.toast, { bottom: bottomH + 70 }]} pointerEvents="none">
          <Text style={[u.body, { textAlign: 'center' }]}>{toastMsg}</Text>
        </Animated.View>
      )}

      {flash && (
        <Animated.View key={flash.key} entering={FadeIn.duration(150)} exiting={FadeOut.duration(400)} style={st.flash} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: flash.color, opacity: 0.14 }]} />
          <EchoRings size={320} color={flash.color} count={3} duration={1400} />
          <Animated.View entering={ZoomIn.springify()} style={st.flashText}>
            <Text style={[st.flashTitle, { color: flash.color }]}>{flash.title}</Text>
            {flash.sub && <Text style={[u.h2, { textAlign: 'center' }]}>{flash.sub}</Text>}
          </Animated.View>
        </Animated.View>
      )}

      {offlineLong && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[st.flash, st.pauseBg, { paddingTop: insets.top }]}>
          <Icon name="wifi-off" size={64} color={C.warn} />
          <Text style={[st.flashTitle, { color: C.warn, fontSize: 32 }]}>YOU’RE OFFLINE</Text>
          <Text style={[u.h2, { textAlign: 'center', paddingHorizontal: S.xl }]}>Stop playing until ECHO reconnects. Your location still uploads when it can.</Text>
          <Text style={[u.muted, { textAlign: 'center', paddingHorizontal: S.xl }]}>Get back on the game Wi-Fi. This clears by itself when you’re back.</Text>
          <View style={{ alignSelf: 'stretch', paddingHorizontal: S.xl }}><ServerMoved /></View>
          <Button title="Leave match" variant="ghost" color={C.muted} onPress={leaveMatch} />
        </Animated.View>
      )}

      {intro && (
        <Animated.View entering={FadeIn} exiting={FadeOut.duration(500)} style={[st.flash, { backgroundColor: C.bg + 'F0' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIntro(false)} />
          <EchoRings size={300} color={rc} />
          <View style={st.flashText} pointerEvents="none">
            <Text style={u.label}>You are a</Text>
            <Text style={[st.flashTitle, { color: rc, fontSize: 54 }]}>{role.toUpperCase()}</Text>
            <Text style={[u.h2, { textAlign: 'center', maxWidth: 280 }]}>{hunter ? 'Stay at START until release.' : 'RUN. Hunters are released soon.'}</Text>
          </View>
        </Animated.View>
      )}

      {paused && <PauseOverlay view={view} realNow={realNow} />}
      {captureOpen && !caught && !paused && <CaptureSheet view={view} now={now} open onClose={() => setCaptureOpen(false)} />}
      <RosterSheet view={view} open={rosterOpen} onClose={() => setRosterOpen(false)} />
    </View>
  );
}

function PauseOverlay({ view, realNow }: { view: GameView; realNow: number }) {
  const insets = useSafeAreaInsets();
  const p = view.paused!;
  const counting = p.resumeAt && p.resumeAt > realNow;
  const host = view.players.find(x => x.isHost);
  const meHost = view.you.isHost;
  const lostIsMe = p.reason === 'technical' && p.byId === view.you.id;
  const title = p.reason === 'safety' ? 'PAUSED FOR EVERYONE' : p.reason === 'technical' ? `WAITING FOR ${(p.by ?? 'A PLAYER').toUpperCase()}` : 'SERVER RESTARTED';
  const why = p.reason === 'safety' ? `${p.by ?? 'Someone'} paused the round. Everyone stop where it’s safe.`
    : p.reason === 'technical' ? `ECHO lost contact with ${p.by ?? 'a player'}. The round continues by itself when they’re back.`
    : 'The game server restarted. Everyone reopen ECHO, then the host resumes.';
  const endRound = () => Alert.alert('End the round now?', 'No winner will be recorded.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End round', style: 'destructive', onPress: () => send({ t: 'endRound' }) }]);
  const dropLost = () => p.byId && Alert.alert(`Continue without ${p.by}?`, 'They’ll be removed from this round; it becomes a practice result.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: () => send({ t: 'dropPlayer', playerId: p.byId! }) }]);
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[st.flash, st.pauseBg, { paddingTop: insets.top, paddingBottom: insets.bottom + S.md }]}>
      <Icon name={counting ? 'play-circle-outline' : p.reason === 'safety' ? 'hand-back-right-outline' : p.reason === 'technical' ? 'account-clock-outline' : 'server-network'} size={68} color={counting ? C.ok : C.amber} />
      <Text style={[st.flashTitle, { color: counting ? C.ok : C.amber, fontSize: 30, textAlign: 'center' }]}>{counting ? `RESUMING ${Math.ceil((p.resumeAt! - realNow) / 1000)}` : title}</Text>
      <Text style={[u.h2, { textAlign: 'center', paddingHorizontal: S.xl }]}>{counting ? 'Get ready — clocks restart in a moment.' : lostIsMe ? 'That’s you — you’re back, the round resumes shortly.' : why}</Text>
      <Text style={[u.muted, { textAlign: 'center', paddingHorizontal: S.xl }]}>No captures, pulses or timers run while paused. Paused time doesn’t count.</Text>
      {!!view.contact && <Text style={[u.body, { textAlign: 'center', paddingHorizontal: S.xl, color: C.cyan }]}>Organiser: {view.contact}</Text>}
      {!counting && (meHost ? (
        <View style={{ alignSelf: 'stretch', marginHorizontal: S.xl, gap: S.sm }}>
          <Button big icon="play" title="RESUME ROUND" color={C.ok} onPress={() => send({ t: 'resume' })} />
          {p.reason === 'technical' && p.byId && <Button icon="account-remove-outline" title={`Continue without ${p.by}`} variant="ghost" color={C.amber} onPress={dropLost} />}
          <Button icon="flag-checkered" title="End round" variant="ghost" color={C.warn} onPress={endRound} />
        </View>
      ) : <Text style={[u.body, { color: C.cyan, textAlign: 'center' }]}>Waiting for {host ? `${host.alias} (host)` : 'the host'} to resume…</Text>)}
      <Button title="Leave match" variant="ghost" color={C.muted} onPress={() => Alert.alert('Leave the match?', undefined, [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: leaveMatch }])} />
    </Animated.View>
  );
}

function Banner({ text, color, onPress }: { text: string; color: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[st.banner, { backgroundColor: color }]}>
      <Text style={st.bannerText} maxFontSizeMultiplier={1.3}>{text}</Text>
    </Pressable>
  );
}

function MapBtn({ icon, on, onPress, a11y }: { icon: keyof typeof Icon.glyphMap; on: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={a11y} hitSlop={6}
      style={[st.mapBtn, on && { borderColor: C.cyan, backgroundColor: C.cyan + '33' }]}>
      <Icon name={icon} size={24} color={on ? C.cyan : C.text} />
    </Pressable>
  );
}

function CaptureSheet({ view, now, open, onClose }: { view: GameView; now: number; open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const net = useNet();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const locked = view.captureLockedUntil && view.captureLockedUntil > now ? view.captureLockedUntil - now : 0;
  const offline = net.status !== 'open';

  const openedAt = useRef(0); // sheet mounts on every open, so state starts fresh
  useEffect(() => { openedAt.current = Date.now(); }, []);
  useEffect(() => onGameEvent(e => {
    if (e.kind === 'catchFailed') {
      setPending(false); setCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake.value = withSequence(withTiming(-12, { duration: 50 }), withTiming(12, { duration: 50 }), withTiming(-8, { duration: 50 }), withTiming(0, { duration: 50 }));
      setMsg({ text: e.lockedUntil ? 'Wrong code — capture locked for 30 s' : `Wrong code · ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'try' : 'tries'} before a 30 s lock`, bad: true });
    }
    if (e.kind === 'captured' && e.byAlias === view.you.alias) { setPending(false); onClose(); }
  }), [view.you.alias]);
  useEffect(() => {
    if (open && net.error && net.error.at > openedAt.current) { setPending(false); setCode(''); setMsg({ text: net.error.msg, bad: true }); }
  }, [net.error?.at]);

  const key = (k: string) => {
    if (pending || locked || offline) return;
    Haptics.selectionAsync();
    if (k === '⌫') return setCode(c => c.slice(0, -1));
    if (code.length >= RULES.catchCodeLength) return; // no double submit
    const next = code + k;
    setCode(next); setMsg(null);
    if (next.length === RULES.catchCodeLength && send({ t: 'capture', code: next })) {
      setPending(true);
      setTimeout(() => setPending(p => { if (p) { setCode(''); setMsg({ text: 'No answer from the server — try again', bad: true }); } return false; }), 6000);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + S.lg }]}>
        <View style={st.grabber} />
        <Text style={u.h2}>Enter the runner’s catch code</Text>
        <Text style={[u.body, { color: C.amber, fontWeight: '800' }]}>Stop first. Stand still before typing.</Text>
        <Text style={u.muted}>Within ~3 m, clear line of sight, called their alias, no touching. They show you their 4-digit code.</Text>
        <Animated.View style={[st.codeSlots, shakeStyle]}>
          {Array.from({ length: RULES.catchCodeLength }, (_, i) => (
            <View key={i} style={[st.slot, code[i] ? { borderColor: C.hunter } : null, msg?.bad && !code ? { borderColor: C.warn } : null]}>
              <Text style={st.slotText}>{code[i] ?? ''}</Text>
            </View>
          ))}
        </Animated.View>
        <Text style={[u.body, { textAlign: 'center', minHeight: 22, color: offline || locked || msg?.bad ? C.warn : C.muted }]}>
          {offline ? 'Offline — reconnecting…' : locked ? `Locked · try again in ${Math.ceil(locked / 1000)} s` : pending ? 'Checking…' : msg?.text ?? ' '}
        </Text>
        <View style={[st.pad, (locked > 0 || offline) && { opacity: 0.35 }]}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <Pressable key={i} disabled={!k} onPress={() => key(k)} accessibilityLabel={k === '⌫' ? 'Delete' : k}
              style={({ pressed }) => [st.padKey, !k && { opacity: 0 }, pressed && { backgroundColor: C.panelHi }]}>
              <Text style={st.padText}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Cancel" variant="ghost" color={C.muted} onPress={onClose} />
      </View>
    </Modal>
  );
}

function RosterSheet({ view, open, onClose }: { view: GameView; open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const label = (p: GameView['players'][number]) =>
    p.status === 'caught' ? ['CAUGHT', C.muted] : p.status === 'withdrawn' ? ['LEFT', C.muted] : !p.connected ? ['OFFLINE', C.warn] : ['ACTIVE', C.ok];
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + S.lg }]}>
        <View style={st.grabber} />
        <Text style={u.h2}>Players</Text>
        {(['hunter', 'runner'] as const).map(r => (
          <View key={r} style={{ gap: 6 }}>
            <Text style={[u.label, { color: roleColor(r) }]}>{r}s</Text>
            {view.players.filter(p => p.role === r).map(p => {
              const [t, c] = label(p);
              return (
                <View key={p.id} style={st.rosterRow}>
                  <RoleGlyph role={r} size={12} />
                  <Text style={[u.body, { flex: 1 }]} numberOfLines={1}>{p.alias}{p.id === view.you.id ? ' (you)' : ''}</Text>
                  <Pill label={t} color={c} />
                </View>
              );
            })}
          </View>
        ))}
        <Text style={u.muted}>Positions are never shown here — only status.</Text>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: S.lg, gap: S.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.panelSolid },
  roleText: { fontWeight: '900', letterSpacing: 1.5, fontSize: 13 },
  timerCard: { alignSelf: 'center', alignItems: 'center', backgroundColor: C.panelSolid, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 28, paddingVertical: 8 },
  timer: { color: C.text, fontSize: 46, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 2 },
  line: { color: C.cyan, fontSize: 16, fontWeight: '800' },
  banner: { alignSelf: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  bannerText: { color: '#fff', fontWeight: '900', fontSize: 14, textAlign: 'center' },
  pauseBtn: { width: undefined, paddingHorizontal: 12, flexDirection: 'row', gap: 4, borderColor: C.amber + '99' },
  pauseTxt: { color: C.amber, fontWeight: '900', fontSize: 12, letterSpacing: 0.8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panelSolid, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pauseBg: { backgroundColor: C.bg + 'F5', gap: S.md, zIndex: 20 },
  mapBtns: { position: 'absolute', right: S.lg, gap: S.sm },
  mapBtn: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.panelSolid, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: S.lg, backgroundColor: C.panelSolid, borderTopWidth: 1, borderColor: C.border },
  intel: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.bg, minWidth: 120, maxWidth: 220 },
  intelName: { fontWeight: '900', fontSize: 15 },
  intelText: { color: C.text, fontSize: 13, marginTop: 2 },
  codeCard: { alignItems: 'center', gap: 2 },
  codeBig: { color: C.runner, fontSize: 40, fontWeight: '900', letterSpacing: 10, fontVariant: ['tabular-nums'] },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: C.panelHi, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.border, maxWidth: '90%' },
  flash: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flashText: { position: 'absolute', alignItems: 'center', gap: 4 },
  flashTitle: { fontSize: 46, fontWeight: '900', letterSpacing: 8 },
  scrim: { flex: 1, backgroundColor: '#000A' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.xl, gap: S.md, borderWidth: 1, borderColor: C.border },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginTop: -8 },
  codeSlots: { flexDirection: 'row', justifyContent: 'center', gap: S.md },
  slot: { width: 58, height: 66, borderRadius: 14, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  slotText: { color: C.text, fontSize: 30, fontWeight: '900' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: S.sm },
  padKey: { width: '31%', height: 58, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  padText: { color: C.text, fontSize: 24, fontWeight: '800' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.bg, borderRadius: 12, padding: S.md },
});
