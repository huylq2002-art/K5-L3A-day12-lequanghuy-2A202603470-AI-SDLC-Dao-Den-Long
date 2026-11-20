import * as THREE from 'three';
import { TUNING as T } from '../core/config.ts';
import { groundHeight } from '../core/maps.js';
import { seededRandom } from '../core/math.js';
import { box, crystal, glow, matte, mesh } from './models.js';
import { PALETTE as P } from './palette.js';

const TAU = 2 * Math.PI;
const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const vertexShader = `
  varying vec3 world;
  void main() {
    world = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyShader = `
  uniform vec3 uSky;
  uniform vec3 uMist;
  vec3 skyColor(vec3 view) {
    vec3 color = mix(uMist, uSky, smoothstep(-0.09, 0.43, view.y));
    vec3 moon = normalize(vec3(-0.31, 0.08, -1.0));
    return color + vec3(0.073, 0.058, 0.071) * pow(max(dot(view, moon), 0.0), 22.0);
  }
`;

const skyUniforms = () => ({ uSky: { value: new THREE.Color(P.sky) }, uMist: { value: new THREE.Color(P.mist) } });

function landscapeMesh(points, colors, scene) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  mesh(scene, geometry, flat);
}

function terrain(scene, random, radius) {
  const points = [];
  const colors = [];
  const groundGreen = new THREE.Color(P.grass);
  const roughGreen = new THREE.Color(0x325d50);
  const sand = new THREE.Color(P.sand);
  const cliff = new THREE.Color(0x534a55);
  const colorVariation = [0.07, 0.19];
  const count = 72;
  const rings = [0, 4, 9, 14, 19, 24, 29, 32.2, 34.3, 36, 36.8, 35.6];
  const vertices = rings.map((band, index) => Array.from({ length: count }, (_, i) => {
    const angle = (i + (index % 2) * 0.5) * TAU / count;
    const width = band * radius / 36 + (index > 0 && index < 9 ? (random() - 0.5) * 1.25 : 0);
    const y = index < 10 ? 0 : (index === 10 ? -1.4 : -5.2) + (random() - 0.5) * 0.36;
    return [Math.cos(angle) * width, y, Math.sin(angle) * width];
  }));
  const triangle = (a, b, c, layer) => {
    const blend = layer === 0 ? 0.35 + random() * 0.14 : random();
    const color = layer >= 9 ? cliff.clone() : groundGreen.clone().lerp(roughGreen, blend);
    if (layer === 7 || layer === 8) color.lerp(sand, layer === 8 ? 0.89 : 0.44);
    const variation = colorVariation[layer] ?? 0.35;
    color.multiplyScalar(1 + (random() - 0.5) * variation);
    points.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      const inner = vertices[j];
      const outer = vertices[j + 1];
      const shift = j % 2;
      const other = (i + count - 1 + shift) % count;
      const current = (i + shift) % count;
      triangle(inner[i], outer[current], outer[other], j);
      if (j) triangle(inner[i], inner[next], outer[current], j);
    }
  }
  landscapeMesh(points, colors, scene);
  const border = mesh(scene, new THREE.RingGeometry(radius - 0.35, radius - 0.20, count), new THREE.MeshBasicMaterial({ color: P.sand, transparent: true, opacity: 0.38 }), 0, 0.012, 0);
  border.rotation.x = -Math.PI / 2;
}

function ocean(scene, map) {
  const [a, b] = map.islands;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms(), uTime: { value: 0 }, uWater: { value: new THREE.Color(P.sea) },
      uShore: { value: new THREE.Vector3(a.radius, b?.x ?? 0, b?.radius ?? 0) },
    },
    vertexShader,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uWater;
      uniform vec3 uShore;
      varying vec3 world;
      ${skyShader}
      void main() {
        float field = sin(world.z * 2.3 + sin(world.x * 0.23 + uTime * 0.19) * 1.7 + uTime * 0.52);
        float waves = smoothstep(0.81, 0.99, field) * (0.4 + 0.6 * sin(world.x * 0.67 - world.z * 0.14));
        float reflection = exp(-abs(world.x + 29.0 + sin(world.z * 0.83) * 4.4) * 0.13);
        float edge = abs(length(world.xz) - uShore.x) + 2.0;
        if (uShore.z > 0.0) edge = min(edge, abs(length(world.xz - vec2(uShore.y, 0.0)) - uShore.z) + 2.0);
        float foam = exp(-abs(edge - 1.2 + sin(world.x * 0.63 + uTime * 0.85) * 0.35) * 3.0) * 0.23;
        foam += exp(-abs(edge - 2.3 + sin(world.z * 0.44 - uTime * 0.71) * 0.3) * 3.8) * 0.12;
        vec3 sea = uWater + waves * vec3(0.008, 0.024, 0.035);
        sea += (max(0.0, waves) * reflection * 0.20 + foam) * vec3(0.37, 0.38, 0.45);
        float fog = smoothstep(36.0, 154.0, distance(cameraPosition, world));
        gl_FragColor = vec4(mix(sea, skyColor(normalize(world - cameraPosition)), fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sea = mesh(scene, new THREE.PlaneGeometry(1900, 1900), material, 0, -9.25, 0);
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 9;
  return material.uniforms.uTime;
}

function sky(scene, texture, random) {
  const material = new THREE.ShaderMaterial({
    uniforms: skyUniforms(),
    vertexShader,
    side: THREE.BackSide,
    depthWrite: false,
    fragmentShader: `
      varying vec3 world;
      ${skyShader}
      void main() {
        vec3 view = normalize(world - cameraPosition);
        gl_FragColor = vec4(skyColor(view), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = mesh(scene, new THREE.SphereGeometry(390, 24, 18), material);
  dome.renderOrder = 10;
  const moon = mesh(scene, new THREE.SphereGeometry(7.4, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffe1aa, fog: false }), -49, 18.5, -157);
  const halo = glow(scene, texture, 0xffbe81, 56, 0.48);
  halo.position.copy(moon.position);
  // The sprite sits just in front of the opaque moon to leave a soft edge around it.
  halo.position.z += 8;
  const stars = [];
  for (let i = 0; i < 300; i++) {
    const angle = random() * TAU;
    const height = random() * 0.7 + 0.02;
    const width = Math.sqrt(1 - height ** 2) * 340;
    stars.push(Math.cos(angle) * width, height * 340, Math.sin(angle) * width);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffe2b9, size: 0.28, opacity: 0.62, transparent: true, fog: false })));
  const hill = new THREE.ConeGeometry(1, 1, 5);
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x3e3e61, fog: false });
  for (let i = 0; i < 31; i++) {
    const angle = i * TAU / 31 + (random() - 0.5) * 0.16;
    const distance = 81 + random() * 40;
    mesh(scene, hill, silhouette, Math.cos(angle) * distance, -1.4, Math.sin(angle) * distance, 8 + random() * 23, 4 + random() * 12, 7 + random() * 11).rotation.y = angle;
  }
}

const wood = matte(P.wood);
const stone = matte(0x746b7e);
const gold = matte(P.gold);
const sand = matte(P.sand);
const grassMaterial = matte(P.grass);
const roof = matte(0x684256);
const treeTrunk = new THREE.CylinderGeometry(0.7, 1, 1, 6);
const treeTop = new THREE.ConeGeometry(1, 1, 6);

function bridge(scene, layout) {
  const width = layout.halfWidth * 2;
  for (let x = layout.minX + 0.22; x < layout.maxX; x += 0.44) {
    mesh(scene, box, wood, x, -0.09, 0, 0.4, 0.24, width);
    if (Math.round(x / 0.44) % 5 === 0) {
      for (const z of [-width * 0.28, width * 0.28]) {
        mesh(scene, box, wood, x, -1.85, z, 0.17, 3.5, 0.17);
      }
    }
  }
  for (const z of [-width * 0.4, width * 0.4]) {
    mesh(scene, box, gold, (layout.minX + layout.maxX) / 2, 0.035, z, layout.maxX - layout.minX, 0.018, 0.055);
  }
}

function waterfront(scene) {
  for (let i = 0; i < 17; i++) {
    const z = -30 - i * 0.44;
    mesh(scene, box, wood, -4.6, 0, z, 2.5, 0.12, 0.40);
    if (i % 4 === 0) {
      for (const x of [-5.8, -3.4]) mesh(scene, box, wood, x, 0.27, z, 0.18, 0.75, 0.18);
    }
  }

  const house = new THREE.Group();
  house.position.set(3.8, 0, -31.6);
  scene.add(house);
  mesh(house, box, stone, 0, 0.13, 0, 4.8, 0.26, 3.7);
  for (const x of [-1.7, 1.7]) {
    for (const z of [-1.18, 1.18]) mesh(house, box, wood, x, 1.25, z, 0.22, 2.35, 0.22);
  }
  mesh(house, box, wood, 0, 1.3, -1.24, 3.55, 2.12, 0.12);
  mesh(house, new THREE.CylinderGeometry(0.19, 1, 1, 4), roof, 0, 2.97, 0, 3.15, 1.22, 2.52).rotation.y = Math.PI / 4;
  mesh(house, box, wood, 0, 2.37, 0, 4.65, 0.14, 3.72);
}

function bellLevels(scene, map) {
  const { summit, terrace, tower } = map;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, terrace.outer, 0, Math.PI, false);
  shape.lineTo(-terrace.inner, 0);
  shape.absarc(0, 0, terrace.inner, Math.PI, 0, true);
  shape.closePath();
  const cliff = new THREE.ExtrudeGeometry(shape, { depth: terrace.height, bevelEnabled: false, curveSegments: 48 });
  const wall = mesh(scene, cliff, [sand, stone]);
  wall.rotation.x = -Math.PI / 2;
  const top = mesh(scene, new THREE.RingGeometry(terrace.inner, terrace.outer, 96, 1, 0, Math.PI), grassMaterial, 0, terrace.height + 0.008, 0);
  top.rotation.x = -Math.PI / 2;

  mesh(scene, new THREE.CylinderGeometry(summit.radius, summit.radius, summit.height, 64), stone, 0, summit.height / 2, 0);
  mesh(scene, new THREE.CylinderGeometry(summit.radius, summit.radius, 0.09, 64), sand, 0, summit.height - 0.04, 0);
  for (const ramp of map.ramps) {
    const corners = [-ramp.width / 2, ramp.width / 2].flatMap(side => {
      const start = Math.sqrt(ramp.top ** 2 - side ** 2);
      return [[start, ramp.height], [ramp.foot, 0]].map(([distance, y]) =>
        [ramp.x * distance - ramp.z * side, y, -(ramp.z * distance + ramp.x * side)]);
    });
    const [a, b, c, d] = corners;
    const geometry = new THREE.BufferGeometry();
    const vertices = [a, c, b, b, c, d, a, b, [a[0], 0, a[2]], c, [c[0], 0, c[2]], d];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geometry.computeVertexNormals();
    const material = sand.clone();
    material.side = THREE.DoubleSide;
    mesh(scene, geometry, material);
  }

  const column = new THREE.CylinderGeometry(1, 1, 1, 12);
  mesh(scene, column, stone, 0, tower.base + 0.22, 0, tower.radius, 0.44, tower.radius);
  mesh(scene, column, wood, 0, tower.base + 2.3, 0, 1.77, 4.55, 1.77);
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6;
    mesh(scene, box, wood, Math.sin(angle) * 1.6, tower.base + 5.37, Math.cos(angle) * 1.6, 0.23, 2.1, 0.23);
  }
  mesh(scene, new THREE.CylinderGeometry(0.55, 0.95, 1.1, 12), gold, 0, tower.base + 5.25, 0);
  mesh(scene, new THREE.ConeGeometry(tower.radius, 1.65, 12), roof, 0, tower.base + tower.height - 0.825, 0);
}

function modelPads(scene, texture, map) {
  for (const { pos: [x, y, z] } of map.pads) {
    const disk = mesh(scene, new THREE.CylinderGeometry(T.jump_pad_radius, T.jump_pad_radius, 0.16, 12), stone, x, y + 0.07, -z);
    disk.rotation.y = Math.PI / 12;
    const emblem = mesh(scene, new THREE.RingGeometry(0.65, 0.89, 12), gold, x, y + 0.16, -z);
    emblem.rotation.x = -Math.PI / 2;
    const center = mesh(scene, crystal, gold, x, y + 0.19, -z, 0.36, 0.17, 0.36);
    center.rotation.y = Math.PI / 4;
    glow(scene, texture, 0x8ed6cf, 2.7, 0.45).position.set(x, y + 0.25, -z);
  }
}

function decorate(scene, random, map) {
  const patches = new THREE.Group();
  scene.add(patches);
  const closeToFeature = (x, z, radius) => [...map.lanterns, ...map.pads].some(({ pos }) => Math.hypot(x - pos[0], z - pos[2]) < radius);
  for (const island of map.islands) {
    for (let i = 0; i < 40; i++) {
      const angle = (i + (random() - 0.5) * 0.5) * TAU / 40;
      const distance = (i % 3 ? 0.79 + random() * 0.10 : 0.38 + random() * 0.25) * island.radius;
      const x = island.x + Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (closeToFeature(x, z, 3.2) || (map.bridge && Math.abs(z) < 3.8)) continue;
      const y = groundHeight(map, x, z);
      if (y !== 0) continue;
      const height = 2.7 + random() * 3.4;
      const width = random() + 0.8;
      const trunk = mesh(patches, treeTrunk, wood, x, y + height * 0.30, -z, 0.14, height * 0.60, 0.14);
      trunk.rotation.y = angle;
      if (map.id === 2) {
        for (let leaf = 0; leaf < 5; leaf++) {
          const yaw = leaf * TAU / 5;
          const frond = mesh(patches, treeTop, grassMaterial, x + Math.cos(yaw) * 0.55, y + height * 0.64, -z + Math.sin(yaw) * 0.55, 0.31, 2.4, 0.13);
          frond.rotation.set(Math.PI / 1.9, 0, Math.PI / 2 - yaw, 'YXZ');
        }
      } else {
        for (let level = 0; level < 3; level++) {
          const size = width * (1 - level * 0.22);
          mesh(patches, treeTop, grassMaterial, x, y + height * (0.41 + level * 0.19), -z, size, height * 0.51, size).rotation.y = angle;
        }
      }
    }
    for (let i = 0; i < 230; i++) {
      const angle = random() * TAU;
      const distance = Math.sqrt(random()) * island.radius * 0.92;
      const x = island.x + Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (distance < 4.1 || closeToFeature(x, z, 1.75) || (map.bridge && Math.abs(z) < 2.5)) continue;
      const y = groundHeight(map, x, z);
      if (y !== 0) continue;
      const height = 0.13 + random() * 0.39;
      const type = i % 7 ? grassMaterial : sand;
      mesh(patches, crystal, type, x, y + height * 0.26, -z, 0.07 + random() * 0.37, height * 0.6, 0.1 + random() * 0.37).rotation.y = angle;
    }
  }
  batchStatic(patches);
}

function batchStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  for (const item of group.children) {
    const key = item.geometry.id + '|' + item.material.id;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  group.clear();
  for (const items of buckets.values()) {
    const { geometry, material } = items[0];
    const batch = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, index) => batch.setMatrixAt(index, item.matrix));
    group.add(batch);
  }
}

export function addWorld(scene, texture, map) {
  const random = seededRandom(932 + map.id);
  const root = new THREE.Group();
  scene.add(root);
  sky(root, texture, random);
  const waterTime = ocean(root, map);
  for (const island of map.islands) {
    const ground = new THREE.Group();
    ground.position.set(island.x, 0, -island.z);
    root.add(ground);
    terrain(ground, random, island.radius);
  }
  if (map.bridge) {
    const crossing = new THREE.Group();
    root.add(crossing);
    bridge(crossing, map.bridge);
    batchStatic(crossing);
  }
  if (map.tower) bellLevels(root, map);
  if (map.id === 1) waterfront(root);
  modelPads(root, texture, map);
  decorate(root, random, map);
  return { root, waterTime };
}
