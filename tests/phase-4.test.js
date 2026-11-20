import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { benchmarkReport, frameStats } from '../src/cli/bench-stats.js';
import { benchmarkCamera, createBenchmark, stepBenchmark } from '../src/core/benchmark.js';
import { ACTION_LABELS, actionFor, bindingKeys, normalizeSettings, rebind } from '../src/client/settings.js';
import { createLeaderboard, rankEntries, validResult } from '../src/server/leaderboard.js';
import { serve } from '../src/server/http.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = JSON.parse(readFileSync(join(root, 'game.contract.json'), 'utf8'));

function directory(t) {
  const path = mkdtempSync(join(tmpdir(), 'dao-den-long-release-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function cli(command, args, env = process.env) {
  const [runtime, ...parts] = contract[command].split(' ');
  assert.equal(runtime, 'node');
  const result = spawnSync(process.execPath, [...parts, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  return result;
}

test('benchmark computes v1.3 schema, weighted average, p95 and slowest-one-percent mean', () => {
  const times = [100, ...Array(99).fill(10), 50];
  const report = benchmarkReport(times, { loadMs: 1000, peakRss: null, vsyncOff: false, renderer: 'Three.js r183 WebGL 2', os: 'Windows_NT' });
  assert.deepEqual(report, { contract_version: '1.3', frames: 101, avg_fps: 101000 / 1140, p1_low_fps: 2000 / 150,
    frame_ms_p95: 10, load_ms: 1000, peak_mem_mb: null, vsync_off: false, renderer: 'Three.js r183 WebGL 2', os: 'Windows_NT' });
  assert.equal(frameStats([16]).p1_low_fps, 62.5);
  assert.throws(() => frameStats([0]), /No valid frame/);
  assert.equal(cli('bench_cmd', ['--seed', '42', '--duration', '0', '--out', 'unused.json']).status, 2);
});

test('benchmark scene has fixed counts, no gameplay effects and a 15-second camera orbit', () => {
  const state = createBenchmark(42);
  assert.equal(state.night, 1);
  assert.deepEqual(state.player.pos, [0, 0, 0]);
  assert.equal(new Set(state.shades.map(entity => entity.pos.toString())).size, 200);
  assert.equal(new Set(state.motes.map(entity => entity.pos.toString())).size, 100);
  assert.deepEqual(state.shades.map(entity => entity.pos), createBenchmark(42).shades.map(entity => entity.pos));
  assert.notDeepEqual(state.shades[0].pos, createBenchmark(43).shades[0].pos);
  assert.ok([...state.shades, ...state.motes].every(({ pos }) => Math.hypot(pos[0], pos[2]) <= 40 && pos[1] === 0));
  const original = state.shades.map(entity => [...entity.pos]);
  for (let tick = 0; tick < 500; tick++) stepBenchmark(state);
  assert.equal(state.shades.length, 200);
  assert.equal(state.motes.length, 100);
  assert.equal(state.drifters.length, 0);
  assert.equal(state.simTick, 500);
  assert.ok(state.shades.every(entity => entity.state === 'wander'));
  assert.notDeepEqual(state.shades.map(entity => entity.pos), original);
  assert.deepEqual(state.lanterns.map(lamp => [lamp.id, lamp.fuelUnits]), [['L1', 6000], ['L2', 6000], ['L3', 6000], ['L4', 0], ['L5', 0]]);
  assert.deepEqual(state.player.pos, [0, 0, 0]);
  assert.equal(state.player.flames, 3);
  assert.equal(state.player.carried, 0);
  assert.equal(state.timeLeft, 240);
  assert.equal(state.state, 'playing');
  assert.deepEqual(benchmarkCamera(0), [30, 15, 0]);
  assert.ok(Math.abs(benchmarkCamera(3.75)[0]) < 1e-9 && benchmarkCamera(3.75)[2] === 30);
  assert.ok(Math.abs(benchmarkCamera(15)[2]) < 1e-9 && benchmarkCamera(15)[0] === 30);
});

test('the configured soak runs ten seeded nights in one process with zero crashes and at most 20% RSS growth', t => {
  const path = directory(t);
  const run = file => {
    const result = cli('soak_cmd', ['--seed', '7', '--nights', '10', '--out', file]);
    assert.equal(result.status, 0, result.stderr + '\n' + readFileSync(file, 'utf8'));
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const first = run(join(path, 'first.json'));
  assert.deepEqual(Object.keys(first).sort(), ['crashes', 'duration_s', 'mem_end_mb', 'mem_start_mb', 'nights', 'results']);
  assert.equal(first.nights, 10);
  assert.equal(first.crashes, 0);
  assert.ok(first.mem_start_mb > 0 && first.mem_end_mb > 0 && first.mem_end_mb <= 1.2 * first.mem_start_mb);
  assert.ok(first.duration_s > 0);
  assert.deepEqual(first.results.map(({ night, seed }) => [night, seed]), Array.from({ length: 10 }, (_, i) => [i % 3 + 1, 7 + i]));
  for (const result of first.results) {
    assert.ok(['lost', 'won'].includes(result.state));
    assert.ok(result.ticks > 0 && result.ticks <= [14400, 16200, 18000][result.night - 1]);
  }
  assert.deepEqual(first.results, run(join(path, 'second.json')).results);
});

test('leaderboard ranks ties by timestamp across time zones and rejects invalid names and scores', async t => {
  const file = join(directory(t), 'scores.json');
  const store = createLeaderboard(file);
  const result = { name: 'May_42', score: 300, seed: 42, nights_won: 2 };
  const [early, late] = ['2026-11-20T21:50:00+07:00', '2026-11-20T15:00:00Z'];
  assert.deepEqual(rankEntries([{ ...result, achieved_at: late }, { ...result, achieved_at: early }]).map(entry => entry.achieved_at), [early, late]);
  for (const name of ['', 'AB', 'abcdefghijklmn', 'Mây', 'Lan Long']) assert.equal(validResult({ ...result, name }), false);
  for (const value of [{ score: -1 }, { score: 1.5 }, { nights_won: 4 }, { seed: NaN }]) assert.equal(validResult({ ...result, ...value }), false);
  await store.add(result, new Date(late));
  await store.add({ ...result, name: 'Early' }, new Date(early));
  assert.deepEqual((await store.read()).entries.map(entry => entry.name), ['Early', 'May_42']);
});

test('local API persists top 10 after restart and run_cmd exports the exact same records', async t => {
  const path = directory(t);
  const file = join(path, 'scores.json');
  const previous = process.env.DAO_DEN_LONG_LEADERBOARD;
  process.env.DAO_DEN_LONG_LEADERBOARD = file;
  t.after(() => {
    if (previous === undefined) delete process.env.DAO_DEN_LONG_LEADERBOARD;
    else process.env.DAO_DEN_LONG_LEADERBOARD = previous;
  });
  const web = await serve(0, path);
  const post = (url, data) => fetch(`${url}api/leaderboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const record = { name: 'May_42', score: 42, seed: 42, nights_won: 2 };
  try {
    assert.deepEqual(await (await fetch(`${web.url}api/leaderboard`)).json(), { entries: [] });
    assert.equal((await post(web.url, { ...record, name: 'x' })).status, 400);
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => post(web.url, { ...record, name: `May_${i}`, score: i })));
    assert.ok(replies.every(reply => reply.status === 201));
    await Promise.all(replies.map(reply => reply.json()));
    assert.equal((await (await post(web.url, { ...record, score: 1 })).json()).saved, false);
  } finally { await web.close(); }

  const restarted = await serve(0, path);
  try {
    const board = await (await fetch(`${restarted.url}api/leaderboard`)).json();
    assert.deepEqual(board.entries.map(entry => entry.score), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    assert.ok(board.entries.every(entry => entry.achieved_at.endsWith('Z') && entry.nights_won === 2 && entry.seed === 42));
    const output = join(path, 'export.json');
    const result = cli('run_cmd', ['--export-leaderboard', output]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), board);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), board);
  } finally { await restarted.close(); }
});

test('all nine controls can be rebound, duplicates are rejected and defaults can be restored', () => {
  assert.equal(rebind({}, 'jump', 'ArrowUp').conflict, 'forward');
  assert.equal(rebind({}, 'dash', 'Escape').conflict, 'pause');
  assert.ok(rebind({}, 'invalid', 'KeyN').error);
  let bindings = {};
  Object.keys(ACTION_LABELS).forEach((action, i) => {
    const key = `Digit${i + 1}`;
    bindings = rebind(bindings, action, key).bindings;
    assert.equal(actionFor(bindings, key), action);
  });
  assert.equal(Object.keys(bindings).length, 9);
  assert.equal(actionFor(bindings, 'KeyW'), undefined);
  assert.deepEqual(bindingKeys({}, 'forward'), ['KeyW', 'ArrowUp']);
  assert.equal(actionFor({}, 'Escape'), 'pause');
});

test('accessibility and a valid pair of swapped bindings survive a settings round trip', () => {
  const saved = { volume: 50, sensitivity: 135, accessiblePalette: true, reduceMotion: true, largeText: true,
    bindings: { dash: 'Space', jump: 'ShiftLeft' } };
  const restored = normalizeSettings(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, saved);
  assert.equal(normalizeSettings(undefined, true).reduceMotion, true);
  assert.equal(normalizeSettings({ reduceMotion: false }, true).reduceMotion, false);
  assert.deepEqual(normalizeSettings({ bindings: { pulse: 'KeyW' } }).bindings, {});
});

test('the Phase 3 replay remains byte-identical under Contract v1.3', t => {
  const out = join(directory(t), 'regression.jsonl');
  const result = cli('headless_cmd', ['--seed', '23', '--night', '1', '--ticks', '180', '--out', out,
    '--scenario', 'tests/fixtures/phase-3/scenario.json', '--inputs', 'tests/fixtures/phase-3/inputs.json']);
  assert.equal(result.status, 0, result.stderr);
  const phase3 = readFileSync(join(root, 'docs/proof/phase-3/oil-at-dawn.jsonl'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(readFileSync(out, 'utf8'), phase3);
});
