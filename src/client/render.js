import * as THREE from 'three';
import { LANTERN_LAYOUT, TUNING as T } from '../core/config.ts';
import { groundDisc, makeGlowTexture, makeLantern, makeMote, makePlayer, makeShade } from './models.js';
import { addWorld } from './world.js';

const AMBER = new THREE.Color(0xffb456);
const RED_PAPER = new THREE.Color(0xa34343);
const AZURE = new THREE.Color(0xa6b0ff);
const PURPLE = new THREE.Color(0x8951d8);

function place(object, [x, y, z], height = 0) {
  object.position.set(x, y + height, -z);
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
    model.root.traverse(part => {
      if (part.isSprite) part.material.dispose();
    });
    scene.remove(model.root);
    cache.delete(id);
  }
}

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const moonMist = new THREE.Color(0x625978);
  const goldenMist = new THREE.Color(0xa68a68);
  scene.fog = new THREE.FogExp2(moonMist, 0.020);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 470);
  const texture = makeGlowTexture();
  const waterTime = addWorld(scene, texture);
  const ambient = new THREE.HemisphereLight(0xa7bfef, 0x90718c, 1.95);
  const moonlight = new THREE.DirectionalLight(0xffdeb7, 1.55);
  moonlight.position.set(-16, 18, -15);
  scene.add(ambient, moonlight);
  const player = makePlayer(scene, texture);
  const ring = groundDisc(scene, 0xffb76a, 0, 1, new THREE.RingGeometry(0.96, 1, 72));
  const lamps = new Map(LANTERN_LAYOUT.map(({ id }) => {
    const model = makeLantern(texture);
    scene.add(model.root);
    return [id, model];
  }));
  const motes = new Map();
  const shades = new Map();
  const target = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let gait = 0;
  let lightLevel = 0;
  let pulseAt = -10;
  let width = 0;
  let height = 0;

  function render(state, orbit, time, elapsed) {
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
    place(player.shadow, [x, 0.026, z]);
    player.shadow.material.opacity = 0.34 / (1 + y);
    const moved = Math.hypot(x - lastPos.x, z - lastPos.z);
    gait += moved * 4;
    lastPos.set(x, y, z);
    const swing = moved > 0.0001 && y < 0.12 ? Math.sin(gait) : 0;
    player.body.position.y = Math.abs(swing) * 0.052;
    player.shoes[0].rotation.x = swing * 0.66;
    player.shoes[1].rotation.x = -swing * 0.66;
    player.charm.rotation.x = Math.sin(time * 4) * 0.12 + swing * 0.11;
    player.body.rotation.y = -state.player.facing;
    player.body.visible = state.tick >= state.player.invulnerableUntil || Math.floor(state.tick / 5) % 2 === 0;

    target.set(x, 1.35 + y * 0.5, -z).addScaledVector(forward, 4.6);
    camera.position.set(x, y * 0.45 + 1.0 + Math.sin(orbit.pitch) * orbit.distance, -z)
      .addScaledVector(forward, -Math.cos(orbit.pitch) * orbit.distance);
    camera.lookAt(target);

    let lit = 0;
    for (const lantern of state.lanterns) {
      const model = lamps.get(lantern.id);
      const filling = lantern.deposited / T.lantern_cost;
      const flicker = 0.95 + Math.sin(time * 3 + Number(lantern.id[1])) * 0.05;
      place(model.root, lantern.pos);
      model.root.rotation.y = Math.atan2(-lantern.pos[0], -lantern.pos[2]);
      if (lantern.lit) lit++;
      model.paper.color.copy(lantern.lit ? AMBER : RED_PAPER);
      model.paper.emissiveIntensity = lantern.lit ? 1.75 * flicker : 0.13 + filling * 0.49;
      model.halo.scale.setScalar(lantern.lit ? 7.7 * flicker : 2.2 + filling);
      model.halo.material.opacity = lantern.lit ? 0.92 : 0.48 + filling * 0.14;
      model.beacon.material.opacity = lantern.lit ? 0.83 : 0.41 + 0.14 * flicker;
      model.light.intensity = lantern.lit ? 92 * flicker : 1 + filling * 13;
      model.safe.visible = model.warmth.visible = lantern.lit;
    }
    lightLevel = THREE.MathUtils.damp(lightLevel, lit / state.lanterns.length, 2.9, elapsed);
    ambient.intensity = 1.95 + lightLevel * 0.75;
    scene.fog.color.copy(moonMist).lerp(goldenMist, lightLevel * 0.75);
    scene.fog.density = 0.020 - lightLevel * 0.004;

    syncObjects(scene, motes, state.motes, () => makeMote(texture), ({ root, halo }, mote) => {
      const phase = Number(mote.id.slice(1)) * 0.73;
      place(root, mote.pos, 0.59 + Math.sin(phase + time * 2.8) * 0.17);
      root.rotation.y = phase + time * 2;
      halo.material.opacity = 0.57 + Math.sin(phase + time * 2.5) * 0.23;
    });
    syncObjects(scene, shades, state.shades, () => makeShade(texture), ({ root, arms, aura }, shade) => {
      const stunned = shade.state === 'stunned';
      place(root, shade.pos, 0.14 + Math.sin(time * (stunned ? 2 : 5) + shade.pos[2]) * 0.12);
      root.rotation.y = -Math.atan2(x - shade.pos[0], z - shade.pos[2]);
      root.rotation.z = stunned ? Math.sin(time * 7) * 0.23 : 0;
      arms.forEach((arm, i) => { arm.rotation.x = Math.sin(time * 5 + i * 0.9) * 0.30; });
      aura.material.color.copy(stunned ? AZURE : PURPLE);
      aura.material.opacity = stunned ? 0.64 : 0.34;
    });

    const pulseProgress = (time - pulseAt) / 0.57;
    ring.visible = pulseProgress >= 0 && pulseProgress < 1;
    if (ring.visible) {
      ring.scale.setScalar(0.2 + T.pulse_radius * pulseProgress);
      ring.material.opacity = (1 - pulseProgress) * 0.85;
    }
    waterTime.value = time;
    renderer.render(scene, camera);
  }

  return {
    canvas: renderer.domElement,
    render,
    pulse(pos, time) {
      place(ring, [pos[0], 0.044, pos[2]]);
      pulseAt = time;
    },
    reset() {
      lightLevel = 0;
      gait = 0;
      pulseAt = -10;
      lastPos.set(0, 0, 0);
    },
  };
}
