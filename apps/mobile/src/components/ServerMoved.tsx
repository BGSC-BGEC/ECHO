import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { setServerUrl } from '../net';
import { normalizeServer } from '../screens/Home';
import { Button } from './ui';
import { C } from '../theme';

/** The game server's IP changed (DHCP / reboot): point at the new one without losing your place. */
export function ServerMoved() {
  const [ip, setIp] = useState('');
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>Host’s server got a new address? Type it here:</Text>
      <TextInput value={ip} onChangeText={setIp} placeholder="e.g. 10.30.5.7" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="url"
        style={{ backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, fontSize: 17, paddingHorizontal: 14, minHeight: 50 }} />
      <Button title="Reconnect to new address" variant="ghost" disabled={!ip.trim()} onPress={() => setServerUrl(normalizeServer(ip))} />
    </View>
  );
}

