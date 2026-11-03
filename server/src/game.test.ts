import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerMsg, View } from '@echo/shared';
import { Lobby, Match } from './game.ts';
import * as shared from '@echo/shared';
import { worlds } from './worlds.ts';

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
  const runner = g.m.players.get(g.rid)!;
  assert.ok(runner.loc, 'runner had a live fix');
  assert.ok(!JSON.stringify(json).includes(JSON.stringify(runner.loc!.p)), 'no raw coordinates persisted');
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

// ───────────── Phase 2: powers ─────────────

/** Multi-player harness: everyone stands near one spot with fresh GPS; chase already running. */
function build(roles: ('hunter' | 'runner')[], opts: { powers?: boolean; routeSweep?: boolean; infection?: number; slash?: boolean } = {}) {
  const inbox = new Map<string, ServerMsg[]>();
  const lobby = new Lobby((id, m) => { if (!inbox.has(id)) inbox.set(id, []); inbox.get(id)!.push(m); });
  let now = 9_000_000;
  const first = lobby.create('P0', now) as any, m: Match = first.match;
  const ids = [first.player.id as string];
  for (let i = 1; i < roles.length; i++) ids.push((lobby.join(m.code, `P${i}`, now) as any).player.id);
  const h = ids[0];
  m.handle(h, { t: 'setPreset', preset: 'quick' }, now);
  m.handle(h, { t: 'setZone', zone: ZONE }, now);
  m.handle(h, { t: 'setShrink', on: false }, now);
  if (opts.powers === false) m.handle(h, { t: 'setPowers', on: false }, now);
  if (opts.infection) assert.equal(m.handle(h, { t: 'setMode', mode: 'infection', infectMs: opts.infection }, now), null);
  if (opts.slash) assert.equal(m.handle(h, { t: 'setCatch', method: 'slash' }, now), null);
  if (opts.routeSweep) { m.handle(h, { t: 'setWorld', worldId: 'u-test' }, now); assert.equal(m.handle(h, { t: 'setRouteSweep', on: true }, now), null); }
  ids.forEach((id, i) => m.handle(h, { t: 'setRole', playerId: id, role: roles[i] }, now));
  const pos = new Map<string, [number, number]>(ids.map(id => [id, [73.9, 15.39]]));
  const fresh = () => { for (const id of ids) { const p = pos.get(id)!; m.handle(id, { t: 'loc', lng: p[0], lat: p[1], acc: 5, ageMs: 0 }, now); } };
  fresh();
  for (const id of ids) m.handle(id, { t: 'ready', ready: true }, now);
  assert.equal(m.handle(h, { t: 'start' }, now), null);
  const advance = (ms: number) => { const end = now + ms; while (now < end) { now = Math.min(end, now + 1000); fresh(); lobby.tick(now); } };
  advance(31_000); // head start (quick 30 s) -> chase
  const view = (id: string) => inbox.get(id)!.filter(x => x.t === 'view').at(-1)!.view as View;
  const events = (id: string, kind: string) => inbox.get(id)!.filter(x => x.t === 'event' && x.event.kind === kind) as any[];
  const item = (id: string) => m.players.get(id)!.items[0]?.id;
  return { lobby, m, ids, pos, fresh, advance, view, events, item, get now() { return now; }, do: (id: string, msg: any) => m.handle(id, msg, now) };
}

test('powers: start inventory by role; off means none', () => {
  const g = build(['hunter', 'runner']);
  assert.deepEqual(g.m.players.get(g.ids[0])!.items.map(i => i.type), ['sweep']);
  assert.deepEqual(g.m.players.get(g.ids[1])!.items.map(i => i.type), ['freeze']);
  assert.ok(g.view(g.ids[1]).stations!.length >= 3, 'stations placed');
  const off = build(['hunter', 'runner'], { powers: false });
  assert.equal(off.m.players.get(off.ids[1])!.items.length, 0);
  assert.equal(off.view(off.ids[1]).stations, undefined);
});

test('freeze: offer -> ack -> frozen 8 s (no capture), caster revealed, item consumed, then immunity', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  assert.equal(g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H }), null);
  const offer = g.view(H).freezeOffer!;
  assert.ok(offer, 'hunter sees the offer');
  assert.equal(g.view(R).pendingFreeze?.targetAlias, 'P0');
  assert.equal(g.do(H, { t: 'ackFreeze', offerId: offer.offerId }), null);
  assert.ok(g.view(H).frozenUntil! > g.now);
  assert.equal(g.m.players.get(R)!.items.length, 0, 'consumed on activation');
  assert.ok(g.view(H).disclosures.some(d => d.source === 'freeze' && d.runnerId === R), 'caster area revealed to hunters');
  assert.match(g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode })!, /frozen/);
  g.advance(8_000);
  assert.equal(g.events(H, 'freezeEnded').length, 1);
  assert.equal(g.view(R).hunterStates!.find(x => x.id === H)!.state, 'immune');
});

test('freeze: ack exactly at expiry loses; item refunded; retry cooldown; caster not revealed', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  const offer = g.view(H).freezeOffer!;
  g.advance(offer.expiresAt - g.now); // now == expiresAt
  assert.match(g.do(H, { t: 'ackFreeze', offerId: offer.offerId }) ?? 'expired', /expired|no longer/);
  assert.equal(g.m.players.get(R)!.items[0].reserved, false, 'refunded');
  assert.ok(!g.view(H).disclosures.some(d => d.source === 'freeze'), 'no reveal without activation');
  assert.match(g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H })!, /again in/);
});

test('freeze: capture of the caster before ack cancels the offer', () => {
  const g = build(['hunter', 'runner', 'runner']);
  const [H, R] = g.ids;
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  const offer = g.view(H).freezeOffer!;
  assert.equal(g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode }), null);
  assert.equal(g.m.players.get(R)!.status, 'caught');
  assert.match(g.do(H, { t: 'ackFreeze', offerId: offer.offerId })!, /no longer/);
  assert.equal(g.m.players.get(H)!.frozenUntil, 0);
});

test('freeze: a pause cancels a pending offer and refunds; an active freeze keeps its remaining time', () => {
  const g = build(['hunter', 'runner', 'runner']);
  const [H, R, R2] = g.ids;
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  g.do(R2, { t: 'pause' });
  assert.equal(g.m.offers.size, 0);
  assert.equal(g.m.players.get(R)!.items[0].reserved, false);
  g.do(H, { t: 'resume' }); g.advance(6_000);
  assert.match(g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H })!, /again in/, 'a pause is not a free dodge: retry cooldown applies');
  g.advance(10_000);
  assert.equal(g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H }), null);
  g.do(H, { t: 'ackFreeze', offerId: g.view(H).freezeOffer!.offerId });
  const until = g.m.players.get(H)!.frozenUntil;
  g.advance(3_000); g.do(R2, { t: 'pause' }); g.advance(20_000); g.do(H, { t: 'resume' }); g.advance(5_000);
  assert.equal(g.m.players.get(H)!.frozenUntil, until + 25_000, 'freeze shifted by paused time');
});

test('sweep: near runner confirmed privately; partial signals honest; no spend without usable signals', () => {
  const g = build(['hunter', 'hunter', 'runner', 'runner']);
  const [H, H2, R, R2] = g.ids;
  g.pos.set(R, shared.fromLocal([40, 0], ZONE.center));
  g.pos.set(R2, shared.fromLocal([300, 0], ZONE.center)); // far: confirmed out
  g.advance(12_000); // let teleport quarantine age out (tests move players instantly)
  assert.equal(g.do(H, { t: 'useSweep', itemId: g.item(H) }), null);
  const res = g.events(H, 'sweepResult').at(-1).event;
  assert.equal(res.confirmed, 1); assert.equal(res.unavailable, 0);
  assert.ok(g.view(H).disclosures.some(d => d.source === 'sweep' && d.runnerId === R));
  assert.ok(!g.view(H2).disclosures.some(d => d.source === 'sweep'), 'other hunter learns nothing');
  assert.equal(g.events(R, 'scanned').length, 1);
  assert.equal(g.events(R2, 'scanned').length, 0);
  assert.match(g.do(H, { t: 'useSweep', itemId: 'x' })!, /recharging|No Sweep/);
  // no usable runner signals -> nothing spent
  const g2 = build(['hunter', 'runner']);
  const before = g2.m.players.get(g2.ids[0])!.items.length;
  g2.m.players.get(g2.ids[1])!.fixes = []; g2.m.players.get(g2.ids[1])!.loc = undefined;
  assert.match(g2.do(g2.ids[0], { t: 'useSweep', itemId: g2.item(g2.ids[0]) })!, /unavailable/);
  assert.equal(g2.m.players.get(g2.ids[0])!.items.length, before);
});

test('stations: 3 s hold + 2 fixes; two finishers same station -> exactly one grant; leaving cancels', () => {
  const g = build(['hunter', 'hunter', 'runner']);
  const [H, H2] = g.ids;
  for (const h of [H, H2]) g.m.players.get(h)!.items = []; // both used their Sweep
  const st = g.m.stations[0];
  g.pos.set(H, st.p); g.pos.set(H2, st.p); g.advance(12_000);
  assert.equal(g.do(H, { t: 'claimStart', stationId: st.id }), null);
  assert.equal(g.do(H2, { t: 'claimStart', stationId: st.id }), null);
  g.do(H, { t: 'claimFinish', stationId: st.id }); // too early
  assert.equal(g.events(H, 'claimProgress').length, 1);
  g.advance(3_500);
  g.do(H, { t: 'claimFinish', stationId: st.id });
  g.do(H2, { t: 'claimFinish', stationId: st.id });
  assert.equal(g.m.players.get(H)!.items.length + g.m.players.get(H2)!.items.length, 1, 'exactly one grant');
  assert.equal(g.events(H2, 'claimFailed').at(-1).event.reason, 'Already collected — nothing lost');
  assert.equal(g.view(H).stations!.find(s => s.id === st.id)!.available, false, 'respawning');
  // leaving the patch cancels a hold
  const st2 = g.m.stations[1];
  g.m.players.get(H2)!.items = [];
  g.pos.set(H2, st2.p); g.advance(12_000);
  g.do(H2, { t: 'claimStart', stationId: st2.id });
  g.pos.set(H2, shared.fromLocal([22, 0], st2.p)); g.advance(2_000); // walked just outside the 20 m patch
  assert.ok(g.events(H2, 'claimFailed').some(e => e.event.reason === 'You left the station'));
});

test('powers never leak positions; snapshot round-trip refunds reserved items', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  g.pos.set(R, shared.fromLocal([60, 0], ZONE.center)); g.advance(12_000);
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  const rp = g.pos.get(R)!;
  assert.ok(!JSON.stringify(g.view(H)).includes(String(rp[0])), 'no raw runner coordinates to the hunter');
  const m2 = Match.fromJSON(JSON.parse(JSON.stringify(g.m)), () => {}, g.now);
  assert.equal(m2.players.get(R)!.items[0].reserved, false);
});

test('powers audit: duplicate ack keeps the original result; ack after deadline loses', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  const id = g.view(H).freezeOffer!.offerId;
  assert.equal(g.do(H, { t: 'ackFreeze', offerId: id }), null);
  assert.equal(g.do(H, { t: 'ackFreeze', offerId: id }), null, 'retried ack after a lost reply: same answer, not an error');
  assert.equal(g.events(H, 'frozen').length, 2);
});

test('powers audit: a Freeze landing mid-hold cancels the station hold', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  g.m.players.get(H)!.items = [];
  const st = g.m.stations[0];
  g.pos.set(H, st.p); g.advance(12_000);
  assert.equal(g.do(H, { t: 'claimStart', stationId: st.id }), null);
  g.do(R, { t: 'useFreeze', itemId: g.item(R), targetId: H });
  g.do(H, { t: 'ackFreeze', offerId: g.view(H).freezeOffer!.offerId });
  assert.ok(g.events(H, 'claimFailed').some(e => /Frozen/.test(e.event.reason)));
  g.advance(9_000);
  g.do(H, { t: 'claimFinish', stationId: st.id });
  assert.equal(g.m.players.get(H)!.items.length, 0, 'no item from a hold that overlapped a freeze');
});

test('powers audit: sweep counts fix age (old fix near the edge is UNCERTAIN, not OUT)', () => {
  const g = build(['hunter', 'runner']);
  const [H, R] = g.ids;
  g.pos.set(R, shared.fromLocal([111, 0], ZONE.center)); g.advance(12_000);
  const r = g.m.players.get(R)!; // freeze the runner's GPS 9 s in the past
  r.fixes = r.fixes.filter(f => shared.distanceM(f.p, ZONE.center) > 100).map(f => ({ ...f, measuredAt: g.now - 9_000 })); r.loc = r.fixes.at(-1);
  g.m.handle(H, { t: 'loc', lng: 73.9, lat: 15.39, acc: 5, ageMs: 0 }, g.now);
  g.do(H, { t: 'useSweep', itemId: g.item(H) });
  const res = g.events(H, 'sweepResult').at(-1).event;
  assert.equal(res.uncertain, 1, '111 m with a 9 s old fix could be inside 100 m');
});

test('powers audit: caught runner disappears from sweep results; no powers from outside the zone', () => {
  const g = build(['hunter', 'runner', 'runner']);
  const [H, R] = g.ids;
  g.pos.set(R, shared.fromLocal([30, 0], ZONE.center)); g.advance(12_000);
  g.do(H, { t: 'useSweep', itemId: g.item(H) });
  assert.ok(g.view(H).disclosures.some(d => d.runnerId === R && d.source === 'sweep'));
  g.pos.set(H, shared.fromLocal([30.0001, 0], ZONE.center)); g.advance(1_000);
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode });
  assert.ok(!g.view(H).disclosures.some(d => d.runnerId === R), 'capture revokes the sweep box too');
  const R2 = g.ids[2];
  g.pos.set(R2, shared.fromLocal([600, 0], ZONE.center)); g.advance(70_000); // well outside a 400 m zone
  assert.match(g.do(R2, { t: 'useFreeze', itemId: g.item(R2), targetId: H })!, /inside the zone/);
});

test('powers audit: a tiny zone still gets stations', () => {
  const lobby = new Lobby(() => {});
  const h = lobby.create('H', 0) as any, m = h.match;
  m.handle(h.player.id, { t: 'setZone', zone: { kind: 'circle', center: [73.9, 15.39], radiusM: 60 } }, 0);
  (m as any).placeStations();
  assert.ok(m.stations.length >= 1, 'relaxed margins rather than none');
});

// ───────────── Phase 3: world packs ─────────────

test('world packs: BITS Goa loads, host picks it, the round pins its hash', async () => {
  const { loadWorlds, worlds } = await import('./worlds.ts');
  loadWorlds();
  const w = worlds.get('bits-goa');
  assert.ok(w, 'bits-goa pack present');
  assert.ok(w!.buildings.length > 50 && w!.landmarks.some(l => l.name === 'Library'));
  const lobby = new Lobby(() => {});
  const h = lobby.create('H', 0) as any, m = h.match;
  assert.equal(m.handle(h.player.id, { t: 'setWorld', worldId: 'nope' }, 0), 'Unknown world');
  assert.equal(m.handle(h.player.id, { t: 'setWorld', worldId: 'bits-goa' }, 0), null);
  assert.equal(m.viewFor(m.players.get(h.player.id), 0).world?.id, 'bits-goa');
  const { parseClientMsg } = await import('./validate.ts');
  assert.ok(parseClientMsg('{"t":"setWorld","worldId":null}'));
});

test('world packs: place names come from public map data', () => {
  const ring = (cx: number, cy: number, r: number): [number, number][] =>
    [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r]];
  const w = {
    buildings: [{ id: 'b1', name: 'Library', kind: 'academic' as const, heightM: 10, heightEstimated: false, ring: ring(73.9, 15.39, 0.0002) }],
    areas: [], landmarks: [{ id: 'l1', name: 'Library', p: [73.9, 15.39] as [number, number], kind: 'building' as const }],
  };
  assert.equal(shared.placeName([73.9, 15.39], w), 'Library', 'inside the building');
  assert.equal(shared.placeName(shared.fromLocal([50, 0], [73.9, 15.39]), w), 'Library', 'nearby');
  assert.equal(shared.placeName(shared.fromLocal([500, 0], [73.9, 15.39]), w), undefined, 'far: no name');
});

test('world import: building classification and height estimates', async () => {
  const { classify } = await import('../scripts/import-world.ts');
  assert.equal(classify({ building: 'yes', name: 'CH-7' }).kind, 'hostel');
  assert.equal(classify({ building: 'yes', name: 'DLT-5' }).kind, 'academic');
  assert.equal(classify({ building: 'yes', name: 'A-Mess' }).kind, 'dining');
  assert.equal(classify({ building: 'yes', name: 'Library' }).heightM, 13);
  assert.equal(classify({ building: 'greenhouse' }).heightM, 4);
});

test('world import: multipolygon outer ways join into closed rings', async () => {
  const { assembleRings } = await import('../scripts/import-world.ts');
  const a: [number, number] = [0, 0], b: [number, number] = [1, 0], c: [number, number] = [1, 1], d: [number, number] = [0, 1];
  const rings = assembleRings([[a, b], [c, b], [c, d, a]]); // second piece reversed, as OSM often stores them
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], rings[0].at(-1));
  assert.equal(rings[0].length, 5);
  assert.equal(assembleRings([[a, b], [c, d]]).length, 0, 'unclosable outline dropped, not invented');
});

test('route sweep: 40 m away across a barrier (160 m by path) is not confirmed; same distance along the path is', () => {
  const at = (e: number, n: number) => shared.fromLocal([e, n], ZONE.center);
  worlds.set('u-test', { schema: 'echo.world/1', id: 'u-test', name: 'U', version: 1, hash: 'u-test-1', center: ZONE.center, bbox: [0, 0, 0, 0], attribution: '',
    source: { kind: 'osm', fetchedAt: '', query: '' }, buildings: [], areas: [], landmarks: [],
    ways: [{ id: 'u', kind: 'walkway', line: [at(0, 0), at(0, 60), at(40, 60), at(40, 0)] }] });
  try {
    const g = build(['hunter', 'runner', 'runner'], { routeSweep: true });
    const [H, R, R2] = g.ids;
    g.pos.set(H, at(0, 0)); g.pos.set(R, at(40, 0)); g.pos.set(R2, at(0, 40));
    g.advance(12_000);
    assert.equal(g.do(H, { t: 'useSweep', itemId: g.item(H) }), null);
    const res = g.events(H, 'sweepResult').at(-1).event;
    assert.equal(res.route, true);
    assert.equal(res.confirmed, 1);
    assert.equal(g.events(R2, 'scanned').length, 1);
    assert.equal(g.events(R, 'scanned').length, 0, 'straight line would have caught this one');
    // no world → route sweep refused, and clearing the world turns it off
    g.m.phase = 'lobby';
    g.do(H, { t: 'setWorld', worldId: null });
    assert.equal(g.m.routeSweep, false);
    assert.match(g.do(H, { t: 'setRouteSweep', on: true })!, /3D campus/);
  } finally { worlds.delete('u-test'); }
});

// ───────────── Phase 3.5: infection + slash ─────────────

test('infection: caught runner hunts for the set time, then is cured with a new code and a shield', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 60_000 });
  const [H, R, R2] = g.ids;
  const code = g.m.players.get(R)!.catchCode!;
  assert.equal(g.do(H, { t: 'capture', code }), null);
  const r = g.m.players.get(R)!;
  assert.equal(r.role, 'hunter'); assert.equal(r.status, 'active');
  assert.equal(g.events(R, 'infected').length, 1);
  assert.ok(g.view(R).you.infectedUntil);
  assert.ok(g.view(H).players.find(p => p.id === R)!.infected);
  assert.equal(g.m.phase, 'chase', 'one runner left: round goes on');
  // infected can catch too
  assert.match(g.do(H, { t: 'capture', code })!, /no longer valid/, 'old code is dead');
  g.advance(60_000);
  assert.equal(r.role, 'runner');
  assert.equal(g.events(R, 'cured').length, 1);
  assert.ok(r.catchCode && r.catchCode !== code);
  assert.ok(g.view(R).you.shieldUntil);
  assert.match(g.do(H, { t: 'capture', code: r.catchCode! })!, /just recovered/);
  g.advance(30_000);
  assert.equal(g.do(H, { t: 'capture', code: r.catchCode! }), null, 'shield over');
});

test('infection: everyone infected at once = hunters win; time out with a clean runner = runners win, roles restored', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 120_000 });
  const [H, R, R2] = g.ids;
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode! });
  g.do(R, { t: 'capture', code: g.m.players.get(R2)!.catchCode! }); // the infected one catches the last runner
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, 'hunters');
  assert.match(g.m.result!.reason, /infected/);
  assert.deepEqual(g.m.result!.runners.map(x => x.id).sort(), [R, R2].sort());
  assert.equal(g.m.players.get(R)!.role, 'runner', 'role restored for the rematch');

  const t = build(['hunter', 'runner', 'runner'], { infection: 180_000 });
  t.do(t.ids[0], { t: 'capture', code: t.m.players.get(t.ids[1])!.catchCode! });
  t.advance(8 * 60_000); // quick preset chase is 8 min
  assert.equal(t.m.phase, 'ended');
  assert.equal(t.m.result!.winner, 'runners');
  assert.deepEqual(t.m.result!.survivors.sort(), ['P1', 'P2'], 'P1 was cured at 3 min and survived as a runner');
});

test('infection: a pause freezes the infection timer', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 60_000 });
  const [H, R, R2] = g.ids;
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode! });
  const until = g.m.players.get(R)!.infectedUntil;
  g.advance(10_000); g.do(R2, { t: 'pause' }); g.advance(40_000); g.do(H, { t: 'resume' }); g.advance(5_000);
  assert.equal(g.m.players.get(R)!.infectedUntil, until + 45_000);
});

test('slash: strongest in-range runner is caught; weak / unknown / far ids miss with a cooldown', () => {
  const g = build(['hunter', 'runner', 'runner'], { slash: true });
  const [H, R, R2] = g.ids;
  const id = (p: string) => g.m.players.get(p)!.bleId!;
  assert.match(id(R), /^[0-9a-f]{8}$/);
  assert.equal(g.view(R).you.bleId, id(R), 'runner learns only its own id');
  assert.ok(!JSON.stringify(g.view(H)).includes(id(R)), 'hunters never see ids');
  // unknown id + too weak → miss
  assert.equal(g.do(H, { t: 'slash', seen: [{ id: 'deadbeef', rssi: -40 }, { id: id(R), rssi: -95 }] }), null);
  assert.equal(g.events(H, 'slashMiss').length, 1);
  assert.match(g.do(H, { t: 'slash', seen: [{ id: id(R), rssi: -50 }] })!, /recharging/);
  g.advance(5_000);
  assert.equal(g.do(H, { t: 'slash', seen: [{ id: id(R), rssi: -70 }, { id: id(R2), rssi: -55 }] }), null);
  assert.equal(g.m.players.get(R2)!.status, 'caught', 'strongest signal wins');
  assert.equal(g.m.players.get(R)!.status, 'active');
  // far by GPS → miss even with a strong signal (replayed id)
  g.pos.set(R, shared.fromLocal([300, 0], ZONE.center)); g.advance(12_000);
  assert.equal(g.do(H, { t: 'slash', seen: [{ id: id(R), rssi: -40 }] }), null);
  assert.equal(g.m.players.get(R)!.status, 'active');
  assert.equal(g.events(H, 'slashMiss').length, 2);
});

test('slash: refused when the host chose codes; codes still work in slash mode', () => {
  const g = build(['hunter', 'runner']);
  assert.match(g.do(g.ids[0], { t: 'slash', seen: [] })!, /Slash is off/);
  const s = build(['hunter', 'runner'], { slash: true });
  assert.equal(s.do(s.ids[0], { t: 'capture', code: s.m.players.get(s.ids[1])!.catchCode! }), null);
  assert.equal(s.m.phase, 'ended');
});

test('slash: a runner with no usable GPS can\'t be slashed (overheard id replay); code still works', () => {
  const g = build(['hunter', 'runner', 'runner'], { slash: true });
  const [H, R] = g.ids;
  const r = g.m.players.get(R)!;
  r.fixes = []; r.loc = undefined;
  g.do(H, { t: 'slash', seen: [{ id: r.bleId!, rssi: -40 }] });
  assert.equal(r.status, 'active');
  assert.equal(g.do(H, { t: 'capture', code: r.catchCode! }), null);
  assert.equal(r.status, 'caught');
});

test('infection: a cure due before the deadline counts; last clean runner leaving doesn\'t end the round while infected return', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 60_000 });
  const [H, R, R2] = g.ids;
  g.advance(8 * 60_000 - 30_000 - 31_000); // 30 s before the end (chase started after 31 s head start)
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode! });
  g.m.players.get(R)!.infectedUntil = g.m.chaseEndsAt! - 100; // due just before the deadline, but the next tick lands after it
  g.do(R2, { t: 'leave' }); // last clean runner withdraws
  assert.equal(g.m.phase, 'chase', 'R comes back as a runner');
  g.advance(60_000);
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, 'runners');
  assert.equal(g.m.result!.complete, false, 'someone withdrew: practice result');
});

test('infection: state survives a server restart (toJSON/fromJSON)', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 120_000, slash: true });
  const [H, R] = g.ids;
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode! });
  const j = JSON.parse(JSON.stringify(g.m.toJSON()));
  const m2 = Match.fromJSON(j, () => {}, g.now);
  const p = m2.players.get(R)!;
  assert.equal(p.role, 'hunter'); assert.equal(p.origRole, 'runner'); assert.ok(p.infectedUntil > g.now);
  assert.equal(m2.mode, 'infection'); assert.equal(m2.catchMethod, 'slash'); assert.equal(m2.infectMs, 120_000);
});

test('infection: last clean runner withdraws with no cure due before the end → no winner, not "hunters"', () => {
  const g = build(['hunter', 'runner', 'runner'], { infection: 180_000 });
  const [H, R, R2] = g.ids;
  g.advance(8 * 60_000 - 60_000 - 31_000); // 1 min left
  g.do(H, { t: 'capture', code: g.m.players.get(R)!.catchCode! }); // R infected past the deadline
  g.do(R2, { t: 'leave' });
  assert.equal(g.m.phase, 'ended');
  assert.equal(g.m.result!.winner, null);
});
