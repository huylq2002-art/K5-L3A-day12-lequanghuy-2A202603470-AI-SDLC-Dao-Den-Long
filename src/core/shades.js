import { TICK_S, TUNING as T, toTicks } from './config.ts';
import { groundHeight, towerBlocks } from './maps.js';
import { byId, directionXZ, distanceXZ, inReach, offsetXZ } from './math.js';
import { dropFromHit } from './population.js';

const TAU = Math.PI * 2;
const BOUNDARY = T.safe_radius + 0.001;

export function insideSafeZone(pos, lamps, radius = T.safe_radius) {
  return lamps.some(lamp => distanceXZ(pos, lamp.pos) <= radius);
}

function makePush(from, to, meters, ticks) {
  const [x, z] = directionXZ(from, to);
  return { x: x * meters / ticks, z: z * meters / ticks, remaining: ticks };
}

export function createShade(state, options) {
  const kind = options.state ?? 'chase';
  const remaining = options.state_ticks_left ?? ({ spawning: 1, stunned: toTicks(T.pulse_stun_s), recoil: T.shade_recoil_ticks }[kind] ?? 0);
  const push = kind === 'recoil' && remaining > 0
    ? { ...makePush(state.player.pos, options.pos, T.shade_recoil_m, T.shade_recoil_ticks), remaining: Math.min(remaining, T.shade_recoil_ticks) }
    : null;
  return {
    id: options.id ?? state.nextShadeId(), pos: [...options.pos], state: kind,
    remaining, push,
    escape: null, angle: state.random() * TAU, skipContact: false,
  };
}

export function decrementShades(state) {
  for (const shade of state.shades) {
    if (shade.remaining > 0) shade.remaining--;
    if (!shade.remaining && (shade.state === 'spawning' || shade.state === 'stunned' || (shade.state === 'recoil' && !shade.push))) {
      shade.state = 'wander';
    }
  }
}

// Clip the entire segment against each disc, including long straight knockbacks.
function clipLight(from, to, lamps) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (!len) return to;
  let fraction = 1;
  for (const { pos } of lamps) {
    const x = pos[0] - from[0];
    const z = pos[2] - from[2];
    const forward = (x * dx + z * dz) / len;
    const side = (x * dz - z * dx) / len;
    if (forward <= 0 || Math.abs(side) > BOUNDARY) continue;
    const entrance = forward - Math.sqrt(BOUNDARY ** 2 - side ** 2);
    fraction = Math.min(fraction, Math.max(0, (entrance - 1e-6) / len));
  }
  return fraction === 1 ? to : [from[0] + dx * fraction, from[1], from[2] + dz * fraction];
}

function moveOnGround(map, from, to, lamps) {
  const next = clipLight(from, to, lamps);
  const oldFloor = groundHeight(map, from[0], from[2]);
  const floor = groundHeight(map, next[0], next[2]);
  if (Number.isFinite(oldFloor)) {
    if (Math.abs(floor - oldFloor) > 0.24) return from;
    next[1] = from[1] + floor - oldFloor;
  }
  return towerBlocks(map, from, next) ? from : next;
}

function escapePoint(pos, lamps, map) {
  const lamp = lamps.find(entry => distanceXZ(pos, entry.pos) <= BOUNDARY);
  const angle = Math.atan2(pos[2] - lamp.pos[2], pos[0] - lamp.pos[0]);
  const onGround = Number.isFinite(groundHeight(map, pos[0], pos[2]));
  let fallback;
  for (let radius = 0.05; radius <= lamps.length * T.safe_radius * 2 + 1; radius += 0.12) {
    for (let ray = 0; ray < 32; ray++) {
      const point = offsetXZ(pos, angle + ray * TAU / 32, radius);
      if (insideSafeZone(point, lamps, BOUNDARY) || towerBlocks(map, pos, point)) continue;
      const edge = clipLight(point, pos, lamps);
      const exit = !insideSafeZone(edge, lamps, BOUNDARY) && !towerBlocks(map, pos, edge) ? edge : point;
      fallback ??= exit;
      const floor = groundHeight(map, point[0], point[2]);
      if (!onGround || Number.isFinite(floor)) return exit;
    }
  }
  return fallback;
}

export function updateSafeZones(state, lamps) {
  for (const shade of state.shades) {
    if (!insideSafeZone(shade.pos, lamps, BOUNDARY)) {
      shade.escape = null;
      continue;
    }
    if (!shade.escape?.target || insideSafeZone(shade.escape.target, lamps, BOUNDARY)) {
      shade.escape = { target: escapePoint(shade.pos, lamps, state.map), remaining: shade.escape?.remaining ?? T.shade_eject_ticks };
    }
  }
}

export function pulseShades(state, inPulse) {
  const ids = [];
  for (const shade of state.shades) {
    if (!inPulse(shade.pos)) continue;
    shade.state = 'stunned';
    shade.remaining = toTicks(T.pulse_stun_s);
    shade.push = makePush(state.player.pos, shade.pos, T.pulse_push_m, T.pulse_push_ticks);
    state.score += T.score_pulse_shade;
    ids.push(shade.id);
  }
  return ids;
}

function applyPush(state, shade, lamps) {
  if (!shade.push) return;
  const { pos, push } = shade;
  const next = moveOnGround(state.map, pos, [pos[0] + push.x, pos[1], pos[2] + push.z], lamps);
  const blocked = distanceXZ(pos, next) + 1e-6 < Math.hypot(push.x, push.z);
  shade.pos = next;
  if (--push.remaining === 0 || blocked) shade.push = null;
}

function tryChase(state, shade, lamps, distance, step) {
  const { pos } = shade;
  const target = state.player.pos;
  const angle = Math.atan2(target[2] - pos[2], target[0] - pos[0]);
  const move = turn => moveOnGround(state.map, pos, offsetXZ(pos, angle + turn, Math.min(step, distance)), lamps);
  let best = move(0);
  if (distanceXZ(pos, best) >= Math.min(step, distance) - 1e-5) return best;
  for (const degrees of [30, -30, 60, -60, 90, -90, 110, -110]) {
    const candidate = move(degrees * Math.PI / 180);
    if (distanceXZ(candidate, target) < distanceXZ(best, target) - 1e-6) best = candidate;
  }
  if (distanceXZ(pos, best) < step * 0.18 && !insideSafeZone(target, lamps)) {
    const left = move(Math.PI / 2);
    const right = move(-Math.PI / 2);
    if (distanceXZ(pos, left) > distanceXZ(pos, best) || distanceXZ(pos, right) > distanceXZ(pos, best)) {
      return distanceXZ(pos, left) >= distanceXZ(pos, right) - 1e-6 ? left : right;
    }
  }
  return best;
}

export function moveShades(state, lamps) {
  const step = state.map.shadeSpeed * TICK_S;
  for (const shade of state.shades) {
    shade.skipContact = true;
    if (shade.escape) {
      const { target, remaining } = shade.escape;
      if (target) {
        shade.pos = shade.pos.map((value, i) => value + (target[i] - value) / Math.max(1, remaining));
      }
      shade.escape.remaining--;
      if (shade.state === 'stunned' && shade.push && --shade.push.remaining === 0) shade.push = null;
      continue;
    }
    if (shade.state === 'spawning') continue;
    if (shade.state === 'stunned' || shade.state === 'recoil') {
      applyPush(state, shade, lamps);
      if (shade.state === 'recoil' && !shade.remaining && !shade.push) shade.state = 'wander';
      continue;
    }
    shade.skipContact = false;
    const distance = distanceXZ(shade.pos, state.player.pos);
    const threshold = shade.state === 'chase' ? T.shade_forget_radius : T.shade_detect_radius;
    shade.state = !state.player.falling && distance <= threshold ? 'chase' : 'wander';
    if (shade.state === 'chase') {
      shade.pos = tryChase(state, shade, lamps, distance, step);
      continue;
    }
    const next = moveOnGround(state.map, shade.pos, offsetXZ(shade.pos, shade.angle, step), lamps);
    if (distanceXZ(next, shade.pos) < step - 1e-5) shade.angle += Math.PI * 0.55;
    shade.pos = next;
  }
}

export function hitFromShades(state, lamps, emit) {
  const { player } = state;
  if (player.falling || player.invuln || player.flames === 0 || insideSafeZone(player.pos, lamps)) return;
  const shade = state.shades.find(entry => !entry.skipContact && inReach(player.pos, entry.pos, T.shade_hit_radius, T.shade_hit_height_m));
  if (!shade) return;
  const dropped = Math.floor(player.carried * T.hit_drop_ratio);
  player.flames--;
  player.carried -= dropped;
  player.invuln = toTicks(T.invuln_s);
  shade.state = 'recoil';
  shade.remaining = T.shade_recoil_ticks;
  shade.push = makePush(player.pos, shade.pos, T.shade_recoil_m, T.shade_recoil_ticks);
  dropFromHit(state, dropped);
  emit('player_hit', { by: 'shade', flames: player.flames, dropped });
}

export function spawnShades(state, lamps, emit) {
  const first = toTicks(T.shade_first_spawn_s);
  const age = state.simTick - first;
  if (!state.randomShades || age < 0 || age % state.map.shadeInterval) return;
  const count = age === 0 ? T.shade_first_spawn_count : 1;
  for (let i = 0; i < count && state.shades.length < state.map.maxShades; i++) {
    const candidates = state.map.shadePoints.filter(pos =>
      distanceXZ(pos, state.player.pos) >= T.shade_min_spawn_distance_m
      && !insideSafeZone(pos, lamps, BOUNDARY)
      && !state.shades.some(shade => distanceXZ(shade.pos, pos) < 1));
    if (!candidates.length) break;
    const point = candidates[Math.floor(state.random() * candidates.length)];
    const shade = createShade(state, { pos: point, state: 'spawning' });
    state.shades.push(shade);
    emit('shade_spawned', { id: shade.id });
  }
  state.shades.sort(byId);
}
