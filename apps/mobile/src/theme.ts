// BP §12.2 tokens, adapted to a dark field-console look.
export const C = {
  bg: '#07111B',
  ink: '#10263A',
  panel: '#0F2233',
  panelSolid: '#0B1A28',
  panelHi: '#16304A',
  border: '#24415A',
  text: '#EAF2F4',
  muted: '#B5C4CD', // readable in sunlight (BP §12.5)
  runner: '#18B6C4',
  runnerDeep: '#087E8B',
  hunter: '#F07A2E',
  hunterDeep: '#B85012',
  cyan: '#67DCE5',
  amber: '#FFC857',
  warn: '#E5534B',
  ok: '#4CD38A',
  unknown: '#182736',
};

export const roleColor = (r: 'hunter' | 'runner') => (r === 'hunter' ? C.hunter : C.runner);

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { control: 12, card: 18 };

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Compass-style bearing label from a to b. */
export const bearingLabel = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  const deg = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg + 360) % 360) / 45) % 8];
};
export const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s ago` : `${Math.floor(ms / 60_000)}m ago`);
