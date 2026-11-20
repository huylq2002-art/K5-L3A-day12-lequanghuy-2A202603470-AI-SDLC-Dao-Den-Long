import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = JSON.parse(readFileSync(join(root, 'game.contract.json'), 'utf8'));
const tuning = contract.tuning;
const [runtime, script] = contract.headless_cmd.split(' ');
assert.equal(runtime, 'node');
const empty = { random_motes: false, random_shades: false };

function sandbox(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let count = 0;
  const fixture = (name, value) => {
    const path = join(directory, `${name} ${count++}.json`);
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
    return path;
  };
  function run(extra = [], ticks = 100, seed = 7, night = 1) {
    const out = join(directory, `output ${count++}.jsonl`);
    const child = spawnSync(process.execPath, [script, '--night', String(night), '--seed', String(seed), '--ticks', String(ticks), '--out', out, ...extra], {
      cwd: root, encoding: 'utf8', timeout: 15_000,
    });
    assert.ifError(child.error);
    const raw = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
    return { ...child, raw };
  }
  return { fixture, run };
}

function records(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.ok(result.raw.endsWith('\n'));
  const lines = result.raw.trimEnd().split('\n').map(JSON.parse);
  assert.equal(lines[0].type, 'snapshot');
  const end = lines.at(-1);
  assert.deepEqual(Object.keys(end).sort(), ['score', 'state', 'ticks', 'type']);
  assert.equal(end.type, 'end');
  assert.ok(['playing', 'won', 'lost'].includes(end.state));
  let previousTick = 0;
  for (const line of lines.slice(0, -1)) {
    assert.ok(Number.isInteger(line.tick) && line.tick >= previousTick && line.tick <= end.ticks);
    previousTick = line.tick;
    if (line.type === 'event') {
      assert.deepEqual(Object.keys(line).sort(), ['data', 'name', 'tick', 'type']);
      assert.ok(line.tick > 0);
      const keys = {
        mote_picked: ['carried'], deposit: ['amount', 'deposited', 'lantern_id'], lantern_lit: ['lantern_id'],
        pulse: ['stunned_ids'], player_hit: ['by', 'dropped', 'flames'], shade_spawned: ['id'], game_over: ['reason', 'result'],
      };
      assert.deepEqual(Object.keys(line.data).sort(), keys[line.name]);
    } else {
      assert.equal(line.type, 'snapshot');
      assert.deepEqual(Object.keys(line).sort(), ['lanterns', 'motes', 'motes_active', 'player', 'score', 'shades', 'sim_tick', 'state', 'tick', 'time_left_s', 'type']);
      assert.equal(line.tick, line.sim_tick);
      assert.ok(['playing', 'won', 'lost'].includes(line.state));
      assert.equal(line.lanterns.length, 5);
      assert.equal(line.motes.length, line.motes_active);
      for (const { pos } of [line.player, ...line.lanterns, ...line.shades, ...line.motes]) {
        assert.equal(pos.length, 3);
        assert.ok(pos.every(value => Number.isFinite(value) && value === Number(value.toFixed(3))));
      }
    }
  }
  return lines;
}

test('headless defaults to snapshots every ten and ends at the requested tick, including zero', t => {
  const { fixture, run } = sandbox(t);
  const scenario = fixture('clock', { ...empty, time_left_s: 13.25, player: { pos: [0.00049, 0, -0.12356] } });
  const lines = records(run(['--scenario', scenario], 23, -2));
  const snapshots = lines.filter(line => line.type === 'snapshot');
  assert.deepEqual(snapshots.map(line => line.tick), [0, 10, 20]);
  assert.deepEqual(snapshots[0].player.pos, [0, 0, -0.124]);
  assert.equal(snapshots[2].time_left_s, 13.25 - 20 / 60);
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 23, state: 'playing', score: 0 });
  const zero = records(run(['--scenario', scenario], 0));
  assert.deepEqual(zero.map(line => line.type), ['snapshot', 'end']);
  assert.equal(zero.at(-1).ticks, 0);
});

test('headless consumes sparse input from tick k before producing snapshot k+1', t => {
  const { fixture, run } = sandbox(t);
  const scenario = fixture('turn', { ...empty, motes: [[tuning.pickup_radius + 0.08, 0, 0]] });
  const inputs = fixture('controls', { inputs: [{ tick: 0, move: { x: 0, z: 1 }, cam_yaw_deg: 90 }, { tick: 2, move_x: 0, move_z: 0 }, { tick: 3, jump: true }] });
  const lines = records(run(['--scenario', scenario, '--inputs', inputs, '--snapshot-every', '1'], 4));
  assert.deepEqual(lines[0].player.pos, [0, 0, 0]);
  assert.deepEqual(lines[1], { type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } });
  const moves = lines.filter(line => line.type === 'snapshot').map(line => line.player.pos);
  assert.deepEqual(moves.slice(1, 4), [[0.1, 0, 0], [0.2, 0, 0], [0.2, 0, 0]]);
  assert.ok(moves[4][1] > 0);
});

test('sample replay wins early and repeats byte for byte', t => {
  const { run } = sandbox(t);
  const args = ['--scenario', 'tests/fixtures/scenario.json', '--inputs', 'tests/fixtures/inputs.json'];
  const first = run(args, 240);
  const second = run(args, 240);
  const lines = records(first);
  records(second);
  assert.equal(first.raw, second.raw);
  assert.equal(lines[0].lanterns.filter(lantern => lantern.lit).length, 4);
  assert.equal(lines[0].score, 0);
  assert.equal(lines[0].motes_active, 5);
  assert.deepEqual(lines[1], { type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['bong-muc-ben'] } });
  assert.equal(lines.find(line => line.tick === 10).shades[0].state, 'stunned');
  assert.deepEqual(lines.at(-2), { type: 'event', tick: 66, name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 66, state: 'won', score: 5 * tuning.score_mote + tuning.score_lantern + tuning.score_win });
});

test('seeded IDs include scenario overrides, respawns and spawn events deterministically', t => {
  const { fixture, run } = sandbox(t);
  const scenario = fixture('seed', { motes: [], shades: [{ pos: [28, 0, 0] }, { id: 'S1', pos: [30, 0, 0] }], player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }] });
  const args = ['--scenario', scenario, '--snapshot-every', '540'];
  const tick = tuning.shade_first_spawn_s * tuning.tick_hz;
  const first = run(args, tick + 2, 345);
  const lines = records(first);
  assert.equal(first.raw, run(args, tick + 2, 345).raw);
  assert.notEqual(first.raw, run(args, tick + 2, 346).raw);
  assert.equal(lines[0].motes_active, 0);
  assert.deepEqual(lines[0].shades.map(shade => shade.id), ['S2', 'S1']);
  assert.deepEqual(lines.find(line => line.type === 'event'), { type: 'event', tick, name: 'shade_spawned', data: { id: 'S3' } });
});

test('headless exits 0 for each losing result and supplies the exact game-over reason', t => {
  const { fixture, run } = sandbox(t);
  const cases = [
    [fixture('dawn', { ...empty, time_left_s: 2 / 60 }), 'dawn', 2],
    [fixture('hit', { ...empty, player: { flames: 1, carried: 4 }, shades: [{ pos: [0, 25, 0] }] }), 'no_flames', 1],
  ];
  for (const [file, reason, ticks] of cases) {
    const lines = records(run(['--scenario', file]));
    assert.deepEqual(lines.at(-2), { type: 'event', tick: ticks, name: 'game_over', data: { result: 'lost', reason } });
    assert.deepEqual(lines.at(-1), { type: 'end', ticks, state: 'lost', score: 0 });
    if (reason === 'no_flames') assert.deepEqual(lines[1].data, { by: 'shade', flames: 0, dropped: 2 });
  }
});

test('invalid flags and malformed or invalid JSON exit 2, with diagnostics on stderr', t => {
  const { fixture, run } = sandbox(t);
  const cases = [
    [['--inputs', fixture('bad input json', '[')], /Cannot read inputs/],
    [['--scenario', fixture('bad scenario json', '{')], /Cannot read scenario/],
    [['--inputs', fixture('duplicate', [{ tick: 0 }, { tick: 0 }])], /strictly increasing/],
    [['--inputs', fixture('decreasing', [{ tick: 7 }, { tick: 1 }])], /strictly increasing/],
    [['--inputs', fixture('bad action', [{ tick: 0, jump: 'yes' }])], /expected a boolean/],
    [['--scenario', fixture('bad pos', { motes: [[0, 0]] })], /expected \[x, y, z\]/],
    [['--scenario', fixture('bad id', { lanterns: [{ id: 'L6' }] })], /expected a unique lantern ID/],
    [['--snapshot-every', '0'], /requires an integer/],
    [['--night', '2'], /repeated option/],
    [['--extra', '0'], /Unknown/],
  ];
  for (const [args, diagnostic] of cases) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, diagnostic);
    assert.equal(result.stdout, '');
    assert.equal(result.raw, undefined);
  }
  for (const [result, diagnostic] of [
    [run([], 100, 7, 2), /--night must be 1/],
    [run([], -1), /--ticks requires an integer/],
    [run([], 100, 1.25), /--seed requires an integer/],
  ]) {
    assert.equal(result.status, 2);
    assert.match(result.stderr, diagnostic);
    assert.equal(result.raw, undefined);
  }
});
