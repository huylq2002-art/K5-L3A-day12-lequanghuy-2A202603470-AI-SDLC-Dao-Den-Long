import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DRIFTER_STATES, SHADE_STATES, TUNING as T } from '../src/core/config.ts';
import { NIGHTS } from '../src/core/maps.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = JSON.parse(readFileSync(join(root, 'game.contract.json'), 'utf8'));
const [runtime, script] = contract.headless_cmd.split(' ');
assert.equal(runtime, 'node');
const quiet = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false };

function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let serial = 0;
  const fixture = (name, value) => {
    const path = join(dir, `${name} ${serial++}.json`);
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
    return path;
  };
  function run({ night = 1, ticks = 100, every, seed = 7, scenario, inputs, extra = [] } = {}) {
    const out = join(dir, `output ${serial++}.jsonl`);
    const args = [script, '--night', String(night), '--seed', String(seed), '--ticks', String(ticks), '--out', out];
    if (scenario !== undefined) args.push('--scenario', fixture('scenario', scenario));
    if (inputs !== undefined) args.push('--inputs', fixture('inputs', inputs));
    if (every !== undefined) args.push('--snapshot-every', String(every));
    const start = performance.now();
    const child = spawnSync(process.execPath, [...args, ...extra], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    const ms = performance.now() - start;
    assert.ifError(child.error);
    return { ...child, ms, raw: existsSync(out) ? readFileSync(out, 'utf8') : undefined };
  }
  return run;
}

const eventKeys = {
  mote_picked: ['carried'], deposit: ['amount', 'deposited', 'lantern_id'], lantern_lit: ['lantern_id', 'relight'],
  refuel: ['amount', 'fuel', 'lantern_id'], lantern_out: ['lantern_id'], fuel_drain: ['fuel', 'lantern_id', 'shade_id'],
  pulse: ['stunned_ids'], shade_spawned: ['id'], game_over: ['reason', 'result'],
  dash: [], charm_picked: ['charm_id', 'charm_ticks'], drifter_steal: ['amount', 'carried', 'drifter_id'],
  drifter_drop: ['amount', 'drifter_id'], night_start: ['night'], paused: [], resumed: [],
};

function checkPositions(positions) {
  for (const pos of positions) {
    assert.equal(pos.length, 3);
    assert.ok(pos.every(value => Number.isFinite(value) && value === Number(value.toFixed(3))));
  }
}

function parse(result, night, every = 10) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.ok(result.raw.endsWith('\n'));
  const lines = result.raw.trimEnd().split('\n').map(JSON.parse);
  const end = lines.pop();
  assert.deepEqual(Object.keys(end).sort(), ['score', 'state', 'ticks', 'type']);
  assert.equal(end.type, 'end');
  assert.ok(['playing', 'paused', 'won', 'lost'].includes(end.state));
  assert.equal(lines[0].type, 'snapshot');
  assert.deepEqual(lines[1], { type: 'event', tick: 0, name: 'night_start', data: { night } });
  let previous = 0;
  const snapshots = [];
  const events = [];
  for (const line of lines) {
    assert.ok(Number.isInteger(line.tick) && line.tick >= previous && line.tick <= end.ticks);
    previous = line.tick;
    if (line.type === 'event') {
      assert.deepEqual(Object.keys(line).sort(), ['data', 'name', 'tick', 'type']);
      const keys = line.name === 'player_hit'
        ? (line.data.by === 'fall' ? ['by', 'dropped', 'flames', 'lost'] : ['by', 'dropped', 'flames']) : eventKeys[line.name];
      assert.deepEqual(Object.keys(line.data).sort(), keys);
      if (line.name === 'game_over') assert.ok(['dawn_survived', 'dawn', 'no_flames'].includes(line.data.reason));
      if (line.name === 'lantern_lit') assert.equal(typeof line.data.relight, 'boolean');
      if ('fuel' in line.data) assert.equal(line.data.fuel, Number(line.data.fuel.toFixed(1)));
      events.push(line);
      continue;
    }
    snapshots.push(line);
    assert.equal(line.type, 'snapshot');
    assert.equal(line.night, night);
    assert.equal(line.tick, (snapshots.length - 1) * every);
    assert.ok(line.sim_tick >= 0 && line.sim_tick <= line.tick);
    assert.deepEqual(Object.keys(line).sort(), ['charms', 'drifters', 'lanterns', 'motes', 'motes_active', 'night', 'player', 'score', 'shades', 'sim_tick', 'state', 'tick', 'time_left_s', 'type', 'wind']);
    assert.deepEqual(Object.keys(line.player).sort(), ['capacity', 'carried', 'charm_s', 'dash_cd_s', 'flames', 'grounded', 'invuln', 'pos', 'pulse_cd_s', 'vel']);
    assert.ok(Number.isInteger(line.player.capacity) && line.player.capacity >= 10 && line.player.capacity <= 20);
    assert.ok(line.player.carried <= line.player.capacity);
    assert.equal(typeof line.player.invuln, 'boolean');
    assert.equal(typeof line.player.grounded, 'boolean');
    assert.deepEqual(Object.keys(line.wind).sort(), ['active', 'dir_deg']);
    assert.equal(typeof line.wind.active, 'boolean');
    assert.ok(Number.isFinite(line.wind.dir_deg));
    assert.equal(line.lanterns.length, NIGHTS[night].lanterns.length);
    for (const lamp of line.lanterns) {
      assert.deepEqual(Object.keys(lamp).sort(), ['deposited', 'ever_lit', 'fuel', 'id', 'lit', 'pos', 'relit_count']);
      assert.ok(Number.isFinite(lamp.fuel) && lamp.fuel === Number(lamp.fuel.toFixed(1)) && lamp.fuel >= 0 && lamp.fuel <= 100);
      assert.equal(typeof lamp.ever_lit, 'boolean');
      assert.ok(Number.isInteger(lamp.relit_count) && lamp.relit_count >= 0);
      if (!lamp.lit) assert.equal(lamp.fuel, 0);
    }
    assert.equal(line.motes_active, line.motes.length);
    checkPositions([line.player.pos, line.player.vel, ...[...line.lanterns, ...line.shades, ...line.motes, ...line.drifters].map(entry => entry.pos)]);
    assert.ok(line.shades.every(shade => SHADE_STATES.includes(shade.state)));
    assert.ok(line.drifters.every(drifter => DRIFTER_STATES.includes(drifter.state) && Number.isInteger(drifter.stolen)));
    assert.ok(line.charms.every(charm => typeof charm.available === 'boolean' && Number.isFinite(charm.respawn_s)));
    assert.ok(line.motes.every(mote => (mote.kind === 'random' && mote.ttl_s === null) || (mote.kind === 'dropped' && mote.ttl_s >= 0)));
  }
  return { end, snapshots, events };
}

test('v1.2 JSONL shape, tick 0, every-ten snapshots and exact runtime of a partial replay in each night', t => {
  const run = sandbox(t);
  for (const night of [1, 2, 3]) {
    const result = parse(run({ night, ticks: 23, scenario: { ...quiet, player: { pos: [1.00049, 0, -1.12356] } } }), night);
    const { snapshots, end } = result;
    assert.equal(snapshots[0].time_left_s, NIGHTS[night].duration);
    assert.deepEqual(snapshots[0].player.pos, [1, 0, -1.124]);
    assert.deepEqual(snapshots.map(line => line.tick), [0, 10, 20]);
    assert.equal(snapshots[2].time_left_s, NIGHTS[night].duration - 20 / 60);
    assert.deepEqual(end, { type: 'end', ticks: 23, state: 'playing', score: 0 });
  }
  assert.equal(parse(run({ ticks: 0 }), 1).end.ticks, 0);
});

test('sparse motion rotation, dash press/hold, pause press/hold and frozen cooldowns/TTL', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { pos: [0, 2, 0], dash_cd_ticks: 1, charm_ticks: 40, invuln_ticks: 20, pulse_cd_ticks: 60 },
    motes: [{ pos: [10, 0, 0], kind: 'dropped', ttl_ticks: 400 }] };
  const inputs = { inputs: [
    { tick: 0, move: { x: 0, z: 1 }, cam_yaw_deg: 90, dash: true }, { tick: 1, dash: true, pause: true },
    { tick: 2, dash: true, pause: true }, { tick: 12, pause: true }, { tick: 13, move_x: 0, move_z: 0 },
  ] };
  const { snapshots: s, events } = parse(run({ scenario, inputs, ticks: 23, every: 1 }), 1, 1);
  assert.deepEqual(events.map(({ tick, name }) => [tick, name]), [[0, 'night_start'], [1, 'dash'], [2, 'paused'], [13, 'resumed']]);
  assert.deepEqual(s[1].player.pos, [0.233, 2, 0]);
  for (const tick of [2, 3, 12]) {
    assert.equal(s[tick].state, 'paused');
    assert.equal(s[tick].sim_tick, 1);
    assert.equal(s[tick].time_left_s, s[1].time_left_s);
    assert.deepEqual(s[tick].player, s[1].player);
    assert.deepEqual(s[tick].motes, s[1].motes);
  }
  assert.equal(s[13].sim_tick, 2);
  assert.equal(s[23].player.pos[1], 2);
  assert.equal(s[23].player.pos[0], 2.8);
  assert.equal(parse(run({ ticks: 3, inputs: [{ tick: 0, pause: true }] }), 1).end.state, 'paused');
});

test('natural fall from the Night 1 edge, exact respawn, and fatal fall with no respawn', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { pos: [39.9, 0, 0], invuln_ticks: 400, carried: 8 } };
  const inputs = [{ tick: 0, x: 1, dash: true }, { tick: 12, x: 0 }];
  const { snapshots, events } = parse(run({ scenario, inputs, ticks: 160, every: 1 }), 1, 1);
  const hit = events.find(event => event.name === 'player_hit');
  assert.deepEqual(hit.data, { by: 'fall', flames: 2, dropped: 0, lost: 8 });
  assert.ok(snapshots[hit.tick].player.pos[1] < -10);
  assert.equal(events.filter(event => event.name === 'player_hit').length, 1);
  assert.deepEqual(snapshots[hit.tick + 60].player.pos, [0, 0, 0]);
  assert.deepEqual(snapshots[hit.tick + 60].player.vel, [0, 0, 0]);
  assert.equal(snapshots[hit.tick + 60].player.invuln, true);
  const fatal = parse(run({ scenario: { ...quiet, player: { pos: [42, -10.01, 0], flames: 1 } } }), 1);
  assert.deepEqual(fatal.end, { type: 'end', ticks: 1, state: 'lost', score: 0 });
  assert.equal(fatal.events.at(-1).data.reason, 'no_flames');
});

test('both Night 2 jump pads, bamboo bridge and Night 3 summit pad have headless replays', t => {
  const run = sandbox(t);
  for (const [night, pad, velocity, targetHeight, ticks] of [[2, 0, 14, 0, 86], [2, 1, 14, 0, 86], [3, 0, 12, 6, 50]]) {
    const scenario = { ...quiet, player: { pos: NIGHTS[night].pads[pad].pos } };
    const inputs = [{ tick: 1, x: -1 }, { tick: ticks - 4, x: 0 }];
    const { snapshots } = parse(run({ night, scenario, inputs, ticks, every: 1 }), night, 1);
    assert.equal(snapshots[1].player.vel[1], velocity);
    assert.equal(snapshots.at(-1).player.pos[1], targetHeight);
    assert.equal(snapshots.at(-1).player.grounded, true);
    if (night === 2) assert.ok(pad === 0 ? snapshots.at(-1).player.pos[0] >= 42 : snapshots.at(-1).player.pos[0] <= 28);
  }
  const { snapshots } = parse(run({ night: 2, scenario: { ...quiet, player: { pos: [26, 0, 0] } }, inputs: [{ tick: 0, x: 1 }], ticks: 200 }), 2);
  assert.ok(snapshots.every(line => line.player.pos[1] === 0));
  assert.ok(snapshots.at(-1).player.pos[0] > 44);
});

test('Night 3 lanes: both ramps ascend, ledges descend, and the two-thirds wind markers are deterministic', t => {
  const run = sandbox(t);
  for (const { x, z } of NIGHTS[3].ramps) {
    const scenario = { ...quiet, player: { pos: [31 * x, 0, 31 * z] } };
    const inputs = [{ tick: 0, x: -x, z: -z }, { tick: 80, x: 0, z: 0 }];
    const { snapshots } = parse(run({ night: 3, scenario, inputs, ticks: 100 }), 3);
    assert.ok(snapshots.some(line => line.player.pos[1] > 0 && line.player.pos[1] < 3));
    assert.equal(snapshots.at(-1).player.pos[1], 3);
  }
  const drop = parse(run({ night: 3, scenario: { ...quiet, player: { pos: [0, 6, -7.9] } }, inputs: [{ tick: 0, z: -1 }], ticks: 100 }), 3);
  assert.equal(drop.snapshots.at(-1).player.pos[1], 0);
  const wind = { night: 3, scenario: { ...quiet, wind_enabled: true, player: { pos: [0, 0, -27] } }, every: 60, ticks: 2160 };
  const first = run(wind);
  assert.equal(first.raw, run(wind).raw);
  const { snapshots } = parse(first, 3, 60);
  const at = tick => snapshots.find(snapshot => snapshot.tick === tick);
  assert.equal(at(1680).wind.active, false);
  assert.notEqual(at(1680).wind.dir_deg, 0);
  assert.deepEqual(at(1800).wind, { active: true, dir_deg: at(1680).wind.dir_deg });
  assert.deepEqual(at(2100).wind, { active: false, dir_deg: at(1680).wind.dir_deg });
  assert.ok(Math.abs(Math.hypot(at(2100).player.pos[0], at(2100).player.pos[2] + 27) - 10) < 0.002);
});

test('all spawn schedules, unique positions and IDs, first interaction on a later tick', t => {
  const run = sandbox(t);
  for (const night of [1, 2, 3]) {
    const opts = { night, ticks: 1320, every: 60, scenario: { wind_enabled: false, player: { invuln_ticks: 9000 } } };
    const result = run(opts);
    assert.equal(result.raw, run(opts).raw);
    const { snapshots, events } = parse(result, night, 60);
    const at = tick => snapshots.find(snapshot => snapshot.tick === tick);
    assert.equal(new Set(at(0).motes.map(mote => JSON.stringify(mote.pos))).size, 20);
    assert.equal(at(240).motes_active, 21);
    assert.equal(at(1200).motes_active, night === 3 ? 25 : 24);
    assert.deepEqual(at(300).shades.map(shade => [shade.id, shade.state]), [['S1', 'spawning'], ['S2', 'spawning']]);
    assert.ok(at(300).shades.every(shade => Math.hypot(shade.pos[0] - at(300).player.pos[0], shade.pos[2] - at(300).player.pos[2]) >= 15));
    assert.deepEqual(events.filter(event => event.name === 'shade_spawned').slice(0, 3).map(event => [event.tick, event.data.id]), [[300, 'S1'], [300, 'S2'], [300 + NIGHTS[night].shadeInterval, 'S3']]);
    assert.equal(at(1140).drifters.length, 0);
    assert.deepEqual(at(1200).drifters.map(drifter => [drifter.id, drifter.state]), night === 1 ? [] : [['D1', 'idle']]);
  }
});

test('strict event order from move to pickup/deposit/Pulse, then steal and shade hit, then terminal', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { carried: 9, flames: 1 }, time_left_s: 1 / 60, motes: [[0, 0, 0], [0, 2, 0]],
    lanterns: [{ id: 'L1', pos: [0, 0, 0], deposited: 9 }], charms: [{ pos: [0, 0, 0] }],
    shades: [{ id: 'S2', pos: [1, 0.8, 0] }, { id: 'S1', pos: [0.4, 0.8, 0] }],
    drifters: [{ id: 'D2', pos: [0.6, 6, 0] }, { id: 'D1', pos: [0.6, 6, 0] }],
  };
  const input = [{ tick: 0, dash: true, interact: true, pulse: true }];
  const { events, end, snapshots } = parse(run({ night: 2, scenario, inputs: input, every: 1 }), 2, 1);
  assert.deepEqual(events.map(event => event.name), ['night_start', 'dash', 'mote_picked', 'charm_picked', 'deposit', 'lantern_lit', 'pulse', 'drifter_steal', 'drifter_steal', 'game_over']);
  assert.equal(events[5].tick, 1);
  assert.deepEqual(events[6].data.stunned_ids, ['S1', 'S2']);
  assert.deepEqual(events.slice(7, 9).map(event => event.data.drifter_id), ['D1', 'D2']);
  assert.equal(snapshots[1].player.flames, 1);
  assert.equal(end.score, 115);
  assert.equal(end.state, 'lost');

  const second = { ...quiet, player: { carried: 9, flames: 1 }, shades: [{ id: 'S2', pos: [0.4, 0, 0] }, { id: 'S1', pos: [0.5, 0, 0] }], drifters: [{ pos: [0.5, 0, 0] }] };
  const hit = parse(run({ night: 2, scenario: second, every: 1 }), 2, 1);
  assert.deepEqual(hit.events.map(event => event.name), ['night_start', 'drifter_steal', 'player_hit', 'game_over']);
  assert.equal(hit.events[2].data.dropped, 3);
  assert.equal(hit.snapshots[1].shades[0].state, 'recoil');
  assert.equal(hit.events[3].data.reason, 'no_flames');
});

test('Gió Lạc steals inside safe light and despite invulnerability, then drops recoverable motes via Pulse', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { carried: 10, invuln_ticks: 30 },
    drifters: [{ id: 'D1', pos: [0.5, 0.8, 0] }], lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] };
  const { snapshots, events } = parse(run({ night: 2, scenario, inputs: [{ tick: 1, pulse: true }], every: 1, ticks: 124 }), 2, 1);
  assert.deepEqual(events.slice(1, 4).map(event => event.name), ['drifter_steal', 'pulse', 'drifter_drop']);
  assert.equal(snapshots[2].drifters[0].stolen, 0);
  assert.ok(snapshots[2].motes.every(mote => mote.ttl_s === 8 && mote.kind === 'dropped'));
  assert.equal(snapshots[3].player.carried, 7);
  assert.equal(snapshots[122].drifters[0].state, 'removed');
  assert.equal(snapshots[123].drifters.length, 0);
});

test('Bùa Gió headless overrides, pickup, repeat dash, expiry and replenishment', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { pos: [35, 0, 0], dash_cd_ticks: 90 }, charms: [{ id: 'C1', available: true }] };
  const inputs = [{ tick: 1, dash: true }, { tick: 3, dash: true }, { tick: 13, dash: true }];
  const { snapshots, events } = parse(run({ night: 2, scenario, inputs, every: 1, ticks: 24 }), 2, 1);
  assert.deepEqual(events.slice(1).map(({ tick, name }) => [tick, name]), [[1, 'charm_picked'], [2, 'dash'], [14, 'dash']]);
  assert.equal(snapshots[1].player.charm_s, 10);
  assert.deepEqual(snapshots[1].charms, [{ id: 'C1', available: false, respawn_s: 45 }]);
  const respawn = parse(run({ night: 3, scenario: { ...quiet, player: { pos: [0, 0, -20] }, charms: [{ id: 'C2', pos: [0, 0, -20], respawn_ticks: 2 }] }, every: 1, ticks: 3 }), 3, 1);
  assert.equal(respawn.events[1].tick, 2);
  assert.equal(respawn.events[1].data.charm_id, 'C2');
});

test('partial deposits still work and lighting every lantern waits for dawn', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { carried: 7 }, time_left_s: 5 / 60, motes: [[0, 0, 0]],
    lanterns: [{ id: 'L1', pos: [0, 0, 0], deposited: 2 }, ...['L2', 'L3', 'L4', 'L5'].map(id => ({ id, lit: true }))] };
  const win = parse(run({ scenario, inputs: [{ tick: 1, interact: true }], every: 1 }), 1, 1);
  assert.equal(win.snapshots[1].score, 0);
  assert.equal(win.snapshots[2].score, 140);
  assert.equal(win.snapshots[2].state, 'playing');
  assert.ok(win.snapshots[2].lanterns.every(lamp => lamp.lit));
  assert.deepEqual(win.end, { type: 'end', ticks: 5, state: 'won', score: 1035 });
  assert.deepEqual(win.events.at(-1).data, { result: 'won', reason: 'dawn_survived' });
});

test('drain cadence is per active tick and JSONL refuel ends a draining episode and ejects safely', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, player: { pos: [-3, 0, 0], carried: 2, invuln_ticks: 200 }, lanterns: [{ id: 'L1', pos: [4, 0, 0], lit: true, fuel: 29 }],
    shades: [{ id: 'S1', pos: [5, 0, 0], state: 'drain', target_lantern_id: 'L1' }] };
  const inputs = [{ tick: 29, pause: true }, { tick: 49, pause: true }, { tick: 81, x: 1 }, { tick: 145, x: 0, interact: true }];
  const options = { scenario, inputs, ticks: 180, every: 1 };
  const result = run(options);
  assert.equal(result.raw, run(options).raw);
  const { snapshots, events } = parse(result, 1, 1);
  assert.deepEqual(events.filter(event => event.name === 'fuel_drain').map(({ tick, data }) => [tick, data]), [[80, { lantern_id: 'L1', shade_id: 'S1', fuel: 23 }]]);
  assert.equal(snapshots[49].sim_tick, 29);
  assert.deepEqual(snapshots[49].lanterns, snapshots[29].lanterns);
  const refuel = events.find(event => event.name === 'refuel');
  assert.equal(refuel.tick, 146);
  assert.equal(refuel.data.amount, 2);
  assert.ok(refuel.data.fuel >= 30);
  assert.ok(Math.abs(snapshots[175].shades[0].pos[0] - 4) > 6);
  assert.equal(snapshots[175].player.flames, 3);
});

test('out, relight and capacity snapshots obey v1.2 before checking dawn', t => {
  const run = sandbox(t);
  const scenario = { ...quiet, time_left_s: 1 / 60, player: { carried: 18, successful_lights: 4, flames: 2 },
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 1 / 60 }, { id: 'L2', lit: true, fuel: 62.25 }, { id: 'L3', lit: true, fuel: 20.5 }] };
  const options = { scenario, inputs: [{ tick: 0, interact: true }], every: 1 };
  const { snapshots, events, end } = parse(run(options), 1, 1);
  assert.deepEqual(events.slice(1).map(event => [event.name, event.data]), [
    ['lantern_out', { lantern_id: 'L1' }], ['deposit', { lantern_id: 'L1', amount: 5, deposited: 5 }],
    ['lantern_lit', { lantern_id: 'L1', relight: true }], ['game_over', { result: 'won', reason: 'dawn_survived' }],
  ]);
  assert.equal(snapshots[0].player.capacity, 18);
  assert.equal(snapshots[1].player.capacity, 20);
  assert.equal(snapshots[1].player.carried, 13);
  assert.deepEqual(snapshots[1].lanterns[0], { id: 'L1', pos: [0, 0, 0], lit: true, deposited: 5, fuel: 100, ever_lit: true, relit_count: 1 });
  assert.equal(end.score, 497);
  const loss = parse(run({ scenario, every: 1 }), 1, 1);
  assert.equal(loss.events.at(-1).data.reason, 'dawn');
  assert.equal(loss.end.score, 0);
  const fatal = { ...scenario, player: { ...scenario.player, pos: [42, -11, 0], flames: 1 }, lanterns: scenario.lanterns.map(lamp => ({ ...lamp, fuel: 50 })) };
  const noFlames = parse(run({ scenario: fatal, every: 1 }), 1, 1);
  assert.equal(noFlames.events.at(-1).data.reason, 'no_flames');
  assert.ok(noFlames.snapshots[1].lanterns.filter(lamp => lamp.lit).length >= 3);
});

test('dawn uses 60 percent rounded up for each night and counts lit lamps below 30 fuel', t => {
  const run = sandbox(t);
  for (const [night, required] of [[1, 3], [2, 4], [3, 5]]) {
    const lanterns = Array.from({ length: required }, (_, i) => ({ id: `L${i + 1}`, lit: true, fuel: 6 }));
    const scenario = { ...quiet, time_left_s: 1 / 60, lanterns };
    const win = parse(run({ night, scenario }), night);
    assert.equal(win.events.at(-1).data.reason, 'dawn_survived');
    assert.equal(win.end.score, 150 + required * 55);
    const loss = parse(run({ night, scenario: { ...scenario, lanterns: lanterns.slice(1) } }), night);
    assert.equal(loss.events.at(-1).data.reason, 'dawn');
    assert.equal(loss.end.score, 0);
  }
});

test('malformed/v1.2 invalid JSON, controls and CLI flags exit 2 via stderr', t => {
  const run = sandbox(t);
  const cases = [
    [{ inputs: '[' }, /Cannot read inputs/], [{ scenario: '{' }, /Cannot read scenario/],
    [{ inputs: [{ tick: 0 }, { tick: 0 }] }, /strictly increasing/], [{ inputs: [{ tick: 7 }, { tick: 1 }] }, /strictly increasing/],
    [{ inputs: [{ tick: 0, dash: 1 }] }, /dash.*boolean/], [{ inputs: [{ tick: 0, pause: 'p' }] }, /pause.*boolean/],
    [{ scenario: { motes: [[0, 0]] } }, /expected \[x, y, z\]/],
    [{ scenario: { player: { carried: 11 } } }, /carried/],
    [{ scenario: { player: { successful_lights: -1 } } }, /successful_lights/],
    [{ scenario: { player: { successful_lights: 8, carried: 21 } } }, /carried/],
    [{ scenario: { lanterns: [{ id: 'L6' }] } }, /expected a unique lantern ID/],
    [{ scenario: { lanterns: [{ id: 'L1', lit: true, fuel: 100.1 }] } }, /expected fuel from 0 to 100/],
    [{ scenario: { lanterns: [{ id: 'L1', lit: false, ever_lit: true, deposited: 6 }] } }, /deposited/],
    [{ scenario: { shades: [{ state: 'drain', pos: [1, 0, 0], target_lantern_id: 'L6' }] } }, /target_lantern_id/],
    [{ night: 2, scenario: { shades: [{ state: 'flee', pos: [1, 0, 0] }] } }, /invalid shade state/],
    [{ night: 3, scenario: { drifters: [{ state: 'stunned', pos: [1, 0, 0] }] } }, /invalid drifter state/],
    [{ scenario: { random_drifters: 1 } }, /random_drifters.*boolean/],
    [{ every: 0 }, /requires an integer/], [{ night: 4 }, /--night must be 1, 2 or 3/],
    [{ ticks: -1 }, /--ticks requires an integer/], [{ seed: 1.25 }, /--seed requires an integer/],
    [{ extra: ['--extra', '0'] }, /Unknown/],
  ];
  for (const [options, diagnostic] of cases) {
    const result = run(options);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, diagnostic);
    assert.equal(result.stdout, '');
    assert.equal(result.raw, undefined);
  }
});

test('full Night 3 headless with scheduled enemies and default JSONL cadence runs below 30 seconds', t => {
  const result = sandbox(t)({ night: 3, ticks: 18_000, scenario: { wind_enabled: false, player: { invuln_ticks: 18_100 } } });
  const { end, events } = parse(result, 3);
  assert.deepEqual(end, { type: 'end', ticks: 18_000, state: 'lost', score: 0 });
  assert.equal(events.at(-1).data.reason, 'dawn');
  assert.ok(result.ms < 30_000, `took ${result.ms.toFixed(0)} ms`);
});
