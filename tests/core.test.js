import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { advanceNight, createCampaign, recordResult, startNight } from '../src/core/campaign.js';
import { TUNING as T } from '../src/core/config.ts';
import { createGame, makeSnapshot, stepGame } from '../src/core/game.js';
import { groundHeight, NIGHTS } from '../src/core/maps.js';
import { distanceXZ, rotateMove } from '../src/core/math.js';

const quiet = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false };
const game = (scenario = {}, night = 1) => createGame(7, { ...quiet, ...scenario }, night);
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const play = (state, count, input = {}) => Array.from({ length: count }, () => stepGame(state, input)).flat();
const names = events => events.map(event => event.name);

test('v1.3 metadata preserves v1.2 tuning and TICKET-02 movement constants', () => {
  const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(contract.contract_version, '1.3');
  assert.equal(contract.team, '2A202603470-lequanghuy');
  assert.deepEqual(contract.tuning, T);
  assert.equal(T.tick_hz, 60);
  assert.deepEqual([T.move_speed_mps, T.jump_speed_mps, T.gravity_mps2, T.dash_speed, T.dash_duration_s, T.dash_cooldown_s], [6, 7, -20, 14, 0.2, 1.5]);
  assert.deepEqual(Object.values(NIGHTS).map(map => [map.duration, map.lanterns.length, map.motePoints.length, map.shadePoints.length, map.shadeInterval, map.maxShades]), [
    [240, 5, 24, 12, 480, 6], [270, 6, 24, 16, 420, 8], [300, 7, 30, 16, 360, 10],
  ]);
  assert.deepEqual(NIGHTS[1].lanterns[1].pos, [23.8, 0, 7.7]);
  near(NIGHTS[1].motePoints[9][0], 33 * Math.cos(Math.PI / 8));
  assert.equal(groundHeight(NIGHTS[2], 35, 2), 0);
  assert.equal(groundHeight(NIGHTS[2], 35, 2.001), -Infinity);
});

test('normalized camera rotation, six-tick acceleration/braking, full air control and grounded jumps', () => {
  const [x, z] = rotateMove(0, 1, 90);
  near(x, 1);
  near(z, 0);
  near(Math.hypot(...rotateMove(1, 1, -40)), 1);
  near(Math.hypot(...rotateMove(0.3, 0.4, 30)), 0.5);
  near(Math.hypot(...rotateMove(Number.MAX_VALUE, Number.MAX_VALUE, 0)), 1);
  const state = game();
  play(state, 6, { z: 1, cam_yaw_deg: 90 });
  near(state.player.pos[0], 0.35);
  near(state.player.vel[0], 6);
  play(state, 6);
  near(state.player.vel[0], 0);
  stepGame(state, { jump: true, x: 1 });
  near(state.player.vel[1], 7);
  assert.equal(state.player.grounded, false);
  stepGame(state, { jump: true, x: 1 });
  near(state.player.vel[1], 7 - 20 / 60);
  play(state, 4, { x: 1 });
  near(state.player.vel[0], 6);
  play(state, 60);
  assert.equal(state.player.grounded, true);
  assert.equal(state.player.pos[1], 0);
});

test('dash lasts exactly 12 movement ticks, fixes air altitude and cooldown begins at launch', () => {
  const state = game({ player: { pos: [0, 2, 0] } });
  assert.deepEqual(names(stepGame(state, { dash: true, x: 1 })), ['dash']);
  assert.deepEqual(names(play(state, 11, { dash: true, x: -1 })), []);
  near(state.player.pos[0], 2.8);
  assert.equal(state.player.pos[1], 2);
  assert.deepEqual(state.player.vel, [14, 0, 0]);
  stepGame(state, { x: 1 });
  assert.ok(state.player.pos[1] < 2);
  play(state, 76);
  assert.deepEqual(names(stepGame(state, { dash: true })), []);
  stepGame(state);
  assert.deepEqual(names(stepGame(state, { dash: true })), ['dash']);
  assert.ok(state.player.vel[0] > 0);
});

test('dash grants no invulnerability and a border fall bypasses invulnerability with exact respawn', () => {
  const attacked = game({ shades: [{ pos: [0, 0, 0] }] });
  assert.deepEqual(names(stepGame(attacked, { dash: true })), ['dash', 'player_hit']);
  const fall = game({ player: { pos: [39.9, 0, 0], carried: 7, invuln_ticks: 900 }, motes: [[40.2, -11, 0]] });
  assert.ok(!play(fall, 12, { dash: true, x: 1 }).some(event => event.name === 'player_hit'));
  assert.ok(fall.player.pos[0] > 40);
  const events = play(fall, 70);
  const hit = events.find(event => event.name === 'player_hit');
  assert.deepEqual(hit.data, { by: 'fall', flames: 2, dropped: 0, lost: 7 });
  assert.ok(fall.player.pos[1] < -10 && fall.player.falling);
  play(fall, hit.tick + 59 - fall.tick);
  assert.equal(fall.player.falling, true);
  assert.equal(fall.player.carried, 0);
  stepGame(fall, { x: 1 });
  assert.deepEqual(fall.player.pos, [0, 0, 0]);
  assert.deepEqual(fall.player.vel, [0, 0, 0]);
  assert.equal(fall.player.invuln, 90);
  assert.equal(play(fall, 20).some(event => event.name === 'player_hit'), false);
});

test('Night 2 pads lock their launch velocity, permit a dash and land on the opposite island', () => {
  for (const [index, far] of [[0, true], [1, false]]) {
    const state = game({ player: { pos: NIGHTS[2].pads[index].pos } }, 2);
    stepGame(state);
    const [x, y, z] = state.player.vel;
    near(Math.hypot(x, z), 24);
    assert.equal(y, 14);
    stepGame(state, { x: far ? -1 : 1 });
    near(state.player.vel[0], x);
    const events = play(state, 85);
    assert.equal(events.some(event => event.name === 'player_hit'), false);
    assert.ok(far ? state.player.pos[0] > 42 : state.player.pos[0] < 28);
    assert.equal(state.player.grounded, true);
  }
  const dash = game({ player: { pos: NIGHTS[2].pads[0].pos } }, 2);
  stepGame(dash);
  stepGame(dash);
  const height = dash.player.pos[1];
  stepGame(dash, { dash: true });
  assert.equal(dash.player.pos[1], height);
  assert.equal(dash.player.vel[1], 0);
});

test('Night 3 ramps, one-way drops, pad-to-summit landing and tower collision', () => {
  const map = NIGHTS[3];
  assert.equal(groundHeight(map, 15, 10), 3);
  assert.equal(groundHeight(map, 15, -10), 0);
  assert.equal(groundHeight(map, 0, 6), 6);
  for (const { x, z } of map.ramps) {
    near(groundHeight(map, 27 * x, 27 * z), 1.5);
    const state = game({ player: { pos: [31 * x, 0, 31 * z] } }, 3);
    play(state, 82, { x: -x, z: -z });
    near(state.player.pos[1], 3);
    assert.equal(state.player.grounded, true);
  }
  const wall = game({ player: { pos: [0, 0, 26] } }, 3);
  play(wall, 55, { z: -1 });
  assert.ok(wall.player.pos[2] > 24 && wall.player.pos[2] < 24.2);
  assert.equal(wall.player.pos[1], 0);
  const pad = game({ player: { pos: [0, 3, 13] } }, 3);
  assert.deepEqual(stepGame(pad), []);
  assert.deepEqual(pad.player.vel, [0, 12, -8]);
  play(pad, 49, { x: 1 });
  assert.equal(pad.player.pos[1], 6);
  assert.equal(pad.player.grounded, true);
  play(pad, 80, { z: -1 });
  assert.ok(pad.player.pos[2] >= 2);
  play(pad, 135, { x: 1 });
  assert.equal(pad.player.pos[1], 0);
});

test('pickup uses horizontal plus vertical bounds and cap, then ties deposit to one smallest ID', () => {
  const state = game({ player: { carried: 9 }, motes: [[1, 1.5, 0], [0, 1.501, 0], [0, 0, 0]],
    lanterns: [{ id: 'L2', pos: [0, 0, -2] }, { id: 'L1', pos: [0, 0, 2], deposited: 8 }],
  });
  const events = stepGame(state, { interact: true });
  assert.deepEqual(names(events), ['mote_picked', 'deposit', 'lantern_lit']);
  assert.deepEqual(events[1].data, { lantern_id: 'L1', amount: 2, deposited: 10 });
  assert.deepEqual(events[2].data, { lantern_id: 'L1', relight: false });
  assert.equal(state.score, 110);
  assert.equal(state.motes.length, 2);
  assert.equal(state.lanterns[1].deposited, 0);
});

test('safe-zone update protects immediately and pushes an existing shade out in 30 ticks', () => {
  const state = game({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 0] }], shades: [{ pos: [0, 0, 0] }, { pos: [-8, 0, 0] }] });
  assert.deepEqual(names(stepGame(state, { interact: true })), ['deposit', 'lantern_lit']);
  assert.ok(distanceXZ(state.shades[0].pos, [0, 0, 0]) < 1);
  assert.deepEqual(play(state, 29), []);
  assert.ok(distanceXZ(state.shades[0].pos, [0, 0, 0]) > 6);
  assert.deepEqual(play(state, 90), []);
  assert.ok(makeSnapshot(state).shades.every(shade => distanceXZ(shade.pos, [0, 0, 0]) > 6));
});

test('Pulse locks 3D targets, counts score per shade, pushes for 15 ticks and refreshes stun', () => {
  const state = game({ player: { carried: 6 }, shades: [
    { id: 'S1', pos: [0, 0.8, 0] }, { id: 'S3', pos: [5, 0, 0] },
    { id: 'S2', pos: [0, 5.8, 0], state: 'stunned', state_ticks_left: 18 },
  ] });
  assert.deepEqual(stepGame(state, { pulse: true })[0].data, { stunned_ids: ['S1', 'S2'] });
  assert.equal(state.score, 10);
  assert.equal(state.player.carried, 3);
  near(state.shades[0].pos[0], 4 / 15);
  play(state, 14, { pulse: true });
  near(state.shades[0].pos[0], 4);
  assert.equal(state.shades[1].remaining, 106);
  play(state, 105);
  assert.equal(state.shades[0].state, 'stunned');
  stepGame(state);
  assert.notEqual(state.shades[0].state, 'stunned');
  const blocked = game({ player: { carried: 3, pos: [-9, 0, 0] }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }], shades: [{ pos: [-7, 0, 0] }] });
  stepGame(blocked, { pulse: true });
  play(blocked, 14);
  assert.ok(blocked.shades[0].pos[0] < -6 && blocked.shades[0].pos[0] > -6.005);
});

test('shade chase hysteresis, recoil, hit drop ring, TTL and invulnerability', () => {
  const state = game({ player: { carried: 9 }, shades: [
    { id: 'S2', pos: [0, 1.501, 0] }, { id: 'S1', pos: [1, 1.5, 0] }, { id: 'S3', pos: [14, 0, 0], state: 'wander' },
  ] });
  assert.deepEqual(stepGame(state)[0].data, { by: 'shade', flames: 2, dropped: 4 });
  const hit = state.shades[0];
  const origin = [...hit.pos];
  assert.equal(hit.state, 'recoil');
  assert.equal(state.shades[2].state, 'wander');
  assert.ok(state.motes.every(mote => mote.ttl === 480 && distanceXZ(mote.pos, [0, 0, 0]) >= 1.5 && distanceXZ(mote.pos, [0, 0, 0]) <= 2.5));
  assert.deepEqual(play(state, 60), []);
  near(distanceXZ(origin, hit.pos), 2);
  assert.ok(state.player.invuln > 0);
  state.shades.length = 0;
  play(state, 419);
  assert.equal(state.motes.length, 4);
  stepGame(state);
  assert.equal(state.motes.length, 0);

  const seeded = game({ shades: [{ pos: [2, 0, 0], state: 'recoil', state_ticks_left: 3 }] });
  play(seeded, 2);
  assert.equal(seeded.shades[0].state, 'recoil');
  stepGame(seeded);
  assert.equal(seeded.shades[0].state, 'wander');
  near(seeded.shades[0].pos[0], 2.1);
});

test('Gió Lạc steals before shade damage despite invulnerability, returns stolen motes on Pulse and disappears', () => {
  const state = game({ player: { carried: 10, invuln_ticks: 40 }, drifters: [{ pos: [0.4, 1, 0], state: 'chase' }], shades: [{ pos: [0, 0, 0] }] }, 2);
  const steal = stepGame(state);
  assert.deepEqual(steal[0].data, { drifter_id: 'D1', amount: 3, carried: 7 });
  assert.equal(state.player.flames, 3);
  assert.equal(state.drifters[0].stolen, 3);
  const pulse = stepGame(state, { pulse: true });
  assert.deepEqual(names(pulse), ['pulse', 'drifter_drop']);
  assert.equal(state.player.carried, 4);
  assert.equal(state.motes.length, 3);
  assert.deepEqual(names(stepGame(state)), ['mote_picked', 'mote_picked', 'mote_picked']);
  play(state, 119);
  assert.equal(state.drifters[0].state, 'removed');
  stepGame(state);
  assert.equal(state.drifters.length, 0);
  const prevented = game({ player: { carried: 10 }, drifters: [{ pos: [0.5, 0.8, 0], state: 'chase' }] }, 2);
  assert.deepEqual(names(stepGame(prevented, { pulse: true })), ['pulse']);
  assert.equal(prevented.drifters[0].state, 'flee');
});

test('Bùa Gió enables 7.2 m/s and repeat dash, consumes input during a dash and respawns', () => {
  const state = game({ player: { pos: [35, 0, 0], dash_cd_ticks: 99 } }, 2);
  assert.deepEqual(stepGame(state)[0].data, { charm_id: 'C1', charm_ticks: 600 });
  play(state, 6, { x: 1 });
  near(state.player.vel[0], 7.2);
  assert.deepEqual(names(stepGame(state, { dash: true, x: 1 })), ['dash']);
  stepGame(state);
  assert.deepEqual(names(play(state, 11, { dash: true })), []);
  stepGame(state);
  assert.deepEqual(names(stepGame(state, { dash: true })), ['dash']);
  assert.equal(makeSnapshot(state).player.dash_cd_s, 0);
  const timed = game({ player: { pos: [35, 0, 0] } }, 2);
  stepGame(timed);
  play(timed, 600);
  assert.equal(timed.player.charm, 0);
  play(timed, 2099);
  assert.deepEqual(names(stepGame(timed)), ['charm_picked']);
});

test('wind warning, active duration and displacement are deterministic; paused clocks and TTL freeze', () => {
  const state = game({ wind_enabled: true, player: { pos: [0, 0, -34] }, motes: [{ pos: [30, 0, 0], kind: 'dropped', ttl_ticks: 4000 }] }, 3);
  play(state, 1680);
  assert.equal(state.wind.warning, true);
  assert.equal(state.wind.active, false);
  const previous = makeSnapshot(state);
  assert.deepEqual(names(stepGame(state, { pause: true, dash: true })), ['paused']);
  play(state, 27, { pause: true, x: 1 });
  const paused = makeSnapshot(state);
  assert.equal(paused.sim_tick, previous.sim_tick);
  assert.equal(paused.time_left_s, previous.time_left_s);
  assert.deepEqual(paused.motes, previous.motes);
  stepGame(state);
  assert.deepEqual(names(stepGame(state, { pause: true })), ['resumed']);
  play(state, 119);
  assert.equal(state.wind.active, true);
  near(distanceXZ(state.player.pos, [0, 0, -34]), 2 / 60);
  play(state, 299);
  near(distanceXZ(state.player.pos, [0, 0, -34]), 10);
  stepGame(state);
  assert.equal(state.wind.active, false);
  const repeat = game({ wind_enabled: true, player: { pos: [0, 0, -34] } }, 3);
  play(repeat, 1800);
  near(repeat.wind.radians, state.wind.radians);
});

test('last-tick changes count at dawn, no_flames takes priority and campaign credits each win once', () => {
  const scenario = { player: { carried: 10, flames: 1 }, time_left_s: 1 / 60,
    lanterns: [
      { id: 'L1', pos: [0, 0, 0] },
      { id: 'L2', lit: true, fuel: 40 },
      { id: 'L3', lit: true, fuel: 2 },
    ],
  };
  const win = game(scenario);
  assert.deepEqual(names(stepGame(win, { interact: true })), ['deposit', 'lantern_lit', 'game_over']);
  assert.equal(win.state, 'won');
  assert.equal(win.reason, 'dawn_survived');
  assert.equal(win.score, 490);
  const noFlames = game({ ...scenario, player: { flames: 0 } });
  assert.equal(stepGame(noFlames, { interact: true })[0].data.reason, 'no_flames');
  const dawn = game({ time_left_s: 1 / 60 });
  assert.equal(stepGame(dawn)[0].data.reason, 'dawn');
  const campaign = createCampaign(11);
  campaign.game = win;
  recordResult(campaign);
  recordResult(campaign);
  assert.equal(campaign.total, 490);
  assert.equal(advanceNight(campaign), true);
  const next = startNight(campaign);
  assert.equal(next.player.flames, 3);
  assert.equal(next.player.successfulLights, 0);
  assert.equal(makeSnapshot(next).player.capacity, 10);
  campaign.game = dawn;
  recordResult(campaign);
  assert.equal(campaign.total, 490);
  assert.equal(advanceNight(campaign), false);
});
