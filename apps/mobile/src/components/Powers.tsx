// Phase 2 power UI: freeze target sheet, incoming-freeze screen, frozen banner, hold-to-collect.
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { POWERS, type View as GameView } from '@echo/shared';
import { ackFreeze, onGameEvent, send } from '../net';
import { Button, Pill, RoleGlyph, styles as u } from './ui';
import { C, S, fmt } from '../theme';

const STATE_LABEL = {
  available: ['READY', C.ok], frozen: ['FROZEN', C.cyan], immune: ['IMMUNE', C.muted],
  unreachable: ['UNAVAILABLE', C.muted], offered: ['BEING FROZEN', C.amber], retry: ['RETRY SOON', C.muted],
} as const;

/** Runner picks which hunter to freeze. Positions are never shown — only state. */
export function FreezeSheet({ view, now, open, onClose }: { view: GameView; now: number; open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const item = view.items?.find(i => i.type === 'freeze' && !i.reserved);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + S.lg }]}>
        <View style={st.grabber} />
        <Text style={u.h2}>Freeze a hunter</Text>
        <Text style={u.muted}>
          They stop for {POWERS.freeze.activeMs / 1000} s once they acknowledge. The cost: every hunter sees your rough area. If they don’t acknowledge within {POWERS.freeze.offerMs / 1000} s, you keep your Freeze.
        </Text>
        <Text style={[u.body, { color: C.amber, fontWeight: '800' }]}>Stop somewhere safe before you send it.</Text>
        {(view.hunterStates ?? []).map(h0 => {
          // immune / retry lapse on their own; the server doesn't rebroadcast for that
          const h = (h0.state === 'immune' || h0.state === 'retry' || h0.state === 'frozen') && h0.until && h0.until <= now ? { ...h0, state: 'available' as const } : h0;
          const [label0, color] = STATE_LABEL[h.state];
          const label = h.until && h.until > now && h.state !== 'available' ? `${label0} ${Math.ceil((h.until - now) / 1000)}s` : label0;
          const ok = h.state === 'available' && !!item;
          return (
            <Pressable key={h.id} disabled={!ok} onPress={() => { if (item && send({ t: 'useFreeze', itemId: item.id, targetId: h.id })) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); } }}
              style={[st.row, !ok && { opacity: 0.5 }]} accessibilityLabel={`Freeze ${h.alias}, ${label}`}>
              <RoleGlyph role="hunter" size={13} />
              <Text style={[u.h2, { flex: 1 }]} numberOfLines={1}>{h.alias}</Text>
              <Pill label={label} color={color} />
              {ok && <Icon name="snowflake" size={22} color={C.cyan} />}
            </Pressable>
          );
        })}
        {!view.hunterStates?.length && <Text style={u.muted}>No hunters can be frozen right now.</Text>}
        <Button title="Cancel" variant="ghost" color={C.muted} onPress={onClose} />
      </View>
    </Modal>
  );
}

/** Hunter: incoming Freeze. Big, unmissable, one button. */
export function FreezeOfferOverlay({ offer, now }: { offer: { offerId: string; expiresAt: number }; now: number }) {
  const insets = useSafeAreaInsets();
  const left = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut} style={[StyleSheet.absoluteFill, st.offer, { paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl }]}>
      <Icon name="snowflake-alert" size={88} color={C.cyan} />
      <Text style={st.offerTitle}>FREEZE INCOMING</Text>
      <Text style={[u.h2, { textAlign: 'center' }]}>A runner is freezing you. Stop somewhere safe, then tap:</Text>
      <Button big icon="hand-back-right" title={`I'VE STOPPED · ${left}s`} color={C.cyan} style={{ alignSelf: 'stretch' }}
        onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); ackFreeze(offer.offerId); }} />
      <Text style={[u.muted, { textAlign: 'center' }]}>Crossing a road? Get to the side first. If time runs out, the runner keeps their Freeze.</Text>
    </Animated.View>
  );
}

/** Hunter: frozen countdown. Map stays readable; captures / sweeps / stations are blocked server-side. */
export function FrozenBanner({ until, now }: { until: number; now: number }) {
  return (
    <View style={st.frozen} accessibilityLiveRegion="polite">
      <Icon name="snowflake" size={26} color={C.bg} />
      <Text style={st.frozenText}>FROZEN · {Math.max(0, Math.ceil((until - now) / 1000))} s — stay where you are</Text>
    </View>
  );
}

/**
 * Hold-to-collect. Press starts a claim; after the hold time we ask the server to finish once a second
 * until it has seen enough good fixes (TDD D01). Releasing cancels.
 */
export function HoldToCollect({ stationId, label, onStart, fixes }: { stationId: string; label: string; onStart: () => void; fixes?: number }) {
  const [holding, setHolding] = useState(false);
  const a11yHold = useRef(false); // screen readers can't press-and-hold: a tap runs the whole hold
  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const ring = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const stop = (cancel: boolean) => {
    clearInterval(timer.current); clearTimeout(timer.current as unknown as ReturnType<typeof setTimeout>); timer.current = undefined;
    cancelAnimation(progress); progress.set(withTiming(0, { duration: 150 }));
    setHolding(false);
    if (cancel) send({ t: 'claimCancel' }, true);
  };
  useEffect(() => onGameEvent(e => {
    if ((e.kind === 'claimed' || e.kind === 'claimFailed') && e.stationId === stationId) stop(false);
  }), [stationId]);
  // unmounted mid-hold (walked out of range, GPS jitter): tell the server, or the claim stays open
  useEffect(() => () => { if (timer.current) { clearInterval(timer.current); send({ t: 'claimCancel' }, true); } }, []);

  const begin = () => {
    if (timer.current || !send({ t: 'claimStart', stationId })) return;
    onStart(); // push a fresh fix right away
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    progress.set(withTiming(1, { duration: POWERS.station.holdMs, easing: Easing.linear }));
    // ask to finish from just before the hold time; the server answers "keep holding" until it has the fixes
    const startFinishing = setTimeout(() => {
      send({ t: 'claimFinish', stationId }, true);
      timer.current = setInterval(() => send({ t: 'claimFinish', stationId }, true), 700);
    }, POWERS.station.holdMs - 250);
    timer.current = startFinishing as unknown as ReturnType<typeof setInterval>;
  };
  const end = () => { if (timer.current && !a11yHold.current) stop(true); };
  return (
    <Pressable
      onPressIn={begin}
      onPressOut={end}
      onPress={() => { a11yHold.current = true; begin(); setTimeout(() => { a11yHold.current = false; }, POWERS.station.holdMs + 6000); }}
      style={st.hold} accessibilityRole="button" accessibilityLabel={`Hold to collect ${label}`} accessibilityHint={`Stand still and hold for ${POWERS.station.holdMs / 1000} seconds`}>
      <Animated.View style={[st.holdFill, ring]} />
      <Icon name="treasure-chest" size={20} color={C.amber} />
      <Text style={st.holdText}>{!holding ? `HOLD TO COLLECT ${label.toUpperCase()}` : (fixes ?? 0) < POWERS.station.minFixes ? `Stay still — GPS ${fixes ?? 0}/${POWERS.station.minFixes}…` : 'Keep holding…'}</Text>
    </Pressable>
  );
}

export const cooldownLabel = (readyAt: number | undefined, now: number) => (readyAt && readyAt > now ? fmt(readyAt - now) : '');

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000A' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.xl, gap: S.md, borderWidth: 1, borderColor: C.border },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginTop: -8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.bg, borderRadius: 14, padding: S.lg },
  offer: { backgroundColor: '#06222BF5', alignItems: 'center', justifyContent: 'center', gap: S.lg, paddingHorizontal: S.xl, zIndex: 30 },
  offerTitle: { color: C.cyan, fontSize: 36, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  frozen: { flexDirection: 'row', alignItems: 'center', gap: S.sm, alignSelf: 'center', backgroundColor: C.cyan, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  frozenText: { color: C.bg, fontWeight: '900', fontSize: 16 },
  hold: { minHeight: 56, borderRadius: 14, borderWidth: 2, borderColor: C.amber, backgroundColor: C.bg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.amber + '55' },
  holdText: { color: C.amber, fontWeight: '900', letterSpacing: 0.6 },
});
