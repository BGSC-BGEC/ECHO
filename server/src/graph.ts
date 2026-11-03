// Phase 4 route graph (TDD §11): compiled from a world pack's ways. Positions live on edges ({edge, s}), not snapped to nodes.
import { toLocal, type LngLat, type WorldPack } from '@echo/shared';

export interface Edge { id: string; a: number; b: number; len: number; pts: [number, number][]; cum: number[] }
export interface Graph { origin: LngLat; nodes: number; edges: Edge[]; adj: number[][] } // adj: node -> edge indices
export interface Pos { e: number; s: number }

/** Sample spacing along edges. Every distance result is inflated by this (graph distance is 1-Lipschitz along an edge). */
export const STEP_M = 4;
/** Slack for "on the path": OSM centrelines are offset from where people walk, paths have width. */
export const OFF_PATH_M = 8;

const cache = new Map<string, Graph>();
export function graphFor(w: WorldPack): Graph {
  let g = cache.get(w.hash);
  if (!g) cache.set(w.hash, g = compileGraph(w));
  return g;
}

/** Split every way at its ends and at vertices shared with another way (OSM junction nodes share coordinates). */
export function compileGraph(w: Pick<WorldPack, 'center' | 'ways'>): Graph {
  const key = (p: LngLat) => `${p[0]},${p[1]}`;
  const uses = new Map<string, number>();
  for (const way of w.ways) for (const k of new Set(way.line.map(key))) uses.set(k, (uses.get(k) ?? 0) + 1);
  const nodeId = new Map<string, number>();
  const node = (p: LngLat) => { const k = key(p); let i = nodeId.get(k); if (i === undefined) nodeId.set(k, i = nodeId.size); return i; };
  const edges: Edge[] = [];
  for (const way of w.ways) {
    let start = 0, n = 0;
    for (let i = 1; i < way.line.length; i++) {
      if (i < way.line.length - 1 && (uses.get(key(way.line[i])) ?? 0) < 2) continue;
      const seg = way.line.slice(start, i + 1);
      const pts = seg.map(p => toLocal(p, w.center));
      const cum = [0];
      for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      if (cum.at(-1)! > 0) edges.push({ id: `${way.id}#${n++}`, a: node(seg[0]), b: node(seg.at(-1)!), len: cum.at(-1)!, pts, cum });
      start = i;
    }
  }
  const adj: number[][] = Array.from({ length: nodeId.size }, () => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  return { origin: w.center, nodes: nodeId.size, edges, adj };
}

function pointAt(e: Edge, s: number): [number, number] {
  let j = 1;
  while (j < e.cum.length - 1 && e.cum[j] < s) j++;
  const t = (s - e.cum[j - 1]) / (e.cum[j] - e.cum[j - 1] || 1);
  return [e.pts[j - 1][0] + (e.pts[j][0] - e.pts[j - 1][0]) * t, e.pts[j - 1][1] + (e.pts[j][1] - e.pts[j - 1][1]) * t];
}

/**
 * Every graph position the player could be at: edge samples within r of the fix (+ half a step, so no true position
 * is more than STEP_M/2 along the edge from a sample). Empty = off the graph → callers must say "uncertain", never guess.
 * ponytail: brute force over all edges, fine for a campus (~200 edges); add a grid index if worlds get big.
 */
export function candidates(g: Graph, p: LngLat, r: number): Pos[] {
  const [x, y] = toLocal(p, g.origin), lim = r + OFF_PATH_M + STEP_M / 2;
  const out: Pos[] = [];
  g.edges.forEach((e, i) => {
    const n = Math.ceil(e.len / STEP_M);
    for (let k = 0; k <= n; k++) {
      const s = Math.min(e.len, k * STEP_M), q = pointAt(e, s);
      if (Math.hypot(q[0] - x, q[1] - y) <= lim) out.push({ e: i, s });
    }
  });
  return out;
}

/** Dijkstra from a set of positions → distance to every node. ponytail: O(V²) array scan, fine below ~2k nodes. */
function nodeDist(g: Graph, from: Pos[]): Float64Array {
  const d = new Float64Array(g.nodes).fill(Infinity), done = new Uint8Array(g.nodes);
  for (const { e, s } of from) { const E = g.edges[e]; d[E.a] = Math.min(d[E.a], s); d[E.b] = Math.min(d[E.b], E.len - s); }
  for (;;) {
    let u = -1;
    for (let i = 0; i < g.nodes; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) return d;
    done[u] = 1;
    for (const ei of g.adj[u]) { const E = g.edges[ei], v = E.a === u ? E.b : E.a; if (d[u] + E.len < d[v]) d[v] = d[u] + E.len; }
  }
}

/** Shortest legal distance from `from` (with its node distances D) to t, incl. the same-edge direct case (TDD §11.5). */
function distTo(g: Graph, D: Float64Array, from: Pos[], t: Pos): number {
  const E = g.edges[t.e];
  let best = Math.min(D[E.a] + t.s, D[E.b] + E.len - t.s);
  for (const f of from) if (f.e === t.e) best = Math.min(best, Math.abs(f.s - t.s));
  return best;
}

/** TDD M24: legal-path distance interval between two candidate sets (sampled, inflated by STEP_M both ways). */
export function distInterval(g: Graph, H: Pos[], R: Pos[]): { min: number; max: number } {
  return routeSweeper(g, H)(R);
}

/**
 * Precompute the hunter side once per Sweep (one Dijkstra per hunter sample), then each runner is just lookups.
 * ponytail: |H| Dijkstras per Sweep, ~100 samples × O(V²) on a campus graph; cap H if worlds get much bigger.
 */
function routeSweeper(g: Graph, H: Pos[]) {
  const all = H.length ? nodeDist(g, H) : undefined;
  const per = H.map(h => nodeDist(g, [h]));
  return (R: Pos[]): { min: number; max: number } => {
    if (!H.length || !R.length) return { min: 0, max: Infinity };
    const min = Math.max(0, Math.min(...R.map(r => distTo(g, all!, H, r))) - STEP_M);
    let max = 0;
    for (let i = 0; i < H.length && max < Infinity; i++) for (const r of R) max = Math.max(max, distTo(g, per[i], [H[i]], r));
    return { min, max: max + STEP_M };
  };
}

/**
 * Graph Sweep verdicts for one hunter against many runners: in only if every plausible pair is within budget,
 * out only if every pair is known and over budget. Off-graph or any unreachable pair (missing OSM link,
 * separate fragment) → uncertain: we don't know, so never "out" and never "in".
 */
export function routeJudge(g: Graph, h: { p: LngLat; r: number }, budget: number) {
  const H = candidates(g, h.p, h.r), sweep = routeSweeper(g, H);
  return (t: { p: LngLat; r: number }): 'in' | 'out' | 'uncertain' => {
    const R = candidates(g, t.p, t.r);
    if (!H.length || !R.length) return 'uncertain';
    const { min, max } = sweep(R);
    if (max === Infinity) return 'uncertain';
    return max <= budget ? 'in' : min > budget ? 'out' : 'uncertain';
  };
}

export const routeVerdict = (g: Graph, h: { p: LngLat; r: number }, t: { p: LngLat; r: number }, budget: number) => routeJudge(g, h, budget)(t);
