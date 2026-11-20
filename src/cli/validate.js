import { DRIFTER_STATES, SHADE_STATES, TUNING as T } from '../core/config.ts';
import { lanternCost } from '../core/lanterns.js';
import { NIGHTS } from '../core/maps.js';
import { capacityFor } from '../core/player.js';

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

function entities(list, name, checkEntry) {
  if (list === undefined) return;
  const path = `scenario.${name}`;
  array(list, path);
  const ids = new Set();
  list.forEach((entry, i) => {
    const item = `${path}[${i}]`;
    checkEntry(entry, item);
    if (entry.id === undefined) return;
    check(typeof entry.id === 'string' && entry.id.trim().length > 0 && !ids.has(entry.id), `${item}.id`, 'expected a unique non-empty string');
    ids.add(entry.id);
  });
}

export function validateScenario(scenario, night) {
  const flags = ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'];
  object(scenario, 'scenario', ['player', 'motes', 'shades', 'lanterns', 'drifters', 'charms', 'time_left_s', ...flags]);
  const { player, motes, shades, lanterns, drifters, charms } = scenario;
  const lanternIds = new Set(NIGHTS[night].lanterns.map(lantern => lantern.id));
  if (player !== undefined) {
    const timers = ['invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks'];
    object(player, 'scenario.player', ['pos', 'carried', 'flames', 'successful_lights', ...timers]);
    if ('pos' in player) position(player.pos, 'scenario.player.pos');
    if ('successful_lights' in player) count(player.successful_lights, 'scenario.player.successful_lights');
    if ('carried' in player) count(player.carried, 'scenario.player.carried', capacityFor(player.successful_lights ?? 0));
    if ('flames' in player) count(player.flames, 'scenario.player.flames', T.starting_flames);
    for (const key of timers) if (key in player) count(player[key], `scenario.player.${key}`);
  }
  for (const key of flags) {
    if (key in scenario) boolean(scenario[key], `scenario.${key}`);
  }
  if ('time_left_s' in scenario) {
    number(scenario.time_left_s, 'scenario.time_left_s');
    check(scenario.time_left_s >= 0, 'scenario.time_left_s', 'expected a non-negative time');
  }
  entities(motes, 'motes', (mote, path) => {
    if (Array.isArray(mote)) return position(mote, path);
    object(mote, path, ['id', 'pos', 'kind', 'ttl_ticks']);
    position(mote.pos, `${path}.pos`);
    if ('kind' in mote) check(['random', 'dropped'].includes(mote.kind), `${path}.kind`, 'expected random or dropped');
    if ('ttl_ticks' in mote) count(mote.ttl_ticks, `${path}.ttl_ticks`);
  });
  entities(shades, 'shades', (shade, path) => {
    object(shade, path, ['id', 'pos', 'state', 'state_ticks_left', 'target_lantern_id']);
    position(shade.pos, `${path}.pos`);
    if ('state' in shade) check(SHADE_STATES.includes(shade.state), `${path}.state`, 'invalid shade state');
    if ('state_ticks_left' in shade) count(shade.state_ticks_left, `${path}.state_ticks_left`);
    if ('target_lantern_id' in shade) check(lanternIds.has(shade.target_lantern_id), `${path}.target_lantern_id`, 'expected a lantern ID for this night');
  });
  entities(drifters, 'drifters', (drifter, path) => {
    object(drifter, path, ['id', 'pos', 'state', 'stolen', 'state_ticks_left', 'flee_ticks']);
    position(drifter.pos, `${path}.pos`);
    if ('state' in drifter) check(DRIFTER_STATES.includes(drifter.state), `${path}.state`, 'invalid drifter state');
    if ('stolen' in drifter) count(drifter.stolen, `${path}.stolen`, T.drifter_steal_amount);
    for (const timer of ['state_ticks_left', 'flee_ticks']) if (timer in drifter) count(drifter[timer], `${path}.${timer}`);
  });
  entities(charms, 'charms', (charm, path) => {
    object(charm, path, ['id', 'pos', 'available', 'respawn_ticks']);
    if ('pos' in charm) position(charm.pos, `${path}.pos`);
    else check(NIGHTS[night].charms.some(entry => entry.id === charm.id), `${path}.pos`, 'expected a position or a standard charm ID');
    if ('available' in charm) boolean(charm.available, `${path}.available`);
    if ('respawn_ticks' in charm) count(charm.respawn_ticks, `${path}.respawn_ticks`);
  });
  if (lanterns !== undefined) {
    array(lanterns, 'scenario.lanterns');
    lanterns.forEach((lantern, index) => {
      const path = `scenario.lanterns[${index}]`;
      object(lantern, path, ['id', 'pos', 'lit', 'deposited', 'fuel', 'ever_lit']);
      check(lanternIds.delete(lantern.id), `${path}.id`, `expected a unique lantern ID from L1 to L${NIGHTS[night].lanterns.length}`);
      if ('pos' in lantern) position(lantern.pos, `${path}.pos`);
      if ('lit' in lantern) boolean(lantern.lit, `${path}.lit`);
      if ('ever_lit' in lantern) boolean(lantern.ever_lit, `${path}.ever_lit`);
      if ('fuel' in lantern) {
        number(lantern.fuel, `${path}.fuel`);
        check(lantern.fuel >= 0 && lantern.fuel <= T.fuel_max, `${path}.fuel`, `expected fuel from 0 to ${T.fuel_max}`);
      }
      if ('deposited' in lantern) {
        const lit = lantern.lit ?? lantern.fuel > 0;
        count(lantern.deposited, `${path}.deposited`, lit ? T.lantern_cost : lanternCost(lantern.ever_lit));
      }
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
    const actions = ['jump', 'interact', 'pulse', 'dash', 'pause'];
    object(frame, path, ['tick', 'x', 'z', 'move_x', 'move_z', 'move', 'cam_yaw_deg', ...actions]);
    count(frame.tick, `${path}.tick`);
    check(frame.tick > previous, `${path}.tick`, 'ticks must be strictly increasing');
    previous = frame.tick;
    const input = { tick: frame.tick, ...readMove(frame, path) };
    if ('cam_yaw_deg' in frame) {
      number(frame.cam_yaw_deg, `${path}.cam_yaw_deg`);
      input.cam_yaw_deg = frame.cam_yaw_deg;
    }
    for (const action of actions) {
      if (!(action in frame)) continue;
      boolean(frame[action], `${path}.${action}`);
      input[action] = frame[action];
    }
    return input;
  });
}
