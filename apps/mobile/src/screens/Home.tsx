import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { CODE_LENGTH } from '@echo/shared';
import { clearKicked, send, setServerUrl, useNet } from '../net';
import { Button, Card, EchoRings, Pill, styles as u } from '../components/ui';
import { C, S } from '../theme';

/** "10.30.5.3" or "10.30.5.3:9000" -> ws://10.30.5.3:8787/ws ; full ws(s):// URLs pass through. */
export const normalizeServer = (raw: string) => {
  const v = raw.trim().replace(/^https?:\/\//i, ''); // people paste the /health URL
  if (/^wss?:\/\//i.test(v)) return v;
  const [host, port] = v.replace(/\/.*$/, '').split(':');
  return `ws://${host}:${port || '8787'}/ws`;
};

const CODE_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g; // matches server alphabet (no I/O/0/1)

export function Home() {
  const net = useNet();
  const insets = useSafeAreaInsets();
  const [alias, setAlias] = useState('');
  const [code, setCode] = useState('');
  const [showServer, setShowServer] = useState(!net.serverUrl);
  const [url, setUrl] = useState(net.serverUrl);
  const [busyAt, setBusyAt] = useState(0);
  const [triedAt, setTriedAt] = useState(0);
  const online = net.status === 'open';
  const nameOk = alias.trim().length > 0;

  useEffect(() => { SecureStore.getItemAsync('alias').then(a => a && setAlias(a)).catch(() => {}); }, []);
  // Busy until the server answers (error or view) or 6 s pass.
  const busy = busyAt > 0 && (net.error?.at ?? 0) < busyAt && !net.view;
  useEffect(() => { if (busyAt) { const id = setTimeout(() => setBusyAt(0), 6000); return () => clearTimeout(id); } }, [busyAt]);

  const go = (msg: Parameters<typeof send>[0]) => {
    clearKicked();
    SecureStore.setItemAsync('alias', alias.trim()).catch(() => {});
    if (send(msg)) { const t = Date.now(); setBusyAt(t); setTriedAt(t); }
  };

  return (
    <LinearGradient colors={[C.ink, C.bg]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.wrap, { paddingTop: insets.top + S.lg, paddingBottom: insets.bottom + S.lg }]}>
          <View style={st.topRow}>
            <Pill dot label={online ? 'SERVER ONLINE' : net.status === 'connecting' ? 'CONNECTING…' : 'OFFLINE'} color={online ? C.ok : C.warn} />
            <Pressable onPress={() => { setUrl(net.serverUrl); setShowServer(s => !s); }} hitSlop={12} accessibilityRole="button">
              <Pill icon="cog-outline" label="SERVER" color={C.muted} />
            </Pressable>
          </View>

          {showServer && (
            <Card style={{ gap: S.sm }}>
              <Text style={u.label}>Server address</Text>
              <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="10.30.5.3" style={st.input} placeholderTextColor={C.muted} />
              <Text style={u.muted}>Type the IP the host’s server shows, e.g. 10.30.5.3 (same Wi-Fi). Full addresses like wss://domain/ws work too.</Text>
              <Button title="Save & reconnect" variant="ghost" onPress={() => { if (setServerUrl(normalizeServer(url))) setShowServer(false); }} />
            </Card>
          )}

          <View style={st.hero}>
            <EchoRings size={240} />
            <View style={[StyleSheet.absoluteFill, st.wordWrap]} pointerEvents="none">
              <Text style={st.word} maxFontSizeMultiplier={1}>ECHO</Text>
              <Text style={st.tag} maxFontSizeMultiplier={1.2}>REAL-WORLD MANHUNT</Text>
            </View>
          </View>

          {!!net.kicked && <Text style={[u.muted, { textAlign: 'center' }]}>{net.kicked}</Text>}
          {!net.serverUrl && <Text style={[u.muted, { textAlign: 'center', color: C.amber }]}>Set the game server address to play (ask your host).</Text>}
          {!!net.serverUrl && !online && net.status !== 'connecting' && (
            <Text style={[u.muted, { textAlign: 'center', color: C.warn }]}>Can’t reach the game server. Check your connection, or the server address.</Text>
          )}

          <Card style={{ gap: S.md }}>
            <Text style={u.label}>Your alias</Text>
            <TextInput value={alias} onChangeText={setAlias} maxLength={16} placeholder="e.g. Ghost" placeholderTextColor={C.muted}
              style={st.input} returnKeyType="done" autoCorrect={false} />
            <Button big icon="radar" title="HOST A HUNT" busy={busy} disabled={!online || !nameOk} onPress={() => go({ t: 'create', alias: alias.trim() })} />
            <View style={st.or}><View style={st.line} /><Text style={u.label}>or join</Text><View style={st.line} /></View>
            <View style={st.joinRow}>
              <TextInput value={code} onChangeText={t => setCode(t.toUpperCase().replace(CODE_CHARS, ''))} maxLength={CODE_LENGTH}
                autoCapitalize="characters" autoCorrect={false} placeholder="CODE" placeholderTextColor={C.muted}
                style={[st.input, st.codeInput]} returnKeyType="go"
                onSubmitEditing={() => code.length === CODE_LENGTH && nameOk && online && go({ t: 'join', code, alias: alias.trim() })} />
              <Button icon="login" title="JOIN" variant="ghost" style={{ flex: 1 }} busy={busy} disabled={!online || !nameOk || code.length < CODE_LENGTH}
                onPress={() => go({ t: 'join', code, alias: alias.trim() })} />
            </View>
            {!nameOk && <Text style={u.muted}>Pick an alias first — friends see it, never your real name.</Text>}
            {!!net.error && net.error.at > triedAt && triedAt > 0 && !net.view && (
              <Text style={[u.body, { color: C.warn }]}>{net.error.msg}</Text> // stays put, unlike the toast
            )}
          </Card>

          <Text style={[u.muted, { textAlign: 'center' }]}>Private groups · approximate signals · stay inside the zone</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: S.xl, gap: S.lg, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  wordWrap: { alignItems: 'center', justifyContent: 'center' },
  word: { color: C.text, fontSize: 64, fontWeight: '900', letterSpacing: 14, textShadowColor: C.cyan, textShadowRadius: 24 },
  tag: { color: C.cyan, fontSize: 12, fontWeight: '800', letterSpacing: 4, marginTop: 4 },
  input: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, fontSize: 17, paddingHorizontal: 14, minHeight: 52 },
  joinRow: { flexDirection: 'row', gap: S.sm },
  codeInput: { flex: 1.4, letterSpacing: 5, fontWeight: '800', textAlign: 'center' },
  or: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  line: { flex: 1, height: 1, backgroundColor: C.border },
});
