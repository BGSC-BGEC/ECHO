// Slash (Phase 3.5): runners advertise their server-issued BLE id; a hunter scans briefly and sends what it heard.
import { useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import { SLASH } from '@echo/shared';
import EchoBle, { type BleState } from '../modules/echo-ble';
import { send, toast } from './net';
import { requestLocation } from './location';

let asked = false; // Android reports a dismissed first dialog as never_ask_again too: only go to Settings on a repeat tap

const state = (): BleState => { try { return EchoBle.state(); } catch { return 'unsupported'; } };

/** Live Bluetooth state; re-read when the app comes back (user flipped Bluetooth in quick settings). */
export function useBle(): [BleState, () => Promise<void>] {
  const [s, setS] = useState<BleState>(state);
  useEffect(() => {
    const sub = AppState.addEventListener('change', a => { if (a === 'active') setS(state()); });
    const id = setInterval(() => setS(state()), 3000);
    return () => { sub.remove(); clearInterval(id); };
  }, []);
  const ask = async () => {
    if (state() === 'location') await requestLocation(); // scans need precise location (same permission as GPS)
    else if (Platform.OS === 'android' && Platform.Version >= 31) {
      const r = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE]);
      if (asked && Object.values(r).includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) Linking.openSettings(); // Android won't ask again
      asked = true;
    }
    setS(state());
  };
  return [s, ask];
}

/** Can this phone broadcast at all? (Some can scan but not advertise: those runners are caught by code only.) */
export const canAdvertise = () => { try { return EchoBle.canAdvertise(); } catch { return false; } };

/**
 * While `id` is set, this phone advertises it. Native side remembers the id and re-advertises by itself when
 * Bluetooth comes back on (JS timers don't run with the phone locked); re-running here on state changes is harmless.
 */
export function useBeacon(id: string | undefined) {
  const [ble] = useBle();
  useEffect(() => {
    if (!id || ble === 'unsupported') return;
    // ponytail: start/stop promises ignored on purpose — failures surface as the toast below or the Bluetooth banner
    EchoBle.startAdvertising(id).catch(e => { if (ble === 'on') toast(`Bluetooth: ${e?.message ?? 'couldn’t start'} — hunters must use your catch code`); });
    return () => { EchoBle.stopAdvertising().catch(() => {}); };
  }, [id, ble]);
}

/** Scan, then let the server decide. Resolves once the request is sent. */
export async function slashNow() {
  const seen = await EchoBle.scan(SLASH.scanMs);
  send({ t: 'slash', seen: seen.sort((a, b) => b.rssi - a.rssi).slice(0, SLASH.maxSeen) });
}
