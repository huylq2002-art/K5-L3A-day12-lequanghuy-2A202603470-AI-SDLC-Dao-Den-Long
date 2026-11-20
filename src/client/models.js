import * as THREE from 'three';
import { TUNING as T } from '../core/config.ts';
import { PALETTE as P } from './palette.js';

export const matte = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
export const box = new THREE.BoxGeometry(1, 1, 1);
export const crystal = new THREE.IcosahedronGeometry(1, 0);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const ring = new THREE.RingGeometry(0.99, 1, 64);
const circle = new THREE.CircleGeometry(1, 32);

export function mesh(parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  parent.add(part);
  return part;
}

export function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.47, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function glow(parent, texture, color, size, opacity = 0.8) {
  const material = new THREE.SpriteMaterial({
    map: texture, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  parent.add(sprite);
  return sprite;
}

export function groundDisc(parent, color, opacity, radius, geometry = circle) {
  const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false });
  const part = mesh(parent, geometry, material, 0, 0.026, 0, radius);
  part.rotation.x = -Math.PI / 2;
  return part;
}

export function makePlayer(scene, texture) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  scene.add(root);
  root.add(body);
  const shadow = groundDisc(scene, 0x090e17, 0.34, 0.63);
  shadow.scale.y *= 0.7;
  const navy = matte(0x263440);
  const cloth = matte(P.coat);
  const blue = matte(0xbfbeb1);
  const gold = matte(P.gold);
  const straw = matte(0xe6b265);
  const red = matte(P.scarf);
  const face = matte(0xf2a978);
  const shoes = [];
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.position.set(side * 0.24, 0.36, 0);
    body.add(foot);
    mesh(foot, box, navy, 0, -0.08, 0, 0.24, 0.38, 0.25);
    mesh(foot, box, gold, 0, -0.27, -0.04, 0.27, 0.14, 0.36);
    shoes.push(foot);
    const sleeve = mesh(body, sphere, blue, side * 0.52, 0.91, 0, 0.21, 0.38, 0.24);
    sleeve.rotation.z = side * 0.28;
    mesh(body, sphere, face, side * 0.59, 0.7, -0.03, 0.12);
  }
  mesh(body, new THREE.CylinderGeometry(0.38, 0.54, 0.81, 8), cloth, 0, 0.83, 0);
  mesh(body, box, blue, 0, 0.88, 0.39, 0.46, 0.55, 0.12);
  mesh(body, box, straw, 0, 0.86, 0.46, 0.30, 0.14, 0.05);
  mesh(body, cylinder, red, 0, 1.23, 0, 0.39, 0.16, 0.39);
  const scarf = mesh(body, box, red, 0.15, 1.12, 0.40, 0.18, 0.39, 0.08);
  scarf.rotation.z = 0.27;
  mesh(body, sphere, face, 0, 1.54, -0.03, 0.35, 0.38, 0.33);
  for (const side of [-1, 1]) mesh(body, sphere, navy, side * 0.13, 1.56, -0.34, 0.043);
  mesh(body, new THREE.ConeGeometry(0.79, 0.40, 14), straw, 0, 1.9, 0);
  mesh(body, new THREE.CylinderGeometry(0.79, 0.79, 0.065, 14), gold, 0, 1.69, 0);
  const seam = new THREE.TorusGeometry(0.61, 0.018, 4, 14);
  mesh(body, seam, gold, 0, 1.80, 0).rotation.x = Math.PI / 2;

  const charm = new THREE.Group();
  charm.position.set(0.63, 1.71, 0.27);
  body.add(charm);
  mesh(charm, cylinder, gold, 0, -0.16, 0, 0.025, 0.32, 0.025);
  mesh(charm, sphere, new THREE.MeshBasicMaterial({ color: P.lanternCore }), 0, -0.37, 0, 0.17, 0.21, 0.17);
  mesh(charm, cylinder, gold, 0, -0.19, 0, 0.12, 0.06, 0.12);
  mesh(charm, cylinder, gold, 0, -0.55, 0, 0.12, 0.06, 0.12);
  const halo = glow(charm, texture, 0xffab51, 2.05, 0.82);
  halo.position.y = -0.36;
  const light = new THREE.PointLight(0xffb767, 17, 8, 2);
  light.position.y = -0.42;
  charm.add(light);
  return { root, body, shadow, shoes, charm };
}

const timber = matte(P.wood);
const lacquer = matte(0xb95146);
const brass = matte(P.gold);
const stone = matte(0x657074);
const shadeBody = matte(P.shade);
const shadeStunned = matte(P.shadeStun);
const shadeTentacle = matte(P.shade);
const eyes = new THREE.MeshBasicMaterial({ color: 0xf1bfff });
const moteCore = new THREE.MeshBasicMaterial({ color: P.mote });
const lampCore = new THREE.MeshBasicMaterial({ color: P.lanternCore });

export function makeLantern(texture) {
  const root = new THREE.Group();
  mesh(root, cylinder, stone, 0, 0.10, 0, 1.27, 0.2, 1.27);
  mesh(root, cylinder, timber, 0, 0.23, 0, 1.03, 0.15, 1.03);
  for (const side of [-1, 1]) {
    mesh(root, box, timber, side * 0.87, 1.57, 0, 0.17, 2.82, 0.2);
    mesh(root, box, brass, side * 0.87, 0.50, 0, 0.23, 0.32, 0.25);
    mesh(root, box, lacquer, side * 0.87, 2.67, 0, 0.21, 0.38, 0.23);
  }
  mesh(root, box, lacquer, 0, 2.94, 0, 2.26, 0.21, 0.30);
  mesh(root, box, timber, 0, 3.10, 0, 2.53, 0.14, 0.38);
  mesh(root, cylinder, brass, 0, 2.63, 0, 0.046, 0.42, 0.046);
  const paper = new THREE.MeshLambertMaterial({ color: P.lanternOff, emissive: P.lantern, emissiveIntensity: 0, flatShading: true });
  mesh(root, new THREE.CapsuleGeometry(0.44, 0.44, 3, 10), paper, 0, 1.95, 0, 1, 1, 0.88);
  const core = mesh(root, sphere, lampCore, 0, 1.91, 0, 0.32, 0.48, 0.415);
  for (const y of [1.43, 1.71, 2.20, 2.48]) {
    const width = y === 1.43 || y === 2.48 ? 0.32 : 0.445;
    mesh(root, new THREE.TorusGeometry(width, 0.025, 4, 10), brass, 0, y, 0, 1, 0.88, 1).rotation.x = Math.PI / 2;
  }
  mesh(root, cylinder, lacquer, 0, 1.28, 0, 0.035, 0.27, 0.035);
  const halo = glow(root, texture, 0xff8944, 2.15, 0.48);
  halo.position.y = 1.95;
  const beacon = glow(root, texture, 0xffbb69, 1.48, 0.80);
  beacon.position.y = 3.6;
  const light = new THREE.PointLight(0xffaf60, 0, 17, 2);
  light.position.y = 2.05;
  root.add(light);
  const safe = groundDisc(root, 0xffb067, 0.48, T.safe_radius, ring);
  const warmth = groundDisc(root, 0xf6ab53, 0.085, T.safe_radius);
  return { root, paper, core, halo, beacon, light, safe, warmth };
}

export function makeMote(texture) {
  const root = new THREE.Group();
  mesh(root, crystal, moteCore, 0, 0, 0, 0.10, 0.14, 0.10);
  const halo = glow(root, texture, P.moteGlow, 1.24, 0.77);
  return { root, halo };
}

export function makeShade(texture) {
  const root = new THREE.Group();
  const body = mesh(root, sphere, shadeBody, 0, 0.52, 0, 0.70, 0.94, 0.64);
  const arms = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const arm = mesh(root, sphere, shadeTentacle, Math.sin(angle) * 0.48, 0.43, Math.cos(angle) * 0.48, 0.18, 0.60, 0.20);
    arm.rotation.y = angle;
    arms.push(arm);
  }
  for (const side of [-1, 1]) {
    const eye = mesh(root, sphere, eyes, side * 0.22, 1.12, -0.60, 0.11, 0.067, 0.055);
    eye.rotation.z = side * 0.36;
  }
  const aura = glow(root, texture, P.shadeGlow, 4.1, 0.38);
  aura.position.y = 0.66;
  return { root, arms, aura, setStunned(stunned) { body.material = stunned ? shadeStunned : shadeBody; } };
}

const silk = new THREE.MeshLambertMaterial({ color: P.drifter, emissive: 0x546d89, emissiveIntensity: 0.32, side: THREE.DoubleSide });
const charmPaper = matte(P.scarf);

export function makeDrifter(texture) {
  const root = new THREE.Group();
  const ribbon = new THREE.PlaneGeometry(0.72, 3, 1, 14);
  mesh(root, ribbon, silk);
  const aura = glow(root, texture, P.drifter, 3.7, 0.48);
  return { root, aura, ribbon, dispose() { ribbon.dispose(); } };
}

export function makeWindCharm(texture) {
  const root = new THREE.Group();
  mesh(root, box, brass, 0, 0, 0, 0.42, 0.77, 0.075);
  mesh(root, box, charmPaper, 0, 0, 0, 0.34, 0.68, 0.082);
  mesh(root, crystal, brass, 0, 0.04, 0.045, 0.095, 0.16, 0.02);
  glow(root, texture, P.gold, 2.4, 0.5);
  return { root };
}
