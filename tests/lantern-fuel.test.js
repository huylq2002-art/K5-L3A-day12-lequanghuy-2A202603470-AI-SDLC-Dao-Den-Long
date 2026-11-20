import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame, makeSnapshot, stepGame } from '../src/core/game.js';
import { MAX_FUEL_UNITS, nearestServiceLantern, providesSafety } from '../src/core/lanterns.js';
import { distanceXZ } from '../src/core/math.js';

const quiet = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false };
const game = (scenario, night = 1) => createGame(23, { ...quiet, ...scenario }, night);
const play = (state, ticks) => Array.from({ length: ticks }, () => stepGame(state)).flat();
const names = events => events.map(event => event.name);

test('natural fuel loses exactly one integer unit per active tick and extinguishes at zero', () => {
  const state = game({ lanterns: [{ id: 'L1', lit: true }] });
  const [lamp] = state.lanterns;
  assert.equal(lamp.fuelUnits, MAX_FUEL_UNITS);
  stepGame(state);
  assert.equal(lamp.fuelUnits, 5999);
  assert.equal(makeSnapshot(state).lanterns[0].fuel, 100);
  assert.deepEqual(names(stepGame(state, { pause: true })), ['paused']);
  play(state, 60);
  assert.equal(lamp.fuelUnits, 5999);
  assert.deepEqual(names(stepGame(state, { pause: true })), ['resumed']);
  assert.deepEqual(play(state, 5997), []);
  assert.equal(lamp.fuelUnits, 1);
  assert.equal(lamp.lit, true);
  assert.deepEqual(names(stepGame(state)), ['lantern_out']);
  assert.deepEqual(makeSnapshot(state).lanterns[0], { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0, fuel: 0, ever_lit: true, relit_count: 0 });
  assert.deepEqual(stepGame(state), []);
});

test('refuel filters full lamps, breaks distance ties by ID, clamps overflow and awards 5 per used mote', () => {
  const state = game({ player: { carried: 4 }, lanterns: [
    { id: 'L1', pos: [0, 0, 0], lit: true },
    { id: 'L2', pos: [1, 0, 0], lit: true, fuel: 80.2 },
    { id: 'L3', pos: [-1, 0, 0] },
  ] });
  assert.equal(nearestServiceLantern(state).id, 'L2');
  // L1 becomes eligible on the same tick because natural decay precedes E.
  assert.deepEqual(stepGame(state, { interact: true })[0].data, { lantern_id: 'L1', amount: 1, fuel: 100 });
  state.player.pos = [2, 0, 0];
  assert.deepEqual(stepGame(state, { interact: true })[0].data, { lantern_id: 'L2', amount: 2, fuel: 100 });
  assert.equal(state.player.carried, 1);
  assert.equal(state.score, 15);
  assert.equal(state.player.successfulLights, 0);
  state.player.carried = 0;
  assert.deepEqual(stepGame(state, { interact: true }), []);
});

test('outage precedes E, removes old deposit and lets a previously lit lamp relight in installments for 5', () => {
  const state = game({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 1 / 60, deposited: 10 }] });
  assert.deepEqual(stepGame(state, { interact: true }).map(({ name, data }) => ({ name, data })), [
    { name: 'lantern_out', data: { lantern_id: 'L1' } },
    { name: 'deposit', data: { lantern_id: 'L1', amount: 2, deposited: 2 } },
  ]);
  assert.equal(makeSnapshot(state).player.capacity, 10);
  state.player.carried = 5;
  const next = stepGame(state, { interact: true });
  assert.deepEqual(next.map(({ name, data }) => ({ name, data })), [
    { name: 'deposit', data: { lantern_id: 'L1', amount: 3, deposited: 5 } },
    { name: 'lantern_lit', data: { lantern_id: 'L1', relight: true } },
  ]);
  const snap = makeSnapshot(state);
  assert.equal(snap.lanterns[0].fuel, 100);
  assert.equal(snap.lanterns[0].relit_count, 1);
  assert.equal(snap.player.capacity, 12);
  assert.equal(snap.player.carried, 2);
  assert.equal(snap.score, 65);
});

test('the exact 30 threshold keeps protection and an ejection completes after a borderline refuel', () => {
  const state = game({ player: { carried: 1 }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 + 1 / 60 }], shades: [{ pos: [0.5, 0, 0] }] });
  assert.equal(providesSafety(state.lanterns[0]), false);
  assert.deepEqual(stepGame(state, { interact: true }).map(event => event.data), [{ lantern_id: 'L1', amount: 1, fuel: 30 }]);
  assert.equal(providesSafety(state.lanterns[0]), true);
  assert.equal(state.shades[0].escape.remaining, 29);
  stepGame(state);
  assert.equal(providesSafety(state.lanterns[0]), false);
  assert.equal(makeSnapshot(state).lanterns[0].fuel, 30);
  assert.deepEqual(play(state, 28), []);
  assert.ok(distanceXZ(state.shades[0].pos, state.lanterns[0].pos) > 6);
  assert.equal(state.player.flames, 3);
  const unprotected = game({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 30 }], shades: [{ pos: [0.5, 0, 0] }] });
  assert.ok(providesSafety(unprotected.lanterns[0]));
  assert.deepEqual(names(stepGame(unprotected)), ['player_hit']);
});

test('wander chooses the nearest weak lamp ahead of dark lamps, while chase keeps targeting Mây', () => {
  const lanterns = [{ id: 'L1', pos: [2, 0, 0], lit: true, fuel: 29 }, { id: 'L2', pos: [-2, 0, 0], lit: true, fuel: 20 }, { id: 'L3', pos: [0, 0, 0.1] }];
  const state = game({ player: { pos: [-20, 0, 0] }, lanterns, shades: [{ pos: [0, 0, 0], state: 'wander' }] });
  stepGame(state);
  assert.equal(state.shades[0].state, 'drain');
  assert.equal(state.shades[0].targetLanternId, 'L1');
  assert.equal(state.lanterns[0].fuelUnits, 1739);
  stepGame(state);
  assert.equal(state.lanterns[0].fuelUnits, 1733);
  const chase = game({ player: { pos: [-8, 0, 0] }, lanterns, shades: [{ pos: [0, 0, 0], state: 'chase' }] });
  stepGame(chase);
  assert.equal(chase.shades[0].state, 'chase');
  assert.ok(chase.shades[0].pos[0] < 0);
  const arriving = game({ player: { pos: [0, 0, 0] }, lanterns, shades: [{ pos: [0, 0, 0], state: 'wander' }] });
  assert.deepEqual(stepGame(arriving), []);
  assert.equal(arriving.shades[0].state, 'drain');
  stepGame(arriving);
  assert.equal(arriving.shades[0].state, 'recoil');
  const fallback = game({ player: { pos: [-20, 0, 0] }, lanterns: [{ id: 'L1', pos: [2, 0, 0] }], shades: [{ pos: [0, 0, 0], state: 'wander' }] });
  stepGame(fallback);
  assert.ok(fallback.shades[0].pos[0] > 0);
});

test('concurrent drainers stand still, stack exactly and report after every 60 draining ticks', () => {
  const state = game({ player: { pos: [0, 0, -12] }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 29 }],
    shades: [{ id: 'S2', pos: [2, 0, 0], state: 'drain', target_lantern_id: 'L1' }, { id: 'S1', pos: [1, 0, 0], state: 'drain', target_lantern_id: 'L1' }],
  });
  assert.deepEqual(play(state, 59), []);
  assert.equal(state.lanterns[0].fuelUnits, 1091);
  const reports = [1, 2].map(number => ({ lantern_id: 'L1', shade_id: `S${number}`, fuel: 18 }));
  assert.deepEqual(stepGame(state).map(event => event.data), reports);
  assert.deepEqual(state.shades.map(shade => shade.pos), [[1, 0, 0], [2, 0, 0]]);
  assert.deepEqual(play(state, 59), []);
  assert.deepEqual(stepGame(state).map(event => event.data), reports.map(report => ({ ...report, fuel: 7 })));
  assert.deepEqual(names(play(state, 39)), ['lantern_out']);
  assert.ok(state.shades.every(shade => shade.state === 'wander'));
});

test('drain exits at a player distance of exactly 6 m or when the lamp is out of reach', () => {
  const lanterns = [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }];
  const close = game({ player: { pos: [-6, 0, 0] }, lanterns, shades: [{ pos: [0, 0, 0], state: 'drain', target_lantern_id: 'L1' }] });
  stepGame(close);
  assert.equal(close.shades[0].state, 'chase');
  assert.equal(close.lanterns[0].fuelUnits, 1194);
  stepGame(close);
  assert.equal(close.lanterns[0].fuelUnits, 1193);
  const far = game({ player: { pos: [-20, 0, 0] }, lanterns, shades: [{ pos: [2.001, 0, 0], state: 'drain', target_lantern_id: 'L1' }] });
  stepGame(far);
  assert.equal(far.shades[0].state, 'wander');
  assert.equal(far.lanterns[0].fuelUnits, 1199);
});

test('Pulse earns 15 for a previously draining shade even when a same-tick refuel interrupts it', () => {
  const state = game({ player: { carried: 11, successful_lights: 1 }, lanterns: [{ id: 'L1', pos: [1, 0, 0], lit: true, fuel: 29 }], shades: [
    { id: 'S1', pos: [1, 0.8, 0], state: 'drain', target_lantern_id: 'L1' }, { id: 'S2', pos: [0, 0.8, 1] },
  ] });
  const events = stepGame(state, { interact: true, pulse: true });
  assert.deepEqual(names(events), ['refuel', 'pulse']);
  assert.deepEqual(events[0].data, { lantern_id: 'L1', amount: 8, fuel: 100 });
  assert.deepEqual(events[1].data, { stunned_ids: ['S1', 'S2'] });
  assert.equal(state.score, 60);
  assert.ok(state.shades.every(shade => shade.state === 'stunned'));
  play(state, 120);
  assert.ok(state.shades.every(shade => shade.state === 'wander'));
});

test('capacity grows for each player light, ignores scenario lights and caps at 20', () => {
  const ids = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
  const state = game({ lanterns: [...ids.map((id, index) => ({ id, pos: [index * 5, 0, 0] })), { id: 'L7', lit: true }] }, 3);
  assert.equal(makeSnapshot(state).player.capacity, 10);
  ids.forEach((id, i) => {
    state.player.pos = [...state.lanterns[i].pos];
    if (i === 0) state.player.pos[1] = 6;
    state.player.carried = 10;
    assert.deepEqual(names(stepGame(state, { interact: true })), ['deposit', 'lantern_lit']);
    assert.equal(makeSnapshot(state).player.capacity, Math.min(20, 12 + 2 * i));
  });
  assert.equal(state.state, 'playing');
  const stocked = game({ player: { carried: 19, successful_lights: 6 }, motes: [[0, 0, 0], [0, 0, 0]] });
  assert.deepEqual(names(stepGame(stocked)), ['mote_picked']);
  assert.equal(stocked.player.carried, 20);
});
