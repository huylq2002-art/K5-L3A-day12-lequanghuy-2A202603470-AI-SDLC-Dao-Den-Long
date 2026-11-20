import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createGame, makeSnapshot, stepGame } from '../core/game.js';
import { validateInputs, validateScenario } from './validate.js';

const FLAGS = new Set(['seed', 'night', 'scenario', 'inputs', 'ticks', 'out', 'snapshot-every']);

function integer(value, name, minimum) {
  const parsed = Number(value);
  if (!/^[+-]?\d+$/.test(value ?? '') || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`--${name} requires an integer >= ${minimum}`);
  }
  return parsed;
}

function parseArgs(args) {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const key = flag.slice(2);
    if (!flag.startsWith('--') || !FLAGS.has(key) || flags.has(key)) throw new Error(`Unknown or repeated option ${flag}`);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    flags.set(key, value);
  }
  const seed = integer(flags.get('seed'), 'seed', Number.MIN_SAFE_INTEGER);
  const ticks = integer(flags.get('ticks'), 'ticks', 0);
  if (flags.get('night') !== '1') throw new Error('--night must be 1');
  if (!flags.has('out')) throw new Error('--out is required');
  const snapshotEvery = integer(flags.get('snapshot-every') ?? '10', 'snapshot-every', 1);
  return { seed, ticks, snapshotEvery, flags };
}

function readJson(path, description) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Cannot read ${description} ${path}: ${error.message}`);
  }
}

function run(args) {
  const { seed, ticks, snapshotEvery, flags } = parseArgs(args);
  const scenario = flags.has('scenario') ? validateScenario(readJson(flags.get('scenario'), 'scenario')) : {};
  const frames = flags.has('inputs') ? validateInputs(readJson(flags.get('inputs'), 'inputs')) : [];
  const state = createGame(seed, scenario);
  const file = openSync(flags.get('out'), 'w');
  let buffer = '';
  const write = record => {
    buffer += `${JSON.stringify(record)}\n`;
    if (buffer.length >= 65_536) {
      writeFileSync(file, buffer);
      buffer = '';
    }
  };
  try {
    write(makeSnapshot(state));
    let index = 0;
    const input = { x: 0, z: 0, cam_yaw_deg: 0 };
    while (state.tick < ticks && state.state === 'playing') {
      const frame = frames[index]?.tick === state.tick ? frames[index++] : undefined;
      input.x = frame?.x ?? input.x;
      input.z = frame?.z ?? input.z;
      input.cam_yaw_deg = frame?.cam_yaw_deg ?? input.cam_yaw_deg;
      input.jump = frame?.jump ?? false;
      input.interact = frame?.interact ?? false;
      input.pulse = frame?.pulse ?? false;
      for (const event of stepGame(state, input)) write(event);
      if (state.tick % snapshotEvery === 0) write(makeSnapshot(state));
    }
    write({ type: 'end', ticks: state.tick, state: state.state, score: state.score });
    if (buffer) writeFileSync(file, buffer);
  } finally {
    closeSync(file);
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
