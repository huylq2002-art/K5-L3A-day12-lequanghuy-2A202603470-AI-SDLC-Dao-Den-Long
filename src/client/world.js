import * as THREE from 'three';
import { LANTERN_LAYOUT, TUNING as T } from '../core/config.ts';
import { seededRandom } from '../core/math.js';
import { box, crystal, glow, matte, mesh } from './models.js';

const TAU = 2 * Math.PI;
const flat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });

const vertexShader = `
  varying vec3 world;
  void main() {
    world = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyShader = `
  vec3 skyColor(vec3 view) {
    vec3 low = vec3(0.123, 0.104, 0.185);
    vec3 high = vec3(0.012, 0.027, 0.068);
    vec3 color = mix(low, high, smoothstep(-0.09, 0.43, view.y));
    vec3 moon = normalize(vec3(-0.31, 0.08, -1.0));
    return color + vec3(0.17, 0.12, 0.105) * pow(max(dot(view, moon), 0.0), 22.0);
  }
`;

function landscapeMesh(points, colors, scene) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  mesh(scene, geometry, flat);
}

function terrain(scene, random) {
  const points = [];
  const colors = [];
  const groundGreen = new THREE.Color(0x3c6b5b);
  const roughGreen = new THREE.Color(0x405c56);
  const sand = new THREE.Color(0x9b8067);
  const cliff = new THREE.Color(0x534a55);
  const colorVariation = [0.07, 0.19];
  const count = 72;
  const rings = [0, 4, 9, 14, 19, 24, 29, 32.2, 34.3, T.island_radius, 36.8, 35.6];
  const vertices = rings.map((radius, index) => Array.from({ length: count }, (_, i) => {
    const angle = (i + (index % 2) * 0.5) * TAU / count;
    const width = radius + (index > 0 && index < 9 ? (random() - 0.5) * 1.25 : 0);
    const y = index < 10 ? 0 : (index === 10 ? -0.83 : -2.2) + (random() - 0.5) * 0.24;
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
  const border = mesh(scene, new THREE.RingGeometry(35.6, 35.75, count), new THREE.MeshBasicMaterial({ color: 0xbda082, transparent: true, opacity: 0.38 }), 0, 0.012, 0);
  border.rotation.x = -Math.PI / 2;
}

function ocean(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader,
    fragmentShader: `
      uniform float uTime;
      varying vec3 world;
      ${skyShader}
      void main() {
        float field = sin(world.z * 2.3 + sin(world.x * 0.23 + uTime * 0.19) * 1.7 + uTime * 0.52);
        float waves = smoothstep(0.81, 0.99, field) * (0.4 + 0.6 * sin(world.x * 0.67 - world.z * 0.14));
        float reflection = exp(-abs(world.x + 29.0 + sin(world.z * 0.83) * 4.4) * 0.13);
        float edge = length(world.xz) - 35.9;
        float foam = exp(-abs(edge - 1.2 + sin(world.x * 0.63 + uTime * 0.85) * 0.35) * 3.0) * 0.23;
        foam += exp(-abs(edge - 2.3 + sin(world.z * 0.44 - uTime * 0.71) * 0.3) * 3.8) * 0.12;
        vec3 sea = vec3(0.016, 0.038, 0.068) + waves * vec3(0.022, 0.04, 0.057);
        sea += (max(0.0, waves) * reflection * 0.20 + foam) * vec3(0.37, 0.38, 0.45);
        float fog = smoothstep(36.0, 154.0, distance(cameraPosition, world));
        gl_FragColor = vec4(mix(sea, skyColor(normalize(world - cameraPosition)), fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mesh(scene, new THREE.PlaneGeometry(1900, 1900), material, 0, -1.62, 0).rotation.x = -Math.PI / 2;
  return material.uniforms.uTime;
}

function sky(scene, texture, random) {
  const material = new THREE.ShaderMaterial({
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
  dome.renderOrder = -5;
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

function setPieces(scene, random) {
  const treeGeometry = new THREE.ConeGeometry(1, 1, 6);
  const trunkGeometry = new THREE.CylinderGeometry(0.64, 1, 1, 6);
  const bark = matte(0x5b484b);
  const trees = [0x244b48, 0x2e6256, 0x315658, 0x46665d].map(matte);
  const treeSpots = [[-10, -13], [11, -14], [-9, -7], [9, -5], [-16, 2], [12, 12], [-11, 15], [6, 18], [-7, -22], [6, -20]];
  for (let i = 0; i < 35; i++) {
    const angle = (i + (random() - 0.5) * 0.6) * TAU / 35;
    const radius = 28.5 + random() * 4.7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (z < -25 && Math.abs(x) < 9) continue;
    if (LANTERN_LAYOUT.some(({ pos }) => Math.hypot(x - pos[0], z + pos[2]) < 3.7)) continue;
    treeSpots.push([x, z]);
  }
  for (const [x, z] of treeSpots) {
    const height = 2.7 + random() * 3.4;
    const width = 0.8 + random() * 1.0;
    mesh(scene, trunkGeometry, bark, x, height * 0.25, z, height * 0.043, height * 0.5, height * 0.043);
    for (let level = 0; level < 3; level++) {
      const size = width * (1 - level * 0.21);
      const canopy = mesh(scene, treeGeometry, trees[(level + Math.floor(random() * 3)) % trees.length], x, height * (0.41 + level * 0.19), z, size, height * 0.51, size);
      canopy.rotation.y = random() * TAU;
    }
  }

  const trail = [0x747d6a, 0x897f72, 0x67766b, 0x7c826c].map(matte);
  for (const { pos } of LANTERN_LAYOUT) {
    const distance = Math.hypot(pos[0], pos[2]);
    for (let i = 3; i < distance - 1; i += 1.35) {
      const offset = (random() - 0.5) * 1.45;
      const x = (pos[0] * i - pos[2] * offset) / distance;
      const z = -(pos[2] * i + pos[0] * offset) / distance;
      const stone = mesh(scene, crystal, trail[Math.floor(random() * trail.length)], x, 0.035, z, 0.26 + random() * 0.4, 0.09, 0.33 + random() * 0.5);
      stone.rotation.y = random() * TAU;
    }
  }
  for (let i = 0; i < 35; i++) {
    const angle = i * TAU / 35 + random() * 0.19;
    const radius = 31.5 + random() * 3;
    const rock = mesh(scene, crystal, trail[i % trail.length], Math.cos(angle) * radius, 0.13, Math.sin(angle) * radius, 0.8 + random(), 0.48 + random(), 0.6 + random());
    rock.rotation.y = angle;
  }

  const wood = matte(0x725350);
  const roof = matte(0x7a4654);
  const roofEdge = matte(0xaa665a);
  const steps = matte(0x74807a);
  const house = new THREE.Group();
  house.position.set(-3.6, 0, -30.8);
  house.rotation.y = 0.12;
  scene.add(house);
  mesh(house, box, steps, 0, 0.18, 0, 5.6, 0.36, 3.7);
  mesh(house, box, wood, 0, 0.4, 0, 4.72, 0.18, 3.14);
  const posts = [-2.07, 2.07];
  for (const x of posts) {
    for (const z of [-1.29, 1.29]) mesh(house, box, wood, x, 1.73, z, 0.25, 2.67, 0.25);
  }
  mesh(house, box, wood, 0, 1.68, -1.34, 3.85, 2.34, 0.20);
  const gable = new THREE.CylinderGeometry(0, 1, 1, 4);
  const mainRoof = mesh(house, gable, roof, 0, 3.62, 0, 3.63, 1.18, 2.75);
  mainRoof.rotation.y = Math.PI / 4;
  mesh(house, box, roofEdge, 0, 3.06, 0, 5.35, 0.14, 3.96);
  const crown = mesh(house, gable, roof, 0, 4.10, 0, 2.02, 0.62, 1.63);
  crown.rotation.y = Math.PI / 4;

  const dock = new THREE.Group();
  dock.position.set(4.1, 0, -32.1);
  scene.add(dock);
  for (let i = 0; i < 19; i++) {
    const z = -i * 0.47;
    mesh(dock, box, i % 3 ? wood : roofEdge, 0, -0.05, z, 2.25, 0.19, 0.43);
    if (i % 4 === 0) {
      for (const x of [-1.02, 1.02]) mesh(dock, box, wood, x, -0.26, z, 0.19, 1.9, 0.19);
    }
  }
}

function grass(scene, random) {
  const geometry = new THREE.ConeGeometry(1, 1, 3);
  const patches = new THREE.InstancedMesh(geometry, matte(0xffffff), 690);
  const transform = new THREE.Object3D();
  const colors = [0x5c866d, 0x6a8c73, 0x385f54, 0x57766a].map(color => new THREE.Color(color));
  let i = 0;
  while (i < patches.count) {
    const angle = random() * TAU;
    const radius = Math.sqrt(random()) * 33.25;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (radius < 4.1 || LANTERN_LAYOUT.some(({ pos }) => Math.hypot(x - pos[0], z + pos[2]) < 2.1)) continue;
    const height = 0.18 + random() * 0.43;
    transform.position.set(x, height * 0.33, z);
    transform.rotation.set((random() - 0.5) * 0.59, angle, (random() - 0.5) * 0.54);
    transform.scale.set(0.09 + random() * 0.19, height, 0.07 + random() * 0.12);
    transform.updateMatrix();
    patches.setMatrixAt(i, transform.matrix);
    patches.setColorAt(i++, colors[Math.floor(random() * colors.length)]);
  }
  scene.add(patches);
}

export function addWorld(scene, texture) {
  const random = seededRandom(932);
  sky(scene, texture, random);
  const waterTime = ocean(scene);
  terrain(scene, random);
  setPieces(scene, random);
  grass(scene, random);
  return waterTime;
}
