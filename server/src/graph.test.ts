import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromLocal, type LngLat, type WorldPack } from '@echo/shared';
import { STEP_M, candidates, compileGraph, distInterval, routeVerdict } from './graph.ts';

const O: LngLat = [73.88, 15.39];
const at = (e: number, n: number) => fromLocal([e, n], O);
const way = (id: string, ...pts: [number, number][]) => ({ id, kind: 'walkway' as const, line: pts.map(([e, n]) => at(e, n)) });

test('same-edge distance is direct, not via an endpoint (TDD §11.5)', () => {
  const g = compileGraph({ center: O, ways: [way('w', [0, 0], [100, 0])] });
  assert.equal(g.edges.length, 1);
  const { min, max } = distInterval(g, [{ e: 0, s: 20 }], [{ e: 0, s: 25 }]);
  assert.ok(min <= 5 && max <= 5 + STEP_M, `${min}..${max}`);
});

test('40 m apart through a barrier, 160 m by path: radius says in, route says out (TDD §11.5)', () => {
  // U-shaped path: A at (0,0), B at (40,0); only way round is up 60, across 40, down 60
  const g = compileGraph({ center: O, ways: [way('u', [0, 0], [0, 60], [40, 60], [40, 0])] });
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(40, 0), r: 2 }, 100), 'out');
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(0, 40), r: 2 }, 100), 'in');
});

test('ambiguous origin (80 m vs 120 m) is uncertain, not the convenient answer (TDD §11.5)', () => {
  const g = compileGraph({ center: O, ways: [way('l', [0, 0], [200, 0])] });
  // target at 100; origin spread from ~-20..+20 around 0 → 80..120 m
  assert.equal(routeVerdict(g, { p: at(100, 0), r: 2 }, { p: at(0, 0), r: 0 }, 100), 'uncertain');
});

test('junctions split ways; disconnected pieces are unreachable, never "in"', () => {
  const g = compileGraph({ center: O, ways: [way('a', [0, 0], [50, 0], [100, 0]), way('b', [50, 0], [50, 50]), way('c', [500, 0], [520, 0])] });
  assert.equal(g.edges.length, 4); // a split at the shared vertex
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(50, 20), r: 2 }, 100), 'in');
  const { min } = distInterval(g, candidates(g, at(0, 0), 2), candidates(g, at(510, 0), 2));
  assert.equal(min, Infinity);
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(510, 0), r: 2 }, 100), 'uncertain', 'no path known: not "out" either');
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(0, 200), r: 2 }, 100), 'uncertain', 'off the graph');
});

test('route verdict is never "in" for a fix beyond a dead end (audit repro)', () => {
  const g = compileGraph({ center: O, ways: [way('d', [0, 0], [65, 0])] });
  // the graph alone says in; game.ts only accepts "in" when straight-line also says in (here d+e = 130 > 100)
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 20 }, { p: at(90, 0), r: 20 }, 100), 'in');
});

test('some candidates unreachable → uncertain, not "out" (audit repro)', () => {
  const g = compileGraph({ center: O, ways: [way('u', [0, 0], [0, 60], [80, 60], [80, 0]), way('frag', [60, 0], [70, 0])] });
  assert.equal(routeVerdict(g, { p: at(0, 0), r: 2 }, { p: at(72, 3), r: 8 }, 100), 'uncertain');
});

test('BITS Goa pack compiles into a mostly connected graph', () => {
  const w = JSON.parse(readFileSync(new URL('../../worlds/bits-goa/world.json', import.meta.url), 'utf8')) as WorldPack;
  const g = compileGraph(w);
  // largest connected component share of total length
  const comp = new Int32Array(g.nodes).fill(-1); let c = 0;
  for (let s = 0; s < g.nodes; s++) {
    if (comp[s] >= 0) continue;
    const st = [s]; comp[s] = c;
    while (st.length) { const u = st.pop()!; for (const ei of g.adj[u]) { const E = g.edges[ei], v = E.a === u ? E.b : E.a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    c++;
  }
  const len = new Map<number, number>();
  for (const e of g.edges) len.set(comp[e.a], (len.get(comp[e.a]) ?? 0) + e.len);
  const total = [...len.values()].reduce((a, b) => a + b, 0), big = Math.max(...len.values());
  console.log(`  bits-goa graph: ${g.nodes} nodes, ${g.edges.length} edges, ${Math.round(total)} m, ${c} components, largest ${Math.round((100 * big) / total)} %`);
  assert.ok(big / total > 0.7);
});
