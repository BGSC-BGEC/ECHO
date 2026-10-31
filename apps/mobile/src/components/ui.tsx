import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { C, R, S } from '../theme';

export function Button({ title, onPress, color = C.cyan, variant = 'solid', disabled, busy, style, big, hint, onLongPress, icon }: {
  title: string; onPress: () => void; color?: string; variant?: 'solid' | 'ghost'; disabled?: boolean; busy?: boolean; style?: ViewStyle; big?: boolean;
  hint?: string; onLongPress?: () => void; icon?: IconName;
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!(disabled || busy) }}
      onLongPress={onLongPress}
      disabled={disabled || busy}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.btn, big && { minHeight: 64 },
        { backgroundColor: solid ? color : 'transparent', borderColor: color, opacity: disabled ? 0.35 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={solid ? C.bg : color} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <MaterialCommunityIcons name={icon} size={big ? 22 : 18} color={solid ? C.bg : color} />}
          <Text maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit style={[styles.btnText, big && { fontSize: 19 }, { color: solid ? C.bg : color }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Pill({ label, color = C.muted, dot, icon }: { label: string; color?: string; dot?: boolean; icon?: IconName }) {
  return (
    <View accessible accessibilityLabel={label} style={[styles.pill, { borderColor: color + '88', backgroundColor: C.bg + 'E6' }]}>
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      {icon && <MaterialCommunityIcons name={icon} size={15} color={color} />}
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Role glyph: runner circle, hunter diamond (BP §12.2 — shape, not just colour). */
export function RoleGlyph({ role, size = 14 }: { role: 'hunter' | 'runner'; size?: number }) {
  return role === 'hunter'
    ? <View accessibilityLabel="hunter" style={{ width: size * 0.8, height: size * 0.8, backgroundColor: C.hunter, transform: [{ rotate: '45deg' }], borderRadius: 2 }} />
    : <View accessibilityLabel="runner" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: C.runner }} />;
}

/** Expanding "echo" rings for hero / pulse moments. */
export function EchoRings({ size = 220, color = C.cyan, count = 3, duration = 2400 }: { size?: number; color?: string; count?: number; duration?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size, borderWidth: 2, borderColor: color + '88' }} /></View>;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => <Ring key={i} size={size} color={color} delay={(i * duration) / count} duration={duration} />)}
      <View style={{ width: size * 0.08, height: size * 0.08, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

function Ring({ size, color, delay, duration }: { size: number; color: string; delay: number; duration: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false));
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: 0.1 + t.value * 0.9 }], opacity: 1 - t.value }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color }, st]} />;
}

export const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: R.control, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.lg },
  btnText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  card: { backgroundColor: C.panel, borderRadius: R.card, borderWidth: 1, borderColor: C.border, padding: S.lg },
  h1: { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  h2: { color: C.text, fontSize: 18, fontWeight: '800' },
  body: { color: C.text, fontSize: 16 },
  muted: { color: C.muted, fontSize: 14, lineHeight: 19 },
  label: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
});
