import { LANTERN_LAYOUT, TUNING as T } from '../core/config.ts';

function check(condition, path, expectation) {
  if (!condition) throw new Error(`${path}: ${expectation}`);
}

function object(value, path, keys) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'expected an object');
  for (const key of Object.keys(value)) {
    check(keys.includes(key), `${path}.${key}`, 'unknown field');
  }
}

function array(value, path) {
  check(Array.isArray(value), path, 'expected an array');
}

function number(value, path) {
  check(Number.isFinite(value), path, 'expected a finite number');
}

function count(value, path, maximum = Number.MAX_SAFE_INTEGER) {
  check(Number.isSafeInteger(value) && value >= 0 && value <= maximum, path, `expected an integer from 0 to ${maximum}`);
}

function boolean(value, path) {
  check(typeof value === 'boolean', path, 'expected a boolean');
}

function position(value, path) {
  check(Array.isArray(value) && value.length === 3 && value.every(Number.isFinite), path, 'expected [x, y, z] with finite numbers');
}

export function validateScenario(scenario) {
  object(scenario, 'scenario', ['player', 'random_motes', 'random_shades', 'motes', 'shades', 'lanterns', 'time_left_s']);
  const { player, motes, shades, lanterns } = scenario;
  if (player !== undefined) {
    object(player, 'scenario.player', ['pos', 'carried', 'flames']);
    if ('pos' in player) position(player.pos, 'scenario.player.pos');
    if ('carried' in player) count(player.carried, 'scenario.player.carried');
    if ('flames' in player) count(player.flames, 'scenario.player.flames');
  }
  for (const key of ['random_motes', 'random_shades']) {
    if (key in scenario) boolean(scenario[key], `scenario.${key}`);
  }
  if ('time_left_s' in scenario) {
    number(scenario.time_left_s, 'scenario.time_left_s');
    check(scenario.time_left_s >= 0, 'scenario.time_left_s', 'expected a non-negative time');
  }
  if (motes !== undefined) {
    array(motes, 'scenario.motes');
    motes.forEach((pos, index) => position(pos, `scenario.motes[${index}]`));
  }
  if (shades !== undefined) {
    array(shades, 'scenario.shades');
    const ids = new Set();
    shades.forEach((shade, index) => {
      const path = `scenario.shades[${index}]`;
      object(shade, path, ['id', 'pos']);
      position(shade.pos, `${path}.pos`);
      if ('id' in shade) {
        check(typeof shade.id === 'string' && shade.id.trim().length > 0 && !ids.has(shade.id), `${path}.id`, 'expected a unique non-empty string');
        ids.add(shade.id);
      }
    });
  }
  if (lanterns !== undefined) {
    array(lanterns, 'scenario.lanterns');
    const ids = new Set(LANTERN_LAYOUT.map(lantern => lantern.id));
    lanterns.forEach((lantern, index) => {
      const path = `scenario.lanterns[${index}]`;
      object(lantern, path, ['id', 'pos', 'lit', 'deposited']);
      check(ids.delete(lantern.id), `${path}.id`, 'expected a unique lantern ID from L1 to L5');
      if ('pos' in lantern) position(lantern.pos, `${path}.pos`);
      if ('lit' in lantern) boolean(lantern.lit, `${path}.lit`);
      if ('deposited' in lantern) count(lantern.deposited, `${path}.deposited`, T.lantern_cost);
    });
  }
  return scenario;
}

function readMove(frame, path) {
  const formats = ['move' in frame, 'x' in frame || 'z' in frame, 'move_x' in frame || 'move_z' in frame];
  check(formats.filter(Boolean).length <= 1, path, 'expected just one movement format');
  if ('move' in frame) {
    if (Array.isArray(frame.move)) {
      check(frame.move.length === 2 && frame.move.every(Number.isFinite), `${path}.move`, 'expected two finite components');
      return { x: frame.move[0], z: frame.move[1] };
    }
    object(frame.move, `${path}.move`, ['x', 'z']);
    number(frame.move.x, `${path}.move.x`);
    number(frame.move.z, `${path}.move.z`);
    return { x: frame.move.x, z: frame.move.z };
  }
  const movement = {};
  for (const axis of ['x', 'z']) {
    const key = formats[2] ? `move_${axis}` : axis;
    if (!(key in frame)) continue;
    number(frame[key], `${path}.${key}`);
    movement[axis] = frame[key];
  }
  return movement;
}

export function validateInputs(value) {
  let frames = value;
  if (!Array.isArray(value)) {
    object(value, 'inputs', ['inputs']);
    frames = value.inputs;
  }
  array(frames, 'inputs');
  let previous = -1;
  return frames.map((frame, index) => {
    const path = `inputs[${index}]`;
    object(frame, path, ['tick', 'x', 'z', 'move_x', 'move_z', 'move', 'cam_yaw_deg', 'jump', 'interact', 'pulse']);
    count(frame.tick, `${path}.tick`);
    check(frame.tick > previous, `${path}.tick`, 'ticks must be strictly increasing');
    previous = frame.tick;
    const input = { tick: frame.tick, ...readMove(frame, path) };
    if ('cam_yaw_deg' in frame) {
      number(frame.cam_yaw_deg, `${path}.cam_yaw_deg`);
      input.cam_yaw_deg = frame.cam_yaw_deg;
    }
    for (const action of ['jump', 'interact', 'pulse']) {
      if (!(action in frame)) continue;
      boolean(frame[action], `${path}.${action}`);
      input[action] = frame[action];
    }
    return input;
  });
}
