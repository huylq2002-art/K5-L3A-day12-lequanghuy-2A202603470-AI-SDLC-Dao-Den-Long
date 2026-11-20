import { TICK_S, TUNING as T, toTicks } from './config.ts';
import { groundHeight, towerBlocks } from './maps.js';
import { directionXZ, inReach, rotateMove } from './math.js';

const EPSILON = 1e-7;

export function createPlayer(map, override = {}) {
  const pos = [...(override.pos ?? map.start)];
  const floor = groundHeight(map, pos[0], pos[2]);
  return {
    pos, vel: [0, 0, 0], windDrift: [0, 0], facing: 0,
    grounded: Math.abs(floor - pos[1]) < EPSILON || (floor > 0 && Math.abs(pos[1]) < EPSILON),
    carried: override.carried ?? 0,
    flames: override.flames ?? T.starting_flames,
    invuln: override.invuln_ticks ?? 0,
    dashCd: override.dash_cd_ticks ?? 0,
    pulseCd: override.pulse_cd_ticks ?? 0,
    charm: override.charm_ticks ?? 0,
    dash: 0, dashDirection: [0, 1], respawn: 0, falling: false,
    padVelocity: null, lastPad: null, jumped: false,
  };
}

export function decrementPlayer(player) {
  for (const key of ['invuln', 'dashCd', 'pulseCd', 'charm', 'dash', 'respawn']) {
    if (player[key] > 0) player[key]--;
  }
}

function accelerate(player, x, z) {
  const speed = player.charm ? T.charm_speed_mps : T.move_speed_mps;
  const dx = x * speed - player.vel[0];
  const dz = z * speed - player.vel[2];
  const length = Math.hypot(dx, dz);
  if (!length) return;
  const ratio = Math.min(1, speed * TICK_S / T.move_accel_time_s / length);
  player.vel[0] += dx * ratio;
  player.vel[2] += dz * ratio;
}

function resolveMotion(player, map, wind) {
  const from = player.pos;
  const vel = player.vel;
  const wx = wind.active ? Math.cos(wind.radians) * T.wind_speed_mps : 0;
  const wz = wind.active ? Math.sin(wind.radians) * T.wind_speed_mps : 0;
  player.windDrift = [wx, wz];
  const x = from[0] + (vel[0] + wx) * TICK_S;
  const z = from[2] + (vel[2] + wz) * TICK_S;
  const previousTop = groundHeight(map, from[0], from[2]);
  const oldFloor = previousTop > from[1] + 0.24 ? 0 : previousTop;
  let floor = groundHeight(map, x, z);
  let nextY = from[1] + vel[1] * TICK_S;
  const movingUnderDeck = floor > Math.max(from[1], nextY) + 0.24 && previousTop >= floor - 0.24;
  if (movingUnderDeck) floor = 0;
  const smoothGround = player.grounded && Math.abs(floor - oldFloor) <= 0.24;
  const barred = !smoothGround && floor > Math.max(from[1], nextY) + EPSILON && floor > oldFloor + 0.24;
  let next = [x, nextY, z];
  if (barred || towerBlocks(map, from, next)) {
    next = [from[0], nextY, from[2]];
    floor = oldFloor;
    player.windDrift = [0, 0];
    if (!player.dash && !player.padVelocity) vel[0] = vel[2] = 0;
  }
  player.grounded = (smoothGround && !barred) || (from[1] >= floor - EPSILON && nextY <= floor + EPSILON && vel[1] <= 0);
  if (player.grounded) {
    next[1] = floor;
    vel[1] = 0;
    player.padVelocity = null;
  }
  player.pos = next;
}

function launchFromPad(player, map) {
  if (!player.grounded || player.dash) return;
  const pad = map.pads.find(({ pos }) => inReach(player.pos, pos, T.jump_pad_radius, 0.03));
  if (pad && pad !== player.lastPad) {
    const [x, z] = directionXZ(pad.pos, pad.to);
    player.padVelocity = [x * pad.speed, z * pad.speed];
    player.vel = [player.padVelocity[0], pad.vy, player.padVelocity[1]];
    player.facing = Math.atan2(x, z);
    player.grounded = false;
    player.jumped = true;
  }
  player.lastPad = pad;
}

function fall(player, emit) {
  const lost = player.carried;
  player.flames--;
  player.carried = 0;
  player.falling = true;
  player.respawn = T.respawn_ticks;
  player.grounded = false;
  player.vel = [0, 0, 0];
  player.windDrift = [0, 0];
  player.padVelocity = null;
  player.lastPad = null;
  player.dash = 0;
  emit('player_hit', { by: 'fall', flames: player.flames, dropped: 0, lost });
}

export function movePlayer(player, map, wind, input, dashPressed, emit) {
  player.jumped = false;
  if (player.falling) {
    if (!player.respawn && player.flames > 0) {
      player.pos = [...map.start];
      player.vel = [0, 0, 0];
      player.grounded = true;
      player.invuln = toTicks(T.invuln_s);
      player.falling = false;
      player.facing = 0;
    }
    return;
  }
  if (player.pos[1] < T.fall_y) {
    fall(player, emit);
    return;
  }

  const [x, z] = rotateMove(input.x ?? 0, input.z ?? 0, input.cam_yaw_deg ?? 0);
  const hasDirection = Math.hypot(x, z) > EPSILON;
  if (hasDirection && !player.dash && !player.padVelocity) player.facing = Math.atan2(x, z);
  if (dashPressed && !player.dash && (!player.dashCd || player.charm)) {
    const fallback = [Math.sin(player.facing), Math.cos(player.facing)];
    const drift = Math.hypot(player.vel[0], player.vel[2]) > EPSILON;
    player.dashDirection = hasDirection ? directionXZ([0, 0, 0], [x, 0, z])
      : drift ? directionXZ([0, 0, 0], player.vel) : fallback;
    player.facing = Math.atan2(...player.dashDirection);
    player.dash = toTicks(T.dash_duration_s);
    if (!player.charm) player.dashCd = toTicks(T.dash_cooldown_s);
    emit('dash', {});
  }

  if (player.dash) {
    player.vel = [player.dashDirection[0] * T.dash_speed, 0, player.dashDirection[1] * T.dash_speed];
  } else {
    if (player.padVelocity) {
      [player.vel[0], player.vel[2]] = player.padVelocity;
    } else {
      // Leaving a dash returns to running speed immediately, then normal acceleration resumes.
      const speed = Math.hypot(player.vel[0], player.vel[2]);
      const limit = player.charm ? T.charm_speed_mps : T.move_speed_mps;
      if (speed > limit) {
        player.vel[0] *= limit / speed;
        player.vel[2] *= limit / speed;
      }
      accelerate(player, x, z);
    }
    if (input.jump && player.grounded) {
      player.vel[1] = T.jump_speed_mps;
      player.grounded = false;
      player.jumped = true;
    } else if (!player.grounded) {
      player.vel[1] += T.gravity_mps2 * TICK_S;
    }
  }
  resolveMotion(player, map, wind);
  launchFromPad(player, map);
  if (player.pos[1] < T.fall_y) fall(player, emit);
}
