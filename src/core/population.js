import { TICK_S, TUNING as T, toTicks } from './config.ts';
import { groundHeight } from './maps.js';
import { byId, directionXZ, distanceXZ, inReach, offsetXZ } from './math.js';

const TURN = Math.PI * 2;

export function ids(prefix, overrides = []) {
  const taken = new Set(overrides.map(entry => entry.id).filter(id => id !== undefined));
  let next = 1;
  return () => {
    while (taken.has(`${prefix}${next}`)) next++;
    return `${prefix}${next++}`;
  };
}

export function createMotes(state, override) {
  if (override !== undefined) {
    for (const entry of override) addMote(state, entry.pos ?? entry, entry);
    return;
  }
  if (!state.randomMotes) return;
  const available = [...state.map.motePoints];
  for (let i = 0; i < T.starting_motes; i++) {
    const index = Math.floor(state.random() * available.length);
    addMote(state, available.splice(index, 1)[0]);
  }
}

function addMote(state, pos, options = {}) {
  const kind = options.kind ?? 'random';
  const mote = { id: options.id ?? state.nextMoteId(), pos: [...pos], kind, ttl: null };
  if (kind === 'dropped') mote.ttl = options.ttl_ticks ?? T.dropped_mote_ttl_ticks;
  state.motes.push(mote);
}

export function createCharms(map, overrides) {
  const generate = ids('C', overrides);
  return (overrides ?? map.charms).map(charm => {
    const id = charm.id ?? generate();
    const base = map.charms.find(entry => entry.id === id);
    return {
      id, pos: [...(charm.pos ?? base.pos)],
      respawn: charm.respawn_ticks ?? (charm.available === false ? T.charm_respawn_ticks : 0),
    };
  }).sort(byId);
}

export function decrementPopulation(state) {
  state.motes = state.motes.filter(mote => mote.ttl === null || --mote.ttl > 0);
  for (const charm of state.charms) if (charm.respawn > 0) charm.respawn--;
  state.drifters = state.drifters.filter(drifter => drifter.state !== 'removed');
  for (const drifter of state.drifters) {
    if (drifter.state === 'flee' && drifter.remaining > 0) drifter.remaining--;
  }
}

export function pickItems(state, emit) {
  const { player } = state;
  if (player.falling) return;
  state.motes = state.motes.filter(mote => {
    if (player.carried >= T.max_carried || !inReach(player.pos, mote.pos, T.pickup_radius, T.pickup_height_m)) return true;
    player.carried++;
    emit('mote_picked', { carried: player.carried });
    return false;
  });
  for (const charm of state.charms) {
    if (charm.respawn || !inReach(player.pos, charm.pos, T.pickup_radius, T.pickup_height_m)) continue;
    player.charm = T.charm_duration_ticks;
    charm.respawn = T.charm_respawn_ticks;
    emit('charm_picked', { charm_id: charm.id, charm_ticks: player.charm });
  }
}

export function dropFromHit(state, amount) {
  if (!amount) return;
  const angle = state.random() * TURN;
  for (let i = 0; i < amount; i++) {
    const radius = T.hit_drop_min_radius + state.random() * (T.hit_drop_max_radius - T.hit_drop_min_radius);
    const pos = offsetXZ(state.player.pos, angle + i * TURN / amount, radius);
    const floor = groundHeight(state.map, pos[0], pos[2]);
    if (Number.isFinite(floor)) pos[1] = floor;
    addMote(state, pos, { kind: 'dropped' });
  }
}

export function spawnMote(state) {
  if (!state.randomMotes || state.simTick % T.mote_spawn_interval_ticks || state.motes.length >= T.max_motes) return;
  const free = state.map.motePoints.filter(pos => !state.motes.some(mote =>
    Math.abs(mote.pos[1] - pos[1]) < 1e-6 && distanceXZ(mote.pos, pos) < 1e-6));
  if (free.length) addMote(state, free[Math.floor(state.random() * free.length)]);
}

export function createDrifter(state, options) {
  const angle = state.random() * TURN;
  const kind = options.state ?? 'idle';
  return {
    id: options.id ?? state.nextDrifterId(), pos: [...options.pos], state: kind,
    stolen: options.stolen ?? 0, angle,
    remaining: options.state_ticks_left ?? options.flee_ticks ?? (kind === 'flee' ? T.drifter_flee_ticks : 0),
    startedFlee: -1, fleeDir: directionXZ(state.player.pos, options.pos),
  };
}

export function spawnDrifter(state) {
  const { fogPoints } = state.map;
  if (!state.randomDrifters || !fogPoints.length || state.simTick % T.drifter_spawn_interval_ticks
    || state.drifters.filter(drifter => drifter.state !== 'removed').length >= T.max_drifters) return;
  const pos = fogPoints[Math.floor(state.random() * fogPoints.length)];
  state.drifters.push(createDrifter(state, { pos }));
}

function flee(state, drifter, ticks) {
  drifter.state = 'flee';
  drifter.remaining = ticks;
  drifter.startedFlee = state.simTick;
  drifter.fleeDir = directionXZ(state.player.pos, drifter.pos);
}

export function pulseDrifters(state, inPulse, emit) {
  for (const drifter of state.drifters) {
    if (!inPulse(drifter.pos)) continue;
    if (drifter.state === 'chase') {
      flee(state, drifter, T.drifter_flee_ticks);
    } else if (drifter.state === 'flee' && drifter.stolen > 0) {
      const amount = drifter.stolen;
      const pos = [...drifter.pos];
      const floor = groundHeight(state.map, pos[0], pos[2]);
      if (Number.isFinite(floor) && floor <= pos[1] + T.pickup_height_m) pos[1] = floor;
      for (let i = 0; i < amount; i++) addMote(state, pos, { kind: 'dropped' });
      drifter.stolen = 0;
      flee(state, drifter, T.drifter_drop_flee_ticks);
      emit('drifter_drop', { drifter_id: drifter.id, amount });
    }
  }
}

export function moveDrifters(state) {
  const { player } = state;
  for (const drifter of state.drifters) {
    if (drifter.state === 'removed') continue;
    if (drifter.state === 'flee') {
      if (drifter.startedFlee === state.simTick) continue;
      const [x, z] = drifter.fleeDir;
      drifter.pos[0] += x * T.drifter_speed_mps * TICK_S;
      drifter.pos[2] += z * T.drifter_speed_mps * TICK_S;
      if (!drifter.remaining) {
        drifter.state = 'removed';
        drifter.stolen = 0;
      }
      continue;
    }
    const distance = distanceXZ(drifter.pos, player.pos);
    if (!player.falling && player.carried >= T.drifter_min_carried && distance <= T.drifter_detect_radius) {
      drifter.state = 'chase';
      const [x, z] = directionXZ(drifter.pos, player.pos);
      const step = Math.min(distance, T.drifter_speed_mps * TICK_S);
      drifter.pos[0] += x * step;
      drifter.pos[2] += z * step;
    } else {
      drifter.state = 'idle';
      drifter.angle += 0.018;
      drifter.pos = offsetXZ(drifter.pos, drifter.angle, T.drifter_idle_speed_mps * TICK_S);
    }
  }
}

export function stealFromPlayer(state, emit) {
  if (state.player.falling) return;
  for (const drifter of state.drifters) {
    if (drifter.state !== 'chase' || !state.player.carried || distanceXZ(drifter.pos, state.player.pos) > T.drifter_hit_radius) continue;
    const amount = Math.min(T.drifter_steal_amount, state.player.carried);
    state.player.carried -= amount;
    drifter.stolen = amount;
    flee(state, drifter, T.drifter_flee_ticks);
    emit('drifter_steal', { drifter_id: drifter.id, amount, carried: state.player.carried });
  }
}

export function updateWind(state) {
  if (!state.wind.enabled) return;
  const period = toTicks(T.wind_interval_s);
  const lead = toTicks(T.wind_warning_s);
  const phase = state.simTick % period;
  if (phase === period - lead) {
    state.wind.radians = state.wind.random() * TURN;
    state.wind.warning = true;
  }
  if (phase === 0) {
    state.wind.warning = false;
    state.wind.active = true;
  } else if (phase === toTicks(T.wind_duration_s)) {
    state.wind.active = false;
  }
}
