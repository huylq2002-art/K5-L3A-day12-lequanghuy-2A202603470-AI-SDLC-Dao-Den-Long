import { TICK_S, TUNING as T } from './config.ts';
import { confineToIsland, distanceXZ, offsetXZ } from './math.js';

// Keep the contact point outside the light even after 3-decimal snapshot rounding.
const SHADE_CLEARANCE = T.safe_radius + 0.002;

export function insideSafeZone(pos, litLanterns, radius = T.safe_radius) {
  return litLanterns.some(lantern => distanceXZ(pos, lantern.pos) <= radius);
}

function segmentEntrance(from, to, center) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length === 0) return 1;
  const cx = center[0] - from[0];
  const cz = center[2] - from[2];
  const forward = (cx * dx + cz * dz) / length;
  const side = (cx * dz - cz * dx) / length;
  if (forward <= 0 || Math.abs(side) > SHADE_CLEARANCE) return 1;
  const entry = forward - Math.sqrt(SHADE_CLEARANCE ** 2 - side ** 2);
  return Math.min(1, Math.max(0, (entry - 0.00001) / length));
}

function stopAtSafeZones(from, to, litLanterns) {
  let fraction = 1;
  for (const { pos } of litLanterns) {
    fraction = Math.min(fraction, segmentEntrance(from, to, pos));
  }
  if (fraction === 1) return to;
  return [from[0] + (to[0] - from[0]) * fraction, from[1], from[2] + (to[2] - from[2]) * fraction];
}

export function ejectFromLight(pos, litLanterns) {
  const containing = litLanterns.find(lantern => distanceXZ(pos, lantern.pos) <= SHADE_CLEARANCE);
  if (!containing) return pos;
  const startAngle = Math.atan2(pos[2] - containing.pos[2], pos[0] - containing.pos[0]);
  // Search outward from the shade so overlapping or shoreline lights still have an exit.
  for (let radius = 0.25; radius <= 2 * T.island_radius; radius += 0.25) {
    for (let ray = 0; ray < 24; ray++) {
      const candidate = confineToIsland(offsetXZ(pos, startAngle + ray * Math.PI / 12, radius));
      if (!insideSafeZone(candidate, litLanterns, SHADE_CLEARANCE)) return candidate;
    }
  }
  return pos;
}

export function chase(shade, target, litLanterns) {
  const { pos } = shade;
  const angle = Math.atan2(target[2] - pos[2], target[0] - pos[0]);
  const step = Math.min(T.shade_speed_mps * TICK_S, distanceXZ(pos, target));
  const move = direction => stopAtSafeZones(
    pos, confineToIsland(offsetXZ(pos, direction, step)), litLanterns,
  );
  const direct = move(angle);
  if (distanceXZ(pos, direct) >= step - 0.00002) return direct;

  // Try both sides of an obstacle and choose the closest reachable step to the target.
  let best = direct;
  let bestDistance = distanceXZ(direct, target);
  for (const turn of [30, -30, 60, -60, 90, -90, 110, -110]) {
    const candidate = move(angle + turn * Math.PI / 180);
    const distance = distanceXZ(candidate, target);
    if (distance + 0.000001 < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  // At the front of a circle a tangential first step can briefly increase target distance.
  if (distanceXZ(pos, best) < step * 0.2 && !insideSafeZone(target, litLanterns)) {
    const left = move(angle + Math.PI / 2);
    const right = move(angle - Math.PI / 2);
    return distanceXZ(pos, left) >= distanceXZ(pos, right) - 0.000001 ? left : right;
  }
  return best;
}

export function pushFromPlayer(shade, player, litLanterns) {
  const angle = Math.atan2(shade.pos[2] - player.pos[2], shade.pos[0] - player.pos[0]);
  const target = confineToIsland(offsetXZ(shade.pos, angle, T.pulse_push_m));
  return stopAtSafeZones(shade.pos, target, litLanterns);
}
