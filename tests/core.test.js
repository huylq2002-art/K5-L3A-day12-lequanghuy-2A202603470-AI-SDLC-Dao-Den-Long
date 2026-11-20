import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LANTERN_LAYOUT, TUNING as T } from '../src/core/config.ts';
import { createGame, makeSnapshot, stepGame } from '../src/core/game.js';
import { distanceXZ, rotateMove } from '../src/core/math.js';

const empty = { random_motes: false, random_shades: false };
const near = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);

function play(state, count, input) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(...stepGame(state, input));
  return events;
}

test('contract metadata and every tuning constant match the runtime', () => {
  const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(contract.version, '1.0');
  assert.equal(contract.team, '2A202603470-lequanghuy');
  assert.deepEqual(contract.tuning, T);
  assert.equal(T.tick_hz, 60);
  assert.deepEqual(LANTERN_LAYOUT.map(lantern => lantern.id), ['L1', 'L2', 'L3', 'L4', 'L5']);
});

test('camera rotation, analog magnitude and normalized diagonal follow the contract', () => {
  assert.deepEqual(rotateMove(0, 1, 0), [0, 1]);
  const [x, z] = rotateMove(0, 1, 90);
  near(x, 1);
  near(z, 0);
  const [left, back] = rotateMove(1, 0, -90);
  near(left, 0);
  near(back, 1);
  const angled = rotateMove(1, 1, 45);
  near(angled[0], 1);
  near(angled[1], 0);
  near(Math.hypot(...rotateMove(0.3, 0.4, 31)), 0.5);
  near(Math.hypot(...rotateMove(Number.MAX_VALUE, Number.MAX_VALUE, 0)), 1);
  const state = createGame(1, empty);
  play(state, 60, { z: 1, cam_yaw_deg: 90 });
  near(state.player.pos[0], T.move_speed_mps);
  near(state.player.pos[2], 0);
  assert.equal(state.tick, 60);
  assert.equal(state.timeLeft, T.night1_duration_s - 1);
});

test('grounded jump and round island boundary are simulated in the core', () => {
  const state = createGame(1, { ...empty, player: { pos: [T.island_radius - 0.02, 0, 0] } });
  stepGame(state, { x: 1, jump: true });
  assert.ok(state.player.pos[1] > 0);
  near(distanceXZ(state.player.pos, [0, 0, 0]), T.island_radius);
  play(state, 70, { x: 1 });
  assert.equal(state.player.pos[1], 0);
  near(distanceXZ(state.player.pos, [0, 0, 0]), T.island_radius);
});

test('XZ pickup and nearest unlit lantern are inclusive, with partial and final deposits', () => {
  const state = createGame(7, {
    ...empty,
    player: { carried: 1 },
    motes: [[T.pickup_radius, 99, 0], [-1.8, 0, 0]],
    lanterns: [{ id: 'L1', pos: [T.interact_radius, 50, 0], deposited: 2 }, { id: 'L2', pos: [0, 0, 3] }],
    shades: [{ id: 'custom', pos: [7, 0, 0] }],
  });
  assert.equal(makeSnapshot(state).score, 0);
  const partial = stepGame(state, { interact: true });
  assert.deepEqual(partial.map(({ tick, name, data }) => [tick, name, data]), [
    [1, 'mote_picked', { carried: 2 }], [1, 'deposit', { lantern_id: 'L1', amount: 2, deposited: 4 }],
  ]);
  assert.equal(state.lanterns[0].lit, false);
  play(state, 4, { x: -1 });
  play(state, 3, { x: 1 });
  const final = stepGame(state, { x: 1, interact: true });
  assert.deepEqual(final.map(event => event.name), ['deposit', 'lantern_lit']);
  assert.equal(state.lanterns[0].lit, true);
  assert.equal(state.score, 2 * T.score_mote + T.score_lantern);
  assert.ok(distanceXZ(state.shades[0].pos, state.lanterns[0].pos) > T.safe_radius);
});

test('shades avoid lit zones at the boundary and find a route around them', () => {
  const lanterns = [{ id: 'L1', pos: [0, 0, 0], lit: true }];
  const protectedPlayer = createGame(1, {
    ...empty, lanterns, player: { pos: [T.safe_radius, 0, 0] }, shades: [{ pos: [7, 8, 0] }],
  });
  for (let i = 0; i < 200; i++) {
    assert.deepEqual(stepGame(protectedPlayer), []);
    assert.ok(distanceXZ(protectedPlayer.shades[0].pos, lanterns[0].pos) > T.safe_radius);
  }
  assert.ok(distanceXZ(makeSnapshot(protectedPlayer).shades[0].pos, lanterns[0].pos) > T.safe_radius);
  assert.equal(protectedPlayer.score, 0);

  const exposed = createGame(1, {
    ...empty, lanterns, player: { pos: [8, 0, 0] }, shades: [{ pos: [-8, 0, 0] }],
  });
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) {
    hit = stepGame(exposed).some(event => event.name === 'player_hit');
    assert.ok(distanceXZ(exposed.shades[0].pos, lanterns[0].pos) > T.safe_radius);
  }
  assert.equal(hit, true);
});

test('a hit uses XZ, drops floor(carried × ratio) motes and starts invulnerability', () => {
  const state = createGame(31, {
    ...empty, player: { carried: 5 }, shades: [{ pos: [T.shade_hit_radius, 9, 0] }, { pos: [0, 0, 0] }],
  });
  assert.deepEqual(stepGame(state), [{ type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } }]);
  assert.equal(state.player.carried, 3);
  assert.equal(state.motes.length, 2);
  assert.deepEqual(play(state, T.invuln_s * 60 - 1), []);
  assert.equal(stepGame(state)[0].data.flames, 1);
});

test('Pulse pushes an in-range shade, stuns through its last tick and enforces cooldown', () => {
  const state = createGame(1, {
    ...empty, player: { carried: 4 }, shades: [{ id: 'in', pos: [T.pulse_radius, 9, 0] }, { id: 'out', pos: [20, 0, 0] }],
  });
  assert.deepEqual(stepGame(state, { pulse: true }), [{ type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['in'] } }]);
  assert.equal(state.player.carried, 2);
  near(state.shades[0].pos[0], T.pulse_radius + T.pulse_push_m);
  assert.equal(state.shades[0].state, 'stunned');
  assert.equal(state.shades[1].state, 'chase');
  assert.equal(stepGame(state, { pulse: true }).some(event => event.name === 'pulse'), false);
  play(state, T.pulse_stun_s * 60 - 2);
  assert.equal(state.shades[0].state, 'stunned');
  stepGame(state);
  assert.equal(state.shades[0].state, 'chase');
  play(state, T.pulse_cooldown_s * 60 - state.tick);
  assert.equal(stepGame(state, { pulse: true }).some(event => event.name === 'pulse'), true);
  assert.equal(state.player.carried, 0);
});

test('Pulse cannot push a shade through an expanded light zone', () => {
  const state = createGame(1, {
    ...empty, player: { pos: [-8, 0, 0], carried: T.pulse_cost },
    shades: [{ pos: [-6, 0, 0] }], lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
  });
  assert.equal(stepGame(state, { pulse: true })[0].name, 'pulse');
  const x = state.shades[0].pos[0];
  assert.ok(x < -T.safe_radius && x > -T.safe_radius - 0.003);
});

test('win on all five lanterns, lose to last hit and lose at dawn', () => {
  const win = createGame(1, {
    ...empty, player: { carried: 5 * T.lantern_cost },
    lanterns: LANTERN_LAYOUT.map(({ id }) => ({ id, pos: [0, 0, 0] })),
  });
  const winLog = play(win, 10, { interact: true });
  assert.equal(win.tick, 5);
  assert.equal(win.score, 5 * T.score_lantern + T.score_win);
  assert.equal(winLog.filter(event => event.name === 'lantern_lit').length, 5);
  assert.deepEqual(winLog.at(-1).data, { result: 'won', reason: 'all_lit' });

  const hit = createGame(1, { ...empty, player: { flames: 1 }, shades: [{ pos: [0, 0, 0] }] });
  assert.deepEqual(stepGame(hit).at(-1).data, { result: 'lost', reason: 'no_flames' });
  const dawn = createGame(1, { ...empty, time_left_s: 0.025 });
  assert.deepEqual(stepGame(dawn), []);
  assert.deepEqual(stepGame(dawn).at(-1).data, { result: 'lost', reason: 'dawn' });
  assert.equal(dawn.timeLeft, 0);
  assert.deepEqual(stepGame(dawn), []);
});

test('browser default seed can complete the actual island by following the firefly trails', () => {
  const state = createGame(202603470);
  for (const { pos } of LANTERN_LAYOUT) {
    const to = (x, z) => {
      const dx = x - state.player.pos[0];
      const dz = z - state.player.pos[2];
      play(state, Math.round(Math.hypot(dx, dz) / T.move_speed_mps * T.tick_hz), { x: dx, z: dz });
    };
    to(0, 0);
    to(pos[0], pos[2]);
    stepGame(state, { interact: true });
  }
  assert.equal(state.state, 'won');
});
