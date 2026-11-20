import { TUNING as T, toTicks } from './config.ts';
import { NIGHTS } from './maps.js';
import { byId, distanceXZ, seededRandom } from './math.js';
import { createPlayer, decrementPlayer, movePlayer } from './player.js';
import {
  createCharms, createDrifter, createMotes, decrementPopulation, ids, moveDrifters,
  pickItems, pulseDrifters, spawnDrifter, spawnMote, stealFromPlayer, updateWind,
} from './population.js';
import { createShade, decrementShades, hitFromShades, moveShades, pulseShades, spawnShades, updateSafeZones } from './shades.js';

export function createGame(seed = 1, scenario = {}, night = 1) {
  const map = NIGHTS[night];
  if (!map) throw new RangeError(`Unknown night ${night}`);
  const duration = scenario.time_left_s ?? map.duration;
  const state = {
    night, map, tick: 0, simTick: 0, state: 'playing', reason: null,
    duration, timeLeft: duration, score: 0,
    random: seededRandom(seed),
    wind: { enabled: scenario.wind_enabled ?? Boolean(map.wind), active: false, warning: false, radians: 0, random: seededRandom(BigInt(seed) ^ 0x4cd855cen) },
    randomMotes: scenario.random_motes ?? true,
    randomShades: scenario.random_shades ?? true,
    randomDrifters: scenario.random_drifters ?? true,
    previousDash: false, previousPause: false,
    nextMoteId: ids('M', scenario.motes), nextShadeId: ids('S', scenario.shades), nextDrifterId: ids('D', scenario.drifters),
    player: createPlayer(map, scenario.player),
    lanterns: map.lanterns.map(({ id, pos }) => {
      const override = scenario.lanterns?.find(lamp => lamp.id === id);
      const deposited = override?.deposited ?? 0;
      return { id, pos: [...(override?.pos ?? pos)], deposited, lit: override?.lit ?? deposited === T.lantern_cost };
    }),
    motes: [], shades: [], drifters: [], charms: createCharms(map, scenario.charms),
  };
  createMotes(state, scenario.motes);
  state.shades = (scenario.shades ?? []).map(options => createShade(state, options)).sort(byId);
  state.drifters = (scenario.drifters ?? []).map(options => createDrifter(state, options)).sort(byId);
  return state;
}

export function nightStart(state) {
  return { type: 'event', tick: 0, name: 'night_start', data: { night: state.night } };
}

export function nearestUnlitLantern(state, radius = T.interact_radius) {
  let nearest;
  let best = Infinity;
  for (const lamp of state.lanterns) {
    if (lamp.lit) continue;
    const distance = distanceXZ(lamp.pos, state.player.pos);
    if (distance <= radius && (!nearest || distance < best || (distance === best && byId(lamp, nearest) < 0))) {
      nearest = lamp;
      best = distance;
    }
  }
  return nearest;
}

function deposit(state, emit) {
  const { player } = state;
  if (player.falling) return;
  const lamp = nearestUnlitLantern(state);
  if (!lamp) return;
  const amount = Math.min(player.carried, T.lantern_cost - lamp.deposited);
  if (amount > 0) {
    player.carried -= amount;
    lamp.deposited += amount;
    state.score += amount * T.score_mote;
    emit('deposit', { lantern_id: lamp.id, amount, deposited: lamp.deposited });
  }
  if (lamp.deposited === T.lantern_cost) {
    lamp.lit = true;
    state.score += T.score_lantern;
    emit('lantern_lit', { lantern_id: lamp.id });
  }
}

function pulse(state, emit) {
  const { player } = state;
  if (player.falling || player.pulseCd || player.carried < T.pulse_cost) return;
  player.carried -= T.pulse_cost;
  player.pulseCd = toTicks(T.pulse_cooldown_s);
  const [x, y, z] = player.pos;
  const inPulse = pos => Math.hypot(x - pos[0], y + T.pulse_center_height_m - pos[1], z - pos[2]) <= T.pulse_radius;
  emit('pulse', { stunned_ids: pulseShades(state, inPulse) });
  pulseDrifters(state, inPulse, emit);
}

function finish(state, emit) {
  if (!state.player.flames) state.reason = 'no_flames';
  else if (state.lanterns.every(lamp => lamp.lit)) state.reason = 'all_lit';
  else if (!state.timeLeft) state.reason = 'dawn';
  if (!state.reason) return;
  state.state = state.reason === 'all_lit' ? 'won' : 'lost';
  if (state.state === 'won') {
    state.score += Math.floor(state.timeLeft) * T.score_win_second + state.player.flames * T.score_win_flame;
  }
  emit('game_over', { result: state.state, reason: state.reason });
}

export function stepGame(state, input = {}) {
  if (state.state === 'won' || state.state === 'lost') return [];
  state.tick++;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: state.tick, name, data });

  // 1. Consume button edges even when paused so held keys cannot retrigger on resume.
  const dashPressed = Boolean(input.dash) && !state.previousDash;
  const pausePressed = Boolean(input.pause) && !state.previousPause;
  state.previousDash = Boolean(input.dash);
  state.previousPause = Boolean(input.pause);
  if (pausePressed) {
    state.state = state.state === 'paused' ? 'playing' : 'paused';
    emit(state.state === 'paused' ? 'paused' : 'resumed', {});
  }
  if (state.state === 'paused') return events;

  // 2. Clock and countdowns.
  state.simTick++;
  state.timeLeft = Math.max(0, state.duration - state.simTick / T.tick_hz);
  decrementPlayer(state.player);
  decrementShades(state);
  decrementPopulation(state);
  updateWind(state);

  if (state.player.flames > 0) {
    movePlayer(state.player, state.map, state.wind, input, dashPressed, emit); // 3
    pickItems(state, emit); // 4
    if (input.interact) deposit(state, emit); // 5
    const lamps = state.lanterns.filter(lamp => lamp.lit);
    updateSafeZones(state, lamps); // 6
    if (input.pulse) pulse(state, emit); // 7
    moveShades(state, lamps); // 8
    moveDrifters(state);
    stealFromPlayer(state, emit); // 9
    hitFromShades(state, lamps, emit);
    spawnMote(state); // 10
    spawnShades(state, lamps, emit);
    spawnDrifter(state);
  }
  finish(state, emit); // 11. The caller captures the periodic snapshot (12).
  return events;
}

const rounded = value => Number(value.toFixed(3));
const vector = values => values.map(rounded);
const seconds = ticks => ticks / T.tick_hz;

export function makeSnapshot(state) {
  const { player, wind } = state;
  return {
    type: 'snapshot', tick: state.tick, sim_tick: state.simTick, state: state.state,
    night: state.night, time_left_s: state.timeLeft, score: state.score,
    wind: { active: wind.active, dir_deg: rounded(wind.radians * 180 / Math.PI) },
    player: {
      pos: vector(player.pos), vel: vector([player.vel[0] + player.windDrift[0], player.vel[1], player.vel[2] + player.windDrift[1]]), grounded: player.grounded,
      flames: player.flames, carried: player.carried, invuln: player.invuln > 0,
      dash_cd_s: seconds(player.charm ? 0 : player.dashCd), pulse_cd_s: seconds(player.pulseCd), charm_s: seconds(player.charm),
    },
    lanterns: state.lanterns.map(({ id, pos, lit, deposited }) => ({ id, pos: vector(pos), lit, deposited })),
    shades: state.shades.map(({ id, pos, state: kind }) => ({ id, pos: vector(pos), state: kind })),
    motes_active: state.motes.length,
    motes: state.motes.map(({ id, pos, kind, ttl }) => ({ id, pos: vector(pos), kind, ttl_s: ttl === null ? null : seconds(ttl) })),
    drifters: state.drifters.map(({ id, pos, state: kind, stolen }) => ({ id, pos: vector(pos), state: kind, stolen })),
    charms: state.charms.map(({ id, respawn }) => ({ id, available: respawn === 0, respawn_s: seconds(respawn) })),
  };
}
