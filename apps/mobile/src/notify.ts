// Local notifications so a pocketed phone still buzzes for the moments that matter.
// No push server: everything is scheduled on-device from the authoritative timeline in the view.
// Payloads never contain coordinates (BP §15.3).
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SHRINK, type View } from '@echo/shared';
import { serverNow } from './net';

const CHANNEL = 'game';
let chain: Promise<void> = Promise.resolve();

Notifications.setNotificationHandler({
  // In the foreground the app shows its own flashes + haptics; banners only when backgrounded.
  handleNotification: async () => {
    const bg = AppState.currentState !== 'active';
    return { shouldShowBanner: bg, shouldShowList: bg, shouldPlaySound: bg, shouldSetBadge: false };
  },
});

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    /* eslint-disable import/namespace -- enums are re-exported via `export *`, which the rule can't follow */
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Round alerts', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 150, 400], lightColor: '#18B6C4', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
    /* eslint-enable import/namespace */
  }
}

export type AlertPerm = { granted: boolean; canAskAgain: boolean };
export const getAlertPermission = async (): Promise<AlertPerm> => {
  const p = await Notifications.getPermissionsAsync().catch(() => null);
  return { granted: !!p?.granted, canAskAgain: p?.canAskAgain ?? true };
};
/** Asked from the Lobby with context, never cold at launch. */
export async function requestAlerts(): Promise<AlertPerm> {
  const cur = await getAlertPermission();
  if (cur.granted) return cur;
  if (!cur.canAskAgain) { Linking.openSettings().catch(() => {}); return cur; }
  await Notifications.requestPermissionsAsync().catch(() => {});
  return getAlertPermission();
}
/** BP §04.2 alert test: lock the phone and see if it buzzes. */
export function testBuzz() {
  Notifications.scheduleNotificationAsync({
    content: { title: 'ECHO alert test', body: 'If you felt this with the screen locked, you’re good to play.', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 6, channelId: CHANNEL },
  }).catch(() => {});
}
export const cancelAlerts = () => Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});

/** Schedule the whole remaining round timeline, so a locked phone with a dead socket still gets every alert. */
export function useRoundAlerts(view: View | undefined, synced: boolean) {
  const live = !!view && (view.phase === 'headstart' || view.phase === 'chase') && view.you.status === 'active' && !view.paused;
  const key = live ? `${view!.phase}|${view!.headStartEndsAt}|${view!.chaseStartedAt}|${view!.chaseEndsAt}|${view!.you.role}|${synced}|${(view!.shrinkAt ?? []).join(',')}` : 'off';

  useEffect(() => {
    let cancelled = false;
    // serialise runs: an older run's in-flight schedule can't land after a newer run's cancel
    chain = chain.then(async () => {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      if (!live || cancelled) return;
      const v = view!;
      const offset = serverNow() - Date.now(); // server deadlines -> device clock
      const hunter = v.you.role === 'hunter';
      const chaseStart = v.chaseStartedAt ?? v.headStartEndsAt!;
      const chaseEnd = v.chaseEndsAt ?? chaseStart + v.preset.chaseMs;
      const plan: { t: number; title: string; body: string }[] = [];
      if (v.phase === 'headstart') plan.push({ t: chaseStart, title: 'HUNT ON', body: hunter ? 'You are released. Go.' : 'Hunters are released. Stay hidden.' });
      const I = v.preset.pulseIntervalMs;
      for (let k = 1; k * I < v.preset.chaseMs; k++) { // every pulse (TDD M03), not just the next one
        const t = chaseStart + k * I;
        if (!hunter) plan.push({ t: t - 10_000, title: 'Reveal in 10 s', body: 'Hunters will see your rough area. Move now.' });
        plan.push({ t, title: 'Pulse', body: hunter ? 'New runner signals — open ECHO.' : 'Hunters just got a signal update. Keep moving.' });
      }
      for (const t of v.shrinkAt ?? []) {
        plan.push({ t: t - Math.min(SHRINK.announceMs, 0.15 * v.preset.chaseMs), title: 'Zone shrinking soon', body: 'Open ECHO to see the new zone (dashed ring).' });
        if (!hunter) plan.push({ t: t + SHRINK.graceMs / 2, title: 'Zone shrank', body: `Get inside the new zone — in ${SHRINK.graceMs / 2000} s hunters can see anyone outside.` });
      }
      plan.push({ t: chaseEnd - 60_000, title: '1 minute left', body: hunter ? 'Last chance to catch them.' : 'Survive one more minute.' });
      for (const p of plan) {
        if (cancelled) return; // superseded by a newer timeline
        const when = p.t - offset;
        if (when - Date.now() < 1000) continue;
        await Notifications.scheduleNotificationAsync({
          content: { title: p.title, body: p.body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
        }).catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [key]);
}

/** Immediate local alert (e.g. the round started while this phone was locked). */
export function notifyNow(title: string, body: string) {
  Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: { channelId: CHANNEL } }).catch(() => {});
}

/** Notification permission, re-checked whenever the app comes back to the foreground. */
export function useAlertPermission() {
  const [perm, setPerm] = useState<AlertPerm & { known?: boolean }>({ granted: false, canAskAgain: true, known: false });
  useEffect(() => {
    const check = () => { getAlertPermission().then(p => setPerm({ ...p, known: true })); };
    check();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') check(); });
    return () => sub.remove();
  }, []);
  return [perm, () => { requestAlerts().then(p => setPerm({ ...p, known: true })); }] as const;
}
