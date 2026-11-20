import { TUNING as T } from './config.ts';
import { byId, distanceXZ } from './math.js';

export const MAX_FUEL_UNITS = T.fuel_max * T.tick_hz;
const LOW_FUEL_UNITS = T.low_fuel_threshold * T.tick_hz;
const FUEL_UNITS_PER_MOTE = T.fuel_per_mote * T.tick_hz;

export const displayFuel = units => Math.round(units * 10 / T.tick_hz) / 10;
export const lanternCost = everLit => everLit ? T.relight_cost : T.lantern_cost;
export const lowFuel = lamp => lamp.lit && lamp.fuelUnits < LOW_FUEL_UNITS;
export const providesSafety = lamp => lamp.lit && lamp.fuelUnits >= LOW_FUEL_UNITS;
export const requiredLit = total => Math.ceil(T.win_ratio * total);

export function createLantern({ id, pos }, override = {}) {
  const deposited = override.deposited ?? 0;
  const lit = override.lit ?? (override.fuel > 0 || deposited === lanternCost(override.ever_lit));
  return {
    id, pos: [...(override.pos ?? pos)], deposited, lit,
    fuelUnits: lit ? Math.round((override.fuel ?? T.fuel_max) * T.tick_hz) : 0,
    everLit: lit || Boolean(override.ever_lit), relitCount: 0,
  };
}

export function nearestLantern(lanterns, pos, radius, eligible) {
  let nearest;
  let best = Infinity;
  for (const lamp of lanterns) {
    if (!eligible(lamp)) continue;
    const distance = distanceXZ(lamp.pos, pos);
    if (distance <= radius && (!nearest || distance < best || (distance === best && byId(lamp, nearest) < 0))) {
      nearest = lamp;
      best = distance;
    }
  }
  return nearest;
}

export function nearestServiceLantern(state) {
  return nearestLantern(state.lanterns, state.player.pos, T.interact_radius, lamp => !lamp.lit || lamp.fuelUnits < MAX_FUEL_UNITS);
}

export function drainTarget(lanterns, shade) {
  return lanterns.find(lamp => lamp.id === shade.targetLanternId && lowFuel(lamp) && distanceXZ(lamp.pos, shade.pos) <= T.drain_radius);
}

export function decrementFuel(state, emit) {
  const reports = [];
  // Resolve all contributors before changing any target's fuel or status.
  const lossByLamp = new Map();
  for (const shade of state.shades) {
    if (shade.state !== 'drain') continue;
    const target = drainTarget(state.lanterns, shade);
    if (!target) continue;
    lossByLamp.set(target, (lossByLamp.get(target) ?? 0) + T.drain_per_s);
    if (++shade.drainTicks % T.tick_hz === 0) reports.push({ shade, target });
  }
  for (const lamp of state.lanterns) {
    if (lamp.lit) lamp.fuelUnits = Math.max(0, lamp.fuelUnits - T.fuel_decay_per_s - (lossByLamp.get(lamp) ?? 0));
  }
  for (const { shade, target } of reports) {
    emit('fuel_drain', { lantern_id: target.id, shade_id: shade.id, fuel: displayFuel(target.fuelUnits) });
  }
  for (const lamp of state.lanterns) {
    if (!lamp.lit || lamp.fuelUnits > 0) continue;
    lamp.lit = false;
    lamp.deposited = 0;
    emit('lantern_out', { lantern_id: lamp.id });
  }
}

export function serviceLantern(state, emit) {
  const { player } = state;
  if (player.falling) return;
  const lamp = nearestServiceLantern(state);
  if (!lamp) return;
  const cost = lanternCost(lamp.everLit);
  const amount = Math.min(player.carried, lamp.lit ? Math.ceil((MAX_FUEL_UNITS - lamp.fuelUnits) / FUEL_UNITS_PER_MOTE) : cost - lamp.deposited);
  if (amount > 0) {
    player.carried -= amount;
    state.score += amount * T.score_mote;
    if (lamp.lit) {
      lamp.fuelUnits = Math.min(MAX_FUEL_UNITS, lamp.fuelUnits + amount * FUEL_UNITS_PER_MOTE);
      emit('refuel', { lantern_id: lamp.id, amount, fuel: displayFuel(lamp.fuelUnits) });
      return;
    }
    lamp.deposited += amount;
    emit('deposit', { lantern_id: lamp.id, amount, deposited: lamp.deposited });
  }
  if (!lamp.lit && lamp.deposited >= cost) {
    const relight = lamp.everLit;
    lamp.lit = lamp.everLit = true;
    lamp.fuelUnits = MAX_FUEL_UNITS;
    lamp.relitCount += Number(relight);
    player.successfulLights++;
    state.score += relight ? T.score_relight : T.score_lantern;
    emit('lantern_lit', { lantern_id: lamp.id, relight });
  }
}
