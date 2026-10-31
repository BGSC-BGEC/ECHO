import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerMsg, View } from '@echo/shared';
import { Lobby, Match } from './game.ts';
import * as shared from '@echo/shared';

const ZONE = { kind: 'circle' as const, center: [73.9, 15.39] as [number, number], radiusM: 400 };
const RUNNER_POS = { lng: 73.90123, lat: 15.39177 };

function setup(preset: 'test' | 'classic' = 'test') {
  const inbox = new Map<string, ServerMsg[]>();
  const lobby = new Lobby((id, m) => { if (!inbox.has(id)) inbox.set(id, []); inbox.get(id)!.push(m); });
  let now = 1_000_000;
  const h = lobby.create('Mira', now) as any;
  const m = h.match;
  const r = lobby.join(m.code, 'Dev', now) as any;
  const hid = h.player.id, rid = r.player.id;
  const lastView = (id: string) => inbox.get(id)!.filter(x => x.t === 'view').at(-1)!.view as View;
  const ok = (id: string, msg: any) => assert.equal(m.handle(id, msg, now), null);
  ok(hid, { t: 'setPreset', preset });
  ok(hid, { t: 'setZone', zone: ZONE });
  ok(hid, { t: 'loc', lng: 73.9, lat: 15.39, acc: 8, ageMs: 0 });
  ok(rid, { t: 'loc', ...RUNNER_POS, acc: 8, ageMs: 0 });
  ok(hid, { t: 'ready', ready: true });
  ok(rid, { t: 'ready', ready: true });
  ok(hid, { t: 'start' });
  // both players stand together with fresh GPS (captures need plausible proximity)
  const near = () => { ok(hid, { t: 'loc', lng: RUNNER_POS.lng + 0.00005, lat: RUNNER_POS.lat, acc: 5, ageMs: 0 }); ok(rid, { t: 'loc', ...RUNNER_POS, acc: 5, ageMs: 0 }); };
  return { lobby, m, hid, rid, inbox, lastView, ok, near, advance: (ms: number) => { now += ms; lobby.tick(now); }, get now() { return now; } };
}

test('full round: head start -> pulse -> capture -> hunters win', () => {
  const g = setup();
  assert.equal(g.m.phase, 'headstart');
  const runnerCode = g.lastView(g.rid).you.catchCode!;
  assert.match(runnerCode, /^\d{4}$/);
  assert.equal(g.lastView(g.hid).you.catchCode, undefined);

  g.advance(10_000);
  assert.equal(g.m.phase, 'chase');
  g.advance(29_000);
  g.ok(g.rid, { t: 'loc', ...RUNNER_POS, acc: 8, ageMs: 0 });
  g.advance(1_000); // first pulse at chase 30 s
  const hv = g.lastView(g.hid);
  assert.equal(hv.disclosures.length, 1);
  assert.equal(hv.disclosures[0].unavailable, false);
  assert.equal(g.lastView(g.rid).disclosures.length, 0, 'runner never sees disclosures');
  assert.ok(g.lastView(g.rid).lastRevealedAt);

  // privacy: hunter payload never contains the runner's raw coordinates
  const hunterPayload = JSON.stringify(g.inbox.get(g.hid));
  assert.ok(!hunterPayload.includes(String(RUNNER_POS.lng)) && !hunterPayload.includes(String(RUNNER_POS.lat)));

  g.near();
  g.ok(g.hid, { t: 'capture', code: runnerCode === '0000' ? '1111' : '0000' }); // wrong -> catchFailed event
  assert.ok(g.inbox.get(g.hid)!.some(x => x.t === 'event' && x.event.kind === 'catchFailed'));
  g.ok(g.hid, { t: 'capture', code: runnerCode });
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, 'hunters');
  assert.equal(g.m.result!.complete, true);
});

test('stale runner fix gives "signal unavailable", not an old dot', () => {
  const g = setup();
  g.advance(10_000);
  g.advance(30_000); // runner fix is now 40 s old
  const d = g.lastView(g.hid).disclosures[0];
  assert.equal(d.unavailable, true);
  assert.equal(d.cell, undefined);
});

test('classic: 11 pulses, none at deadline, runners win on time', () => {
  const g = setup('classic');
  g.advance(60_000);
  let pulses = 0;
  for (let t = 0; t < 1_080; t++) {
    g.ok(g.rid, { t: 'loc', ...RUNNER_POS, acc: 8, ageMs: 0 });
    const before = g.inbox.get(g.hid)!.length;
    g.advance(1_000);
    pulses += g.inbox.get(g.hid)!.slice(before).filter(x => x.t === 'event' && x.event.kind === 'pulse').length;
  }
  assert.equal(pulses, 11);
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, 'runners');
});

test('withdrawal makes round incomplete; captures blocked in head start', () => {
  const g = setup();
  assert.equal(g.m.handle(g.hid, { t: 'capture', code: '0000' }, g.now), 'Captures open after the head start');
  g.ok(g.rid, { t: 'leave' });
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, null);
  assert.equal(g.m.result!.complete, false);
});

test('rematch swaps roles and returns to lobby', () => {
  const g = setup();
  g.advance(10_000);
  g.near();
  g.ok(g.hid, { t: 'capture', code: g.lastView(g.rid).you.catchCode });
  g.ok(g.hid, { t: 'rematch' });
  assert.equal(g.m.phase, 'lobby');
  assert.equal(g.m.players.get(g.hid).role, 'runner');
  assert.equal(g.m.players.get(g.rid).role, 'hunter');
});



test('3 wrong codes -> 30 s capture cooldown', () => {
  const g = setup();
  g.advance(10_000);
  const real = g.lastView(g.rid).you.catchCode!;
  const wrong = real === '9999' ? '9998' : '9999';
  g.near();
  for (let i = 0; i < 3; i++) g.ok(g.hid, { t: 'capture', code: wrong });
  assert.match(g.m.handle(g.hid, { t: 'capture', code: real }, g.now)!, /wait/);
  g.advance(30_001);
  g.near();
  g.ok(g.hid, { t: 'capture', code: real });
  assert.equal(g.m.phase, 'ended');
});

test('malicious preset name rejected; ready requires being inside zone', async () => {
  const { parseClientMsg } = await import('./validate.ts');
  assert.equal(parseClientMsg('{"t":"setPreset","preset":"constructor"}'), null);
  const inbox: any[] = [];
  const lobby = new Lobby(() => {});
  const h = lobby.create('A', 0) as any;
  h.match.handle(h.player.id, { t: 'setZone', zone: { kind: 'circle', center: [73.9, 15.39], radiusM: 100 } }, 0);
  h.match.handle(h.player.id, { t: 'loc', lng: 74.0, lat: 15.39, acc: 5, ageMs: 0 }, 0);
  assert.match(h.match.handle(h.player.id, { t: 'ready', ready: true }, 0), /inside the play zone/);
});

test('host disconnect in lobby passes host to a connected player', () => {
  const g = setup();
  g.ok(g.hid, { t: 'endRound' });
  assert.equal(g.m.phase, 'ended');
  g.m.setConnected(g.hid, false, g.now);
  assert.equal(g.m.hostId, g.rid);
});

test('safety pause freezes clocks; host resume restores remaining time after countdown', () => {
  const g = setup();
  g.advance(10_000); // chase starts
  const endsBefore = g.m.chaseEndsAt!;
  g.ok(g.rid, { t: 'pause' });
  assert.equal(g.m.paused?.reason, 'safety');
  assert.equal(g.m.handle(g.hid, { t: 'capture', code: g.lastView(g.rid).you.catchCode }, g.now), 'Game is paused');
  g.advance(60_000); // long pause: no pulses, no expiry
  assert.ok(!g.inbox.get(g.hid)!.some(x => x.t === 'event' && x.event.kind === 'pulse'));
  assert.equal(g.m.handle(g.rid, { t: 'resume' }, g.now), 'Only the host can resume');
  g.ok(g.hid, { t: 'resume' });
  g.advance(5_000); // countdown
  assert.equal(g.m.paused, undefined);
  assert.equal(g.m.chaseEndsAt! - endsBefore, 65_000, 'deadline shifted by paused duration incl. countdown');
});

test('lost contact for 30 s triggers a technical pause; host can resume past it', () => {
  const g = setup();
  g.advance(10_000);
  g.m.setConnected(g.rid, false, g.now);
  g.advance(31_000);
  assert.equal(g.m.paused, undefined, 'start-of-round grace: phones still switching to background sharing');
  g.advance(31_000);
  assert.equal(g.m.paused?.reason, 'technical');
  assert.equal(g.m.paused?.by, 'Dev');
  g.ok(g.hid, { t: 'resume' });
  g.advance(6_000);
  assert.equal(g.m.paused, undefined, 'acknowledged lost player does not immediately re-pause');
});

test('pulse uses the sharpest recent fix, not just the latest', () => {
  const g = setup();
  g.advance(10_000);
  g.advance(26_000);
  g.ok(g.rid, { t: 'loc', lng: 73.90123, lat: 15.39177, acc: 5, ageMs: 0 });  // sharp
  g.advance(2_000);
  g.ok(g.rid, { t: 'loc', lng: 73.9030, lat: 15.3930, acc: 45, ageMs: 0 });   // blurry, 2 s newer
  g.advance(2_000);
  const d = g.lastView(g.hid).disclosures[0];
  const lng = (d.cell![0][0] + d.cell![2][0]) / 2;
  assert.ok(Math.abs(lng - 73.90123) < 0.0004, 'cell built from the 5 m fix');
});

test('snapshot round-trip restores a live match into a recovery pause, without raw locations', () => {
  const g = setup();
  g.advance(10_000);
  const json = JSON.parse(JSON.stringify(g.m));
  assert.ok(!JSON.stringify(json).includes('73.90123'), 'no raw coordinates persisted');
  const m2 = Match.fromJSON(json, () => {}, g.now + 5_000);
  assert.equal(m2.paused?.reason, 'recovery');
  assert.equal(m2.players.get(g.rid)!.catchCode, g.m.players.get(g.rid)!.catchCode);
  assert.equal(m2.players.get(g.rid)!.connected, false);
});

test('sqlite store persists and restores matches', async () => {
  const { openStore } = await import('./store.ts');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = mkdtempSync(tmpdir() + '/echo-') + '/t.db';
  const l1 = new Lobby(() => {});
  const s1 = openStore(path, l1, () => {});
  const r = l1.create('Host', Date.now()) as any;
  s1.close();
  const l2 = new Lobby(() => {});
  const s2 = openStore(path, l2, () => {});
  assert.equal(s2.restored, 1);
  assert.ok(l2.find(r.token), 'tokens restored so phones can reconnect');
  const { readFileSync } = await import('node:fs');
  assert.ok(!readFileSync(path).includes(r.token), 'raw token never on disk');
  s2.close();
});

test('pause during resume countdown cancels it and keeps the original freeze', () => {
  const g = setup();
  g.advance(10_000);
  const ends = g.m.chaseEndsAt!;
  g.ok(g.rid, { t: 'pause' });
  const since = g.m.paused!.since;
  g.advance(20_000);
  g.ok(g.hid, { t: 'resume' });
  g.advance(2_000);
  g.ok(g.rid, { t: 'pause' }); // someone yells stop during the countdown
  assert.equal(g.m.paused!.since, since);
  assert.equal(g.m.paused!.resumeAt, undefined);
  g.ok(g.hid, { t: 'resume' });
  g.advance(5_000);
  assert.equal(g.m.chaseEndsAt! - ends, g.now - since - 0, 'entire frozen span shifted');
});

test('host locking phone mid-round keeps host; really lost host hands over; owner gets it back', () => {
  const g = setup();
  g.advance(10_000);
  g.m.setConnected(g.hid, false, g.now);
  assert.equal(g.m.hostId, g.hid, 'a locked phone is normal during a round');
  g.advance(61_000); // grace + 30 s with no contact at all
  assert.equal(g.m.hostId, g.rid);
  assert.equal(g.m.paused?.reason, 'technical', 'last hunter gone -> pause');
  g.m.setConnected(g.hid, true, g.now);
  assert.equal(g.m.hostId, g.rid, 'mid-round, host is not yanked from a healthy stand-in');
  assert.ok(g.m.paused?.resumeAt, 'lost player back -> auto-resume countdown');
  g.ok(g.rid, { t: 'endRound' });
  assert.equal(g.m.hostId, g.hid, 'organiser gets host back when the round ends');
});

test('one of several runners unreachable does not freeze everyone until 90 s', () => {
  const lobby = new Lobby(() => {});
  let now = 5_000_000;
  const h = lobby.create('H', now) as any, m = h.match;
  const a = lobby.join(m.code, 'A', now) as any, b = lobby.join(m.code, 'B', now) as any;
  m.handle(h.player.id, { t: 'setPreset', preset: 'classic' }, now);
  m.handle(h.player.id, { t: 'setZone', zone: ZONE }, now);
  for (const p of [h, a, b]) { m.handle(p.player.id, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 0 }, now); m.handle(p.player.id, { t: 'ready', ready: true }, now); }
  m.handle(h.player.id, { t: 'start' }, now);
  const step = (ms: number) => { now += ms; lobby.tick(now); for (const p of [h, b]) m.handle(p.player.id, { t: 'ping' as any }, now); };
  m.setConnected(a.player.id, false, now);
  for (let i = 0; i < 9; i++) step(10_000); // 90 s incl. 30 s grace -> A silent ~60 s
  assert.equal(m.paused, undefined, 'B still running: no global freeze for one quiet runner');
  for (let i = 0; i < 4; i++) step(10_000);
  assert.equal(m.paused?.reason, 'technical');
  assert.equal(m.paused?.by, 'A');
});

test('host can continue without an unreachable player', () => {
  const g = setup();
  g.advance(10_000);
  g.m.setConnected(g.rid, false, g.now);
  g.advance(61_000);
  assert.equal(g.m.paused?.reason, 'technical');
  g.ok(g.hid, { t: 'dropPlayer', playerId: g.rid });
  assert.equal(g.m.phase, 'ended', 'only runner dropped -> round incomplete');
  assert.equal(g.m.result!.complete, false);
});

test('same device fix arriving via WS and HTTP counts once', () => {
  const g = setup();
  g.advance(10_000);
  const p = g.m.players.get(g.rid)!;
  const before = p.fixes.length;
  g.ok(g.rid, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 100, ts: 123456 });
  g.ok(g.rid, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 900, ts: 123456 });
  assert.equal(p.fixes.length, before + 1);
});

test('wire: every client message type survives the real parser', async () => {
  const { parseClientMsg } = await import('./validate.ts');
  for (const raw of ['{"t":"pause"}', '{"t":"resume"}', '{"t":"endRound"}', '{"t":"start"}', '{"t":"leave"}', '{"t":"rematch"}',
    '{"t":"capture","code":"0123"}', '{"t":"kick","playerId":"x"}', '{"t":"dropPlayer","playerId":"x"}', '{"t":"ready","ready":true,"alerts":true}',
    '{"t":"setContact","contact":"Meet at the library steps"}', '{"t":"setPreset","preset":"quick"}', '{"t":"shuffleRoles","hunters":2}',
    '{"t":"setRole","playerId":"x","role":"hunter"}', '{"t":"loc","lng":73.9,"lat":15.39,"acc":5,"ageMs":0,"ts":1}', '{"t":"ping","c0":1}',
    '{"t":"hello","token":"abc"}', '{"t":"create","alias":"A"}', '{"t":"join","code":"ABCDEF","alias":"A"}',
    '{"t":"setZone","zone":{"kind":"circle","center":[73.9,15.39],"radiusM":200}}', '{"t":"setShrink","on":false}']) {
    assert.ok(parseClientMsg(raw), raw);
  }
  assert.equal(parseClientMsg('{"t":"capture","code":"12345"}'), null);
});

test('remote brute force: correct code from 300 m away counts as a wrong guess', () => {
  const g = setup();
  g.advance(10_000);
  g.ok(g.hid, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 0 });
  g.ok(g.rid, { t: 'loc', lng: 73.9028, lat: 15.39, acc: 5, ageMs: 0 }); // ~300 m east
  g.ok(g.hid, { t: 'capture', code: g.lastView(g.rid).you.catchCode });
  assert.equal(g.m.players.get(g.rid)!.status, 'active');
  assert.ok(g.inbox.get(g.hid)!.some(x => x.t === 'event' && x.event.kind === 'catchFailed'));
});

test('deadline beats a lost-player pause; pause does not reset the wrong-code lockout', () => {
  const g = setup();
  g.advance(10_000);
  g.near();
  const wrong = g.lastView(g.rid).you.catchCode === '9999' ? '9998' : '9999';
  g.ok(g.hid, { t: 'capture', code: wrong }); g.ok(g.hid, { t: 'capture', code: wrong });
  g.ok(g.rid, { t: 'pause' }); g.ok(g.hid, { t: 'resume' }); g.advance(5_000);
  g.near();
  g.ok(g.hid, { t: 'capture', code: wrong });
  assert.ok(g.m.players.get(g.hid)!.lockedUntil > g.now, 'third miss after a pause still locks');
  g.m.setConnected(g.rid, false, g.now);
  g.advance(200_000); // past chase end (180 s test preset) while runner silent
  assert.equal(g.m.phase, 'ended');
});

test('server restart marks the round degraded (never a clean competitive result)', () => {
  const g = setup();
  g.advance(10_000);
  const m2 = Match.fromJSON(JSON.parse(JSON.stringify(g.m)), () => {}, g.now);
  assert.equal(m2.degraded, true);
});

test('shrinking zone: nested circles inside the host zone, announced, then applied', async () => {
  const { distanceM, inZone } = await import('@echo/shared');
  const g = setup();
  const st = g.m.stages;
  assert.equal(st.length, 3);
  let prev = { center: ZONE.center, radiusM: ZONE.radiusM };
  for (const s of st) {
    assert.ok(inZone(s.circle.center, ZONE), 'centre on real playable ground');
    assert.ok(distanceM(prev.center, s.circle.center) + s.circle.radiusM <= prev.radiusM + 0.01, 'nested inside previous');
    prev = s.circle;
  }
  g.advance(10_000); // chase starts
  const first = st[0].at;
  while (g.now < first - 20_000) { g.near(); g.advance(1_000); }
  assert.ok(g.lastView(g.hid).zoneNext, 'next circle announced before it applies');
  assert.equal(g.lastView(g.hid).zoneNow, undefined);
  while (g.now < first) { g.near(); g.advance(1_000); }
  assert.deepEqual(g.lastView(g.rid).zoneNow, st[0].circle);
});

test('shrinking zone: runner outside is exposed only after the grace period', () => {
  const g = setup();
  g.advance(10_000);
  const s0 = g.m.stages[0];
  // park the runner far outside the first circle but inside the host zone if possible
  const away = shared.fromLocal([s0.circle.radiusM + 40, 0], s0.circle.center); // 40 m beyond the first circle's edge
  const outside = () => g.ok(g.rid, { t: 'loc', lng: away[0], lat: away[1], acc: 5, ageMs: 0 });
  while (g.now < s0.at) { outside(); g.advance(1_000); }
  const exposedEvents = () => g.inbox.get(g.rid)!.filter(x => x.t === 'event' && x.event.kind === 'exposed').length;
  const before = exposedEvents();
  for (let i = 0; i < 15; i++) { outside(); g.advance(1_000); }
  assert.equal(exposedEvents(), before, 'grace period: no exposure yet');
  for (let i = 0; i < 10; i++) { outside(); g.advance(1_000); }
  assert.ok(exposedEvents() > before, 'exposed after grace');
  assert.ok(g.lastView(g.hid).disclosures.some(d => d.exposed));
  assert.ok(!JSON.stringify(g.lastView(g.hid)).includes(String(away[0])), 'still only a coarse cell, never the raw point');
});

test('shrinking zone: pause shifts the schedule; host can turn it off', () => {
  const g = setup();
  g.advance(10_000);
  const at = g.m.stages[0].at;
  g.ok(g.rid, { t: 'pause' }); g.advance(20_000); g.ok(g.hid, { t: 'resume' }); g.advance(5_000);
  assert.equal(g.m.stages[0].at, at + 25_000);
  const lobby = new Lobby(() => {});
  const h = lobby.create('H', 0) as any;
  assert.equal(h.match.handle(h.player.id, { t: 'setShrink', on: false }, 0), null);
  assert.equal(h.match.shrinkOn, false);
});

test('shrinking zone on an L-shaped polygon: every circle is mostly playable ground', () => {
  const o: [number, number] = [73.9, 15.39];
  const P = (e: number, n: number) => shared.fromLocal([e, n], o);
  const L = { kind: 'polygon' as const, ring: [P(0, 0), P(400, 0), P(400, 120), P(120, 120), P(120, 400), P(0, 400)] };
  for (let trial = 0; trial < 20; trial++) {
    const lobby = new Lobby(() => {});
    const h = lobby.create('H', 0) as any, m = h.match;
    m.handle(h.player.id, { t: 'setZone', zone: L }, 0);
    (m as any).planShrink(0);
    for (const st of m.stages) {
      assert.ok(shared.inZone(st.circle.center, L), 'centre inside the L');
      // thin arms (120 m) can't hold a 156 m circle; planner must still pick a well-placed one (playable = zone ∩ circle)
      assert.ok(shared.rimInZone(st.circle, L) >= 0.35, 'circle placed over the playable arms, not the empty notch');
    }
  }
});

test('exposure gives GPS error the benefit of the doubt', () => {
  const c = { center: [73.9, 15.39] as [number, number], radiusM: 100 };
  const edge = shared.fromLocal([130, 0], c.center); // 30 m outside the circle
  assert.equal(shared.clearlyOutside(edge, 45, ZONE, c), false, '±45 m could be inside: not exposed');
  assert.equal(shared.clearlyOutside(edge, 10, ZONE, c), true);
});

test('a flaky player triggers at most one technical pause per round', () => {
  const g = setup();
  g.advance(10_000);
  g.m.setConnected(g.rid, false, g.now);
  g.advance(61_000);
  assert.equal(g.m.paused?.reason, 'technical');
  g.m.setConnected(g.rid, true, g.now); // back -> auto-resume
  g.advance(6_000);
  assert.equal(g.m.paused, undefined);
  g.m.setConnected(g.rid, false, g.now); // drops again
  g.advance(100_000);
  assert.ok(g.m.paused === undefined || g.m.phase === 'ended', 'no second pause storm for the same player');
});

test('lobby: losing GPS clears READY and tells the player why', () => {
  const lobby = new Lobby(() => {});
  const inbox: any[] = [];
  const l2 = new Lobby((_id, m) => inbox.push(m));
  const h = l2.create('H', 0) as any, m = h.match;
  m.handle(h.player.id, { t: 'setZone', zone: ZONE }, 0);
  m.handle(h.player.id, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 0 }, 0);
  m.handle(h.player.id, { t: 'ready', ready: true }, 0);
  l2.tick(20_000); // phone locked, no fix for 20 s
  assert.equal(m.players.get(h.player.id).ready, false);
  assert.ok(inbox.some(x => x.t === 'event' && x.event.kind === 'readyReset'));
  void lobby;
});

test('pause does not resurrect a pulse box that had already expired', () => {
  const g = setup();
  g.advance(10_000);
  g.advance(29_000); g.near(); g.advance(1_000); // pulse at chase 30 s, expires 90 s later
  assert.equal(g.lastView(g.hid).disclosures.length, 1);
  g.advance(95_000); // expired (and a later pulse may exist) — check the first one's fate via expiresAt
  const before = [...g.m.disclosures.values()].map(d => d.expiresAt);
  g.ok(g.rid, { t: 'pause' }); const since = g.m.paused!.since;
  g.advance(60_000); g.ok(g.hid, { t: 'resume' }); g.advance(5_000);
  for (const [i, d] of [...g.m.disclosures.values()].entries()) {
    if (before[i] <= since) assert.equal(d.expiresAt, before[i], 'expired before the pause: not shifted');
  }
});
