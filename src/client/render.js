import * as THREE from 'three';
import { TUNING as T } from '../core/config.ts';
import { displayFuel, lanternCost, lowFuel, providesSafety } from '../core/lanterns.js';
import { groundHeight } from '../core/maps.js';
import { glow, groundDisc, makeDrifter, makeGlowTexture, makeLantern, makeMote, makePlayer, makeShade, makeWindCharm } from './models.js';
import { PALETTE as P } from './palette.js';
import { addWorld } from './world.js';

const AMBER = new THREE.Color(P.lantern);
const OFF = new THREE.Color(P.lanternOff);
const SHADE_COLORS = [new THREE.Color(P.shadeGlow), new THREE.Color(P.shadeAccessible)];

function place(object, [x, y, z], height = 0) {
  object.position.set(x, y + height, -z);
}

function cameraDistance(tower, x, y, z, forward, pitch, distance) {
  if (!tower || y < tower.base - 1.5 || y > tower.base + tower.height) return distance;
  const along = x * forward.x - z * forward.z;
  const across = x * forward.z + z * forward.x;
  const radius = tower.radius + 0.20;
  if (along <= 0 || Math.abs(across) >= radius) return distance;
  const crossing = along - Math.sqrt(radius ** 2 - across ** 2);
  return Math.max(0.9, Math.min(distance, (crossing - 0.18) / Math.cos(pitch)));
}

function syncObjects(scene, cache, entities, create, update) {
  const live = new Set();
  for (const entity of entities) {
    live.add(entity.id);
    let visual = cache.get(entity.id);
    if (!visual) {
      visual = create();
      cache.set(entity.id, visual);
      scene.add(visual.root);
    }
    update(visual, entity);
  }
  for (const [id, model] of cache) {
    if (live.has(id)) continue;
    model.root.traverse(part => { if (part.isSprite) part.material.dispose(); });
    model.dispose?.();
    scene.remove(model.root);
    cache.delete(id);
  }
}

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(P.mist, 0.014);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 470);
  const texture = makeGlowTexture();
  const worlds = new Map();
  const ambient = new THREE.HemisphereLight(0xc5d0ff, 0x90718c, 0.15);
  const moonlight = new THREE.DirectionalLight(0xdce3ff, 2.45);
  moonlight.position.set(-16, 18, -15);
  scene.add(ambient, moonlight);
  const player = makePlayer(scene, texture);
  const ring = groundDisc(scene, 0xffb76a, 0, 1, new THREE.RingGeometry(0.96, 1, 72));
  const lamps = Array.from({ length: 7 }, () => {
    const model = makeLantern(texture);
    scene.add(model.root);
    return model;
  });
  const motes = new Map();
  const shades = new Map();
  const drifters = new Map();
  const charms = new Map();
  const dashTrail = Array.from({ length: 4 }, () => glow(scene, texture, P.drifter, 1));
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.084), new THREE.MeshBasicMaterial({ color: 0xe2b16c, side: THREE.DoubleSide }), 65);
  const leaf = new THREE.Object3D();
  leaves.frustumCulled = false;
  scene.add(leaves);
  const target = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let gait = 0;
  let pulseAt = -10;
  let width = 0;
  let height = 0;

  let currentWorld;
  function render(state, orbit, time, accessible = false) {
    if (currentWorld?.id !== state.night) {
      if (currentWorld) currentWorld.root.visible = false;
      if (!worlds.has(state.night)) worlds.set(state.night, { id: state.night, ...addWorld(scene, texture, state.map) });
      currentWorld = worlds.get(state.night);
      currentWorld.root.visible = true;
    }
    if (width !== container.clientWidth || height !== container.clientHeight) {
      width = container.clientWidth;
      height = container.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }
    const yaw = orbit.yaw * Math.PI / 180;
    forward.set(Math.sin(yaw), 0, -Math.cos(yaw));
    const [x, y, z] = state.player.pos;
    place(player.root, state.player.pos);
    const floor = groundHeight(state.map, x, z);
    player.shadow.visible = Number.isFinite(floor) && y >= floor && !state.player.falling;
    if (player.shadow.visible) {
      place(player.shadow, [x, floor + 0.026, z]);
      player.shadow.material.opacity = 0.34 / (1 + y - floor);
    }
    const moved = Math.hypot(x - lastPos.x, z - lastPos.z);
    gait += moved * 4;
    lastPos.set(x, y, z);
    const swing = moved > 0.0001 && state.player.grounded ? Math.sin(gait) : 0;
    player.body.position.y = Math.abs(swing) * 0.052;
    player.shoes[0].rotation.x = swing * 0.66;
    player.shoes[1].rotation.x = -swing * 0.66;
    player.charm.rotation.x = Math.sin(time * 4) * 0.12 + swing * 0.11;
    player.body.rotation.y = -state.player.facing;
    player.body.visible = !state.player.falling && (!state.player.invuln || Math.floor(state.simTick / 5) % 2 === 0);

    const cameraY = Math.max(-2.8, y);
    const distance = cameraDistance(state.map.tower, x, y, z, forward, orbit.pitch, orbit.distance);
    target.set(x, 1.35 + cameraY, -z).addScaledVector(forward, 4.6);
    target.addScaledVector(forward, Math.min(0, (distance - orbit.distance) * 0.36));
    camera.position.set(x, cameraY + 1.0 + Math.sin(orbit.pitch) * distance, -z)
      .addScaledVector(forward, -Math.cos(orbit.pitch) * distance);
    camera.lookAt(target);

    let lit = 0;
    for (let i = 0; i < lamps.length; i++) {
      const lantern = state.lanterns[i];
      const model = lamps[i];
      model.root.visible = Boolean(lantern);
      model.light.visible = Boolean(lantern?.lit);
      if (!lantern) continue;
      const fuel = displayFuel(lantern.fuelUnits) / T.fuel_max;
      const flicker = lowFuel(lantern) ? 0.65 + 0.35 * Math.cos(time * Math.PI * 2) : 1;
      place(model.root, lantern.pos);
      model.root.rotation.y = Math.atan2(-lantern.pos[0], -lantern.pos[2]);
      if (lantern.lit) lit++;
      model.paper.color.copy(lantern.lit ? AMBER : OFF);
      model.shell.scale.y = lantern.lit ? 1 : 0.8;
      model.tears.visible = !lantern.lit;
      model.core.visible = lantern.lit;
      model.paper.emissiveIntensity = lantern.lit ? 0.32 * flicker : 0;
      model.halo.visible = lantern.lit;
      model.halo.scale.setScalar(7.7 * flicker);
      model.halo.material.opacity = 0.92 * flicker;
      model.beacon.material.opacity = lantern.lit ? 0 : 0.38 + 0.14 * lantern.deposited / lanternCost(lantern.everLit);
      model.light.intensity = lantern.lit ? 64 * flicker : 0;
      model.safe.visible = providesSafety(lantern);
      model.warmth.visible = lantern.lit;
      model.warmth.scale.setScalar(model.safe.visible ? T.safe_radius : T.safe_radius / 2);
      model.warmth.material.opacity = 0.085 * flicker;
      model.fuelBar.visible = lantern.lit;
      if (lantern.lit) {
        model.fuelBar.lookAt(camera.position);
        model.fuelFill.scale.x = Math.max(0.001, fuel * 1.2);
        model.fuelFill.position.x = (fuel - 1) * 0.6;
        model.fuelFill.material.opacity = flicker;
      }
    }
    ambient.intensity = 0.15 + 0.55 * lit / state.lanterns.length;

    syncObjects(scene, motes, state.motes, () => makeMote(texture), ({ root, halo }, mote) => {
      const phase = (mote.pos[0] + mote.pos[2]) * 0.73;
      place(root, mote.pos, 0.59 + Math.sin(phase + time * 2.8) * 0.17);
      root.rotation.y = phase + time * 2;
      const fade = mote.ttl === null ? 1 : Math.min(1, mote.ttl / 90);
      halo.material.opacity = (0.57 + Math.sin(phase + time * 2.5) * 0.23) * fade;
    });
    syncObjects(scene, shades, state.shades, () => makeShade(texture), ({ root, arms, aura, style }, shade) => {
      const stunned = shade.state === 'stunned';
      const draining = shade.state === 'drain';
      const focus = draining ? state.lanterns.find(lamp => lamp.id === shade.targetLanternId)?.pos : null;
      place(root, shade.pos, 0.14 + Math.sin(time * (stunned ? 2 : 5) + shade.pos[2]) * 0.12);
      root.rotation.y = -Math.atan2((focus?.[0] ?? x) - shade.pos[0], (focus?.[2] ?? z) - shade.pos[2]);
      root.rotation.z = stunned ? Math.sin(time * 7) * 0.23 : 0;
      arms.forEach((arm, i) => { arm.rotation.x = Math.sin(time * 5 + i * 0.9) * 0.30; });
      style(stunned, accessible);
      root.scale.setScalar(shade.state === 'spawning' ? 0.48 : 1);
      aura.material.color.copy(SHADE_COLORS[Number(accessible)]);
      aura.material.opacity = stunned ? 0.46 : draining ? 0.68 : 0.34;
    });
    syncObjects(scene, drifters, state.drifters, () => makeDrifter(texture), ({ root, aura, ribbon }, drifter) => {
      root.visible = drifter.state !== 'removed';
      place(root, drifter.pos, 0.52 + Math.sin(time * 4 + drifter.pos[0]) * 0.32);
      root.rotation.set(0.25, time * 0.8, Math.sin(time * 2.8) * 0.72);
      const points = ribbon.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const h = points.getY(i);
        points.setZ(i, Math.sin(h * 2.4 + time * 10) * 0.40);
      }
      points.needsUpdate = true;
      aura.material.opacity = drifter.stolen ? 0.82 : 0.45;
    });
    syncObjects(scene, charms, state.charms, () => makeWindCharm(texture), ({ root }, charm) => {
      root.visible = !charm.respawn;
      place(root, charm.pos, 0.92 + Math.sin(time * 2.8) * 0.19);
      root.rotation.y = time * 1.4;
    });
    dashTrail.forEach((sprite, i) => {
      sprite.visible = Boolean(state.player.dash);
      if (!sprite.visible) return;
      const trail = (i + 1) * 0.55;
      place(sprite, [x - Math.sin(state.player.facing) * trail, y + 0.75, z - Math.cos(state.player.facing) * trail]);
      sprite.scale.set(2.7 + i * 0.3, 0.82 - i * 0.1, 1);
      sprite.material.opacity = 0.62 - i * 0.10;
    });
    leaves.visible = state.wind.warning || state.wind.active;
    if (leaves.visible) {
      for (let i = 0; i < leaves.count; i++) {
        const travel = ((time * (state.wind.active ? 9 : 5) + i * 2.13) % 34 + 34) % 34 - 17;
        const spread = Math.sin(i * 31.57) * 14;
        const dx = Math.cos(state.wind.radians);
        const dz = Math.sin(state.wind.radians);
        leaf.position.set(x + dx * travel - dz * spread, y + 2.8 + Math.sin(time + i * 5) * 2.6, -z - dz * travel - dx * spread);
        leaf.rotation.set(time * 9 + i, time * 4 + i * 1.8, i);
        leaf.updateMatrix();
        leaves.setMatrixAt(i, leaf.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    }

    const pulseProgress = (time - pulseAt) / 0.57;
    ring.visible = pulseProgress >= 0 && pulseProgress < 1;
    if (ring.visible) {
      ring.scale.setScalar(0.2 + T.pulse_radius * pulseProgress);
      ring.material.opacity = (1 - pulseProgress) * 0.85;
    }
    currentWorld.waterTime.value = time;
    renderer.render(scene, camera);
  }

  return {
    canvas: renderer.domElement,
    render,
    pulse(pos, time) {
      place(ring, pos, 0.8);
      pulseAt = time;
    },
    outsideTarget(pos) {
      if (!pos) return null;
      const marker = new THREE.Vector3(pos[0], pos[1] + 2.0, -pos[2]);
      const behind = camera.getWorldDirection(forward).dot(marker.clone().sub(camera.position)) < 0;
      marker.project(camera);
      if (!behind && Math.abs(marker.x) <= 1 && Math.abs(marker.y) <= 1 && Math.abs(marker.z) <= 1) return null;
      if (behind) marker.multiplyScalar(-1);
      if (!Number.isFinite(marker.x + marker.y) || Math.abs(marker.x) + Math.abs(marker.y) < 0.001) marker.set(0, -1, 0);
      const scale = Math.min(0.88 / Math.abs(marker.x), 0.66 / Math.abs(marker.y));
      return { x: 50 + 50 * marker.x * scale, y: 50 - 50 * marker.y * scale, angle: Math.atan2(marker.x * width, marker.y * height) };
    },
    reset() {
      gait = 0;
      pulseAt = -10;
      lastPos.set(0, 0, 0);
    },
  };
}
