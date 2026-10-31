// Screen is a pure function of server phase (no router needed for Phase 1).
import { useEffect, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, BackHandler, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { boot, leaveMatch, onGameEvent, resumeNow, toast, useNet } from './src/net';
import { checkPermission, restartWatching, useLocationUplink } from './src/location';
import { setupNotifications, useRoundAlerts } from './src/notify';
import { Home } from './src/screens/Home';
import { ServerMoved } from './src/components/ServerMoved';
import { Lobby } from './src/screens/Lobby';
import { ZoneEditor } from './src/screens/ZoneEditor';
import { Game } from './src/screens/Game';
import { Results } from './src/screens/Results';
import { C } from './src/theme';
import { Button, EchoRings } from './src/components/ui';

export default function App() {
  useEffect(() => {
    boot(); checkPermission(); setupNotifications();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { resumeNow(); checkPermission(); restartWatching(); } });
    const off = onGameEvent(e => {
      if (e.kind === 'readyReset') toast(e.reason);
      if (e.kind === 'hostChanged') toast(e.you ? 'You’re now the host' : `${e.alias} is now the host`);
    });
    return () => { sub.remove(); off(); };
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Screens />
        <ErrorToast />
      </View>
    </SafeAreaProvider>
  );
}

function Screens() {
  const { view, synced, token, status, kicked } = useNet();
  const [editingZone, setEditingZone] = useState(false);
  useLocationUplink();
  useRoundAlerts(view, synced);
  // Back button: close the zone editor; never silently exit a live match.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editingZone) { setEditingZone(false); return true; }
      if (view && view.phase !== 'ended' && view.phase !== 'lobby') { toast('Use ⋯ → Leave match to quit'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [editingZone, view?.phase]);

  // cold start mid-round: don't flash Home (looks like the round ended) while the session reconnects
  if (!view && token && !kicked) return <Reconnecting online={status === 'open'} />;
  if (!view) return <Home />;
  if (view.phase === 'lobby') {
    return editingZone && view.you.isHost
      ? <Awake><ZoneEditor zone={view.zone} onDone={() => setEditingZone(false)} /></Awake>
      : <Awake><Lobby view={view} onEditZone={() => setEditingZone(true)} /></Awake>;
  }
  if (view.phase === 'ended') return <Results view={view} />;
  return <LiveGame view={view} />;
}

// Lobby keeps the screen on (short, needs fresh GPS for readiness).
function Awake({ children }: { children: React.ReactNode }) {
  useKeepAwake();
  return <>{children}</>;
}
function LiveGame({ view }: { view: NonNullable<ReturnType<typeof useNet>['view']> }) {
  // Background location + local alerts make a locked phone fine; keeping the screen on is opt-in.
  const [awake, setAwake] = useState(false);
  return <>{awake && <KeepOn />}<Game view={view} keepAwake={awake} onToggleAwake={() => setAwake(a => !a)} /></>;
}
function KeepOn() {
  useKeepAwake();
  return null;
}

function Reconnecting({ online }: { online: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: C.bg }}>
      <EchoRings size={220} />
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>Reconnecting to your match…</Text>
      <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>{online ? 'Restoring your round.' : 'Can’t reach the game server — check you’re on the game Wi-Fi.'}</Text>
      {!online && <ServerMoved />}
      <Button title="Leave match" variant="ghost" color={C.muted} onPress={leaveMatch} />
    </View>
  );
}

function ErrorToast() {
  const { error } = useNet();
  const [hiddenAt, setHiddenAt] = useState(0);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setHiddenAt(error.at), 3000);
    return () => clearTimeout(id);
  }, [error]);
  if (!error || error.at === hiddenAt) return null;
  return (
    <Animated.View key={error.at} entering={FadeIn} exiting={FadeOut} pointerEvents="none"
      style={{ position: 'absolute', top: 110, alignSelf: 'center', zIndex: 10, backgroundColor: C.warn, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, maxWidth: '90%' }}>
      <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>{error.msg}</Text>
    </Animated.View>
  );
}
