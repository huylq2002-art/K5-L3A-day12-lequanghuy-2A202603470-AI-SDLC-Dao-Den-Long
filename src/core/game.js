import { LANTERN_LAYOUT, TICK_S, TUNING as T } from './config.ts';
import { confineToIsland, distanceXZ, offsetXZ, rotateMove, seededRandom } from './math.js';
import { chase, ejectFromLight, insideSafeZone, pushFromPlayer } from './shades.js';

const TURN = 2 * Math.PI;
const toTicks = seconds => Math.round(seconds * T.tick_hz);

function addMote(state, pos) {
  state.motes.push({ id: `M${state.nextMoteId++}`, pos: [...pos] });
}

function addShade(state, pos, id) {
  if (id === undefined) {
    do {
      id = `S${state.nextShadeId++}`;
    } while (state.shadeIds.has(id));
    state.shadeIds.add(id);
  }
  state.shades.push({ id, pos: [...pos], state: 'chase', stunnedUntil: 0 });
  return id;
}

function populateMotes(state) {
  for (const lantern of state.lanterns) {
    const angle = Math.atan2(lantern.pos[2], lantern.pos[0]);
    for (let i = 0; i < 7; i++) {
      const distance = 3.6 + i * 2.8;
      const pos = offsetXZ(lantern.pos, angle + Math.PI + (state.random() - 0.5) * 0.14, distance);
      addMote(state, confineToIsland([pos[0], 0, pos[2]]));
    }
  }
  for (let i = 0; i < 18; i++) {
    const angle = state.random() * TURN;
    const distance = Math.sqrt(state.random()) * (T.island_radius - 3);
    addMote(state, offsetXZ([0, 0, 0], angle, distance));
  }
}

export function createGame(seed = 1, scenario = {}) {
  const lanterns = LANTERN_LAYOUT.map(({ id, pos }) => {
    const override = scenario.lanterns?.find(lantern => lantern.id === id);
    const deposited = override?.deposited ?? 0;
    return { id, pos: [...(override?.pos ?? pos)], deposited, lit: override?.lit ?? deposited === T.lantern_cost };
  });
  const duration = scenario.time_left_s ?? T.night1_duration_s;
  const state = {
    tick: 0,
    state: 'playing',
    reason: null,
    duration,
    timeLeft: duration,
    score: 0,
    random: seededRandom(seed),
    randomShades: scenario.random_shades ?? true,
    nextMoteId: 1,
    nextShadeId: 1,
    nextSpawnTick: toTicks(T.shade_first_spawn_s),
    shadeIds: new Set(scenario.shades?.map(shade => shade.id).filter(id => id !== undefined)),
    player: {
      pos: [...(scenario.player?.pos ?? [0, 0, 0])],
      carried: scenario.player?.carried ?? 0,
      flames: scenario.player?.flames ?? T.starting_flames,
      facing: 0,
      verticalSpeed: 0,
      invulnerableUntil: 0,
      pulseReadyTick: 0,
    },
    lanterns,
    shades: [],
    motes: [],
  };
  if (scenario.motes !== undefined) {
    for (const pos of scenario.motes) addMote(state, pos);
  } else if (scenario.random_motes !== false) {
    populateMotes(state);
  }
  for (const { pos, id } of scenario.shades ?? []) {
    addShade(state, pos, id);
  }
  return state;
}

function movePlayer(player, input) {
  const [x, z] = rotateMove(input.x ?? 0, input.z ?? 0, input.cam_yaw_deg ?? 0);
  if (x || z) {
    const step = T.move_speed_mps * TICK_S;
    player.pos = confineToIsland([player.pos[0] + x * step, player.pos[1], player.pos[2] + z * step]);
    player.facing = Math.atan2(x, z);
  }
  if (input.jump && player.pos[1] === 0) player.verticalSpeed = T.jump_speed_mps;
  if (player.verticalSpeed || player.pos[1] !== 0) {
    player.pos[1] = Math.max(0, player.pos[1] + player.verticalSpeed * TICK_S);
    player.verticalSpeed -= T.gravity_mps2 * TICK_S;
    if (player.pos[1] === 0) player.verticalSpeed = 0;
  }
}

function pickMotes(state, emit) {
  const { player } = state;
  state.motes = state.motes.filter(mote => {
    if (distanceXZ(mote.pos, player.pos) > T.pickup_radius) return true;
    player.carried++;
    state.score += T.score_mote;
    emit('mote_picked', { carried: player.carried });
    return false;
  });
}

export function nearestUnlitLantern(state) {
  const { player } = state;
  let nearest;
  let nearestDistance = Infinity;
  for (const lantern of state.lanterns) {
    if (lantern.lit) continue;
    const distance = distanceXZ(lantern.pos, player.pos);
    if (distance <= T.interact_radius && distance < nearestDistance) {
      nearest = lantern;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function deposit(state, emit) {
  const { player } = state;
  const nearest = nearestUnlitLantern(state);
  if (!nearest) return;
  const amount = Math.min(player.carried, T.lantern_cost - nearest.deposited);
  if (amount > 0) {
    player.carried -= amount;
    nearest.deposited += amount;
    emit('deposit', { lantern_id: nearest.id, amount, deposited: nearest.deposited });
  }
  if (nearest.deposited === T.lantern_cost) {
    nearest.lit = true;
    state.score += T.score_lantern;
    emit('lantern_lit', { lantern_id: nearest.id });
  }
}

function spawnShade(state, litLanterns, emit) {
  if (!state.randomShades || state.tick !== state.nextSpawnTick) return;
  state.nextSpawnTick += toTicks(T.shade_spawn_interval_s);
  if (state.shades.length >= T.max_shades) return;
  const startAngle = state.random() * TURN;
  const candidates = Array.from({ length: 24 }, (_, i) =>
    offsetXZ([0, 0, 0], startAngle + i * TURN / 24, T.island_radius - 2));
  const pos = candidates.find(point =>
    !insideSafeZone(point, litLanterns) && distanceXZ(point, state.player.pos) > T.pulse_radius);
  if (pos) emit('shade_spawned', { id: addShade(state, ejectFromLight(pos, litLanterns)) });
}

function pulse(state, litLanterns, emit) {
  const { player, tick } = state;
  if (player.carried < T.pulse_cost || tick < player.pulseReadyTick) return;
  player.carried -= T.pulse_cost;
  player.pulseReadyTick = tick + toTicks(T.pulse_cooldown_s);
  const stunnedIds = [];
  for (const shade of state.shades) {
    if (distanceXZ(shade.pos, player.pos) > T.pulse_radius) continue;
    shade.pos = pushFromPlayer(shade, player, litLanterns);
    shade.stunnedUntil = tick + toTicks(T.pulse_stun_s);
    stunnedIds.push(shade.id);
  }
  emit('pulse', { stunned_ids: stunnedIds });
}

function hitPlayer(state, emit) {
  const { player, tick } = state;
  player.flames--;
  player.invulnerableUntil = tick + toTicks(T.invuln_s);
  const dropped = Math.floor(player.carried * T.hit_drop_ratio);
  player.carried -= dropped;
  const angle = dropped ? state.random() * TURN : 0;
  for (let i = 0; i < dropped; i++) {
    const pos = offsetXZ(player.pos, angle + i * TURN / dropped, T.pickup_radius + 0.85);
    addMote(state, confineToIsland([pos[0], 0, pos[2]]));
  }
  emit('player_hit', { by: 'shade', flames: player.flames, dropped });
}

function finish(state, result, reason, emit) {
  state.state = result;
  state.reason = reason;
  if (result === 'won') state.score += T.score_win;
  emit('game_over', { result, reason });
}

export function stepGame(state, input = {}) {
  if (state.state !== 'playing') return [];
  state.tick++;
  state.timeLeft = Math.max(0, state.duration - state.tick / T.tick_hz);
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: state.tick, name, data });
  if (state.player.flames === 0 || state.duration === 0) {
    finish(state, 'lost', state.player.flames === 0 ? 'no_flames' : 'dawn', emit);
    return events;
  }

  movePlayer(state.player, input);
  pickMotes(state, emit);
  if (input.interact) deposit(state, emit);
  const litLanterns = state.lanterns.filter(lantern => lantern.lit);
  for (const shade of state.shades) shade.pos = ejectFromLight(shade.pos, litLanterns);
  if (litLanterns.length === state.lanterns.length) {
    finish(state, 'won', 'all_lit', emit);
    return events;
  }

  spawnShade(state, litLanterns, emit);
  if (input.pulse) pulse(state, litLanterns, emit);
  const protectedByLight = insideSafeZone(state.player.pos, litLanterns);
  for (const shade of state.shades) {
    if (state.tick < shade.stunnedUntil) {
      shade.state = 'stunned';
      continue;
    }
    shade.state = 'chase';
    const wasInReach = distanceXZ(shade.pos, state.player.pos) <= T.shade_hit_radius;
    shade.pos = chase(shade, state.player.pos, litLanterns);
    if (!protectedByLight && state.tick >= state.player.invulnerableUntil
      && (wasInReach || distanceXZ(shade.pos, state.player.pos) <= T.shade_hit_radius)) {
      hitPlayer(state, emit);
    }
  }
  if (state.player.flames === 0) finish(state, 'lost', 'no_flames', emit);
  else if (state.timeLeft === 0) finish(state, 'lost', 'dawn', emit);
  return events;
}

function roundedPos(pos) {
  return pos.map(value => Number(value.toFixed(3)));
}

export function makeSnapshot(state) {
  return {
    type: 'snapshot',
    tick: state.tick,
    sim_tick: state.tick,
    state: state.state,
    time_left_s: state.timeLeft,
    score: state.score,
    player: { pos: roundedPos(state.player.pos), flames: state.player.flames, carried: state.player.carried },
    lanterns: state.lanterns.map(({ id, pos, lit, deposited }) => ({ id, pos: roundedPos(pos), lit, deposited })),
    shades: state.shades.map(({ id, pos, state: shadeState }) => ({ id, pos: roundedPos(pos), state: shadeState })),
    motes_active: state.motes.length,
    motes: state.motes.map(({ id, pos }) => ({ id, pos: roundedPos(pos) })),
  };
}
