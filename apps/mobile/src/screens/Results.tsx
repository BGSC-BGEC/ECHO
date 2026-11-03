import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import type { View as GameView } from '@echo/shared';
import { leaveMatch, send } from '../net';
import { Button, Card, EchoRings, RoleGlyph, styles as u } from '../components/ui';
import { C, S, fmt } from '../theme';

export function Results({ view }: { view: GameView }) {
  const insets = useSafeAreaInsets();
  const r = view.result;
  const finalCatch = r?.winner === 'hunters' ? r.captures.at(-1) : undefined;
  const [intro, setIntro] = useState(true);
  const played = !!r?.participants.includes(view.you.id);
  const won = !!r?.winner && played && (r.winner === 'hunters') === (view.you.role === 'hunter');
  useEffect(() => {
    Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    const id = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(id);
  }, []);
  if (!r) return null;
  const color = r.winner === 'hunters' ? C.hunter : r.winner === 'runners' ? C.runner : C.muted;
  const title = r.winner === 'hunters' ? 'HUNTERS WIN' : r.winner === 'runners' ? 'RUNNERS WIN' : 'NO WINNER';
  const youWon = won;

  // Per-runner survival line; top hunter by captures.
  const infection = view.mode === 'infection'; // settings can't change between the round's end and this screen
  const caughtWord = infection ? 'infected' : 'caught';
  const runners = r.runners.map(p => { // who ran this round, even if they've since left the results screen
    const cs = r.captures.filter(x => x.runnerId === p.id), c = cs.at(-1); // infection: a runner can be caught, cured, caught again
    const survived = r.survivors.includes(p.alias);
    const now = view.players.find(x => x.id === p.id);
    return { alias: p.alias, time: !survived && c ? c.atChaseMs : r.chaseMs, caughtBy: survived ? undefined : c?.byAlias, times: cs.length,
      left: !survived && !c && (!now || now.status === 'withdrawn') };
  }).sort((a, b) => b.time - a.time);
  const tally = new Map<string, number>();
  r.captures.forEach(c => tally.set(c.byAlias, (tally.get(c.byAlias) ?? 0) + 1));
  const topHunter = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const noun = (n: number) => (infection ? (n === 1 ? 'infection' : 'infections') : n === 1 ? 'catch' : 'catches');
  const mvp = r.winner === 'hunters' && topHunter ? `${topHunter[0]} · ${topHunter[1]} ${noun(topHunter[1])}`
    : runners[0] && !runners[0].caughtBy ? `${runners[0].alias} · survived ${fmt(runners[0].time)}` : topHunter ? `${topHunter[0]} · ${topHunter[1]} ${noun(topHunter[1])}` : null;

  const share = () => Share.share({
    message: `ECHO · ${title}\n${r.reason}\n` + runners.map(x => `${x.caughtBy ? '✕' : '✓'} ${x.alias} ${fmt(x.time)}${x.caughtBy ? ` (${caughtWord} by ${x.caughtBy})` : ''}`).join('\n'),
  }).catch(() => {});

  return (
    <LinearGradient colors={[color + '33', C.bg]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: S.xl, paddingTop: insets.top + S.xl, gap: S.lg, paddingBottom: 200 }}>
        <View style={{ alignItems: 'center' }}>
          <EchoRings size={200} color={color} />
          <Animated.Text entering={ZoomIn.springify()} style={[st.title, { color }]} maxFontSizeMultiplier={1.2}>{title}</Animated.Text>
          {r.winner && played && <Text style={u.h2}>{youWon ? 'Your team won' : 'Your team lost'}</Text>}
          {!played && <Text style={u.h2}>You joined after this round — you’re in the next one</Text>}
          <Text style={[u.muted, { textAlign: 'center', marginTop: 4 }]}>
            {r.reason}{!r.complete && r.winner ? ' · practice result' : ''}{r.degraded ? ' (connection or server trouble during the round)' : ''}
          </Text>
        </View>

        <Animated.View entering={FadeInDown.delay(150)} style={st.stats}>
          <Stat label={infection ? 'Infections' : 'Captures'} value={String(r.captures.length)} />
          <Stat label="Survivors" value={String(r.survivors.length)} />
          <Stat label="Chase" value={fmt(r.chaseMs)} />
        </Animated.View>

        {mvp && (
          <Animated.View entering={FadeInDown.delay(220)}>
            <Card style={{ alignItems: 'center', gap: 2, borderColor: C.amber + '88' }}>
              <Text style={[u.label, { color: C.amber }]}>MVP</Text>
              <Text style={u.h2}>{mvp}</Text>
            </Card>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(300)}>
          <Card style={{ gap: S.sm }}>
            <Text style={u.label}>Runners</Text>
            {runners.map(x => (
              <View key={x.alias} style={st.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, flex: 1 }}>
                  <RoleGlyph role="runner" size={12} />
                  <Text style={u.body} numberOfLines={1}>{x.alias} <Text style={u.muted}>{x.caughtBy ? `${caughtWord} by ${x.caughtBy}${x.times > 1 ? ` · ${x.times}×` : ''}` : x.left ? 'left' : x.times ? `survived · infected ${x.times}×` : 'survived'}</Text></Text>
                </View>
                <Text style={[u.body, { fontVariant: ['tabular-nums'], color: x.caughtBy ? C.muted : C.ok }]}>{fmt(x.time)}</Text>
              </View>
            ))}
          </Card>
        </Animated.View>

        <View style={st.stopped}><Text style={{ color: C.ok, fontWeight: '800' }}>✓ Location sharing stopped</Text></View>
      </ScrollView>

      <View style={[st.bottom, { paddingBottom: insets.bottom + S.md }]}>
        {view.you.isHost
          ? <Button big icon="swap-horizontal" title="REMATCH · SWAP ROLES" color={C.cyan} onPress={() => send({ t: 'rematch' })} />
          : <Text style={[u.muted, { textAlign: 'center' }]}>Waiting for the host to start a rematch…</Text>}
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Button icon="share-variant" title="Share" variant="ghost" style={{ flex: 1 }} onPress={share} />
          <Button title="Leave" variant="ghost" color={C.muted} style={{ flex: 1 }} onPress={leaveMatch} />
        </View>
      </View>
      {intro && (
        <Animated.View entering={FadeIn} exiting={FadeOut.duration(500)} style={[StyleSheet.absoluteFill, st.intro]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIntro(false)} accessibilityLabel="Skip" />
          <EchoRings size={300} color={color} />
          <View style={{ position: 'absolute', alignItems: 'center', gap: 6 }} pointerEvents="none">
            <Text style={u.label}>{finalCatch ? (infection ? 'Final infection' : 'Final catch') : 'Round over'}</Text>
            <Text style={[st.introTitle, { color }]}>{finalCatch ? finalCatch.alias.toUpperCase() : title}</Text>
            {finalCatch && <Text style={u.h2}>{caughtWord} by {finalCatch.byAlias}</Text>}
          </View>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statVal} maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={u.label}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 38, fontWeight: '900', letterSpacing: 4, marginTop: -40, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: S.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: C.panel, borderRadius: 18, paddingVertical: S.lg, borderWidth: 1, borderColor: C.border },
  statVal: { color: C.text, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm },
  stopped: { alignSelf: 'center', borderWidth: 1, borderColor: C.ok + '66', backgroundColor: C.ok + '1A', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: S.lg, gap: S.sm, backgroundColor: C.panelSolid, borderTopWidth: 1, borderColor: C.border },
  intro: { backgroundColor: C.bg + 'F2', alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 44, fontWeight: '900', letterSpacing: 6, textAlign: 'center' },
});
