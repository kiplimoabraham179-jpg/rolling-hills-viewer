import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { basinHeight } from './geography';
export { LAKE, PEAK, drainageAt, noiseAt, riverX, riverLevel, riverHalfWidth, waterLevelAt } from './geography';

export function seededRandom(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Airfield: a flattened strip west of the start hill, runway along the X axis. */
export const RUNWAY = { x: -120, z: 25, halfLength: 70, halfWidth: 9, h: 0 } as const;
export function runwayWeight(x: number, z: number) {
  const dx = Math.abs(x - RUNWAY.x), dz = Math.abs(z - RUNWAY.z);
  return (1 - THREE.MathUtils.smoothstep(dx, RUNWAY.halfLength + 8, RUNWAY.halfLength + 30)) * (1 - THREE.MathUtils.smoothstep(dz, RUNWAY.halfWidth + 8, RUNWAY.halfWidth + 28));
}
function baseHeight(x: number, z: number) {
  const hill = 8 * Math.exp(-(x * x / 850 + z * z / 1000));
  const rolls = 3.2 * Math.sin(x * .047 + .4) * Math.cos(z * .052) + 1.2 * Math.sin(z * .11 + x * .025);
  const valley = -9 * Math.exp(-((z + 42) ** 2 / 450)) * Math.exp(-(x * x / 900));
  const slopes = 20 * Math.exp(-((Math.abs(x) - 67) ** 2 / 800 + (z + 48) ** 2 / 3000));
  const start = hill + rolls + valley + slopes - 3;
  const blend = THREE.MathUtils.smoothstep(Math.hypot(x, z), 24, 90);
  let land = start + (basinHeight(x, z) - start) * blend;
  // Traversable road corridors: smooth the same heightfield used by the ribbons/contact.
  const roadX = (z: number) => 22 * Math.sin(z / 65) + 10 * Math.sin(z / 23 + 1) - 10 * Math.sin(1);
  if (z > 10 && z < 400) {
    const w = 1 - THREE.MathUtils.smoothstep(Math.abs(x - roadX(z)), 4, 14);
    const center = basinHeight(roadX(z), z);
    const target = start + (center - start) * blend;
    land += (target - land) * w;
  }
  // Broad west/east mountain pass follows the existing winding road.
  if (x > -420 && x < 420) {
    const rz = 70 + 18 * Math.sin(x / 55), w = 1 - THREE.MathUtils.smoothstep(Math.abs(z - rz), 4, 15);
    land += (basinHeight(x, rz) - land) * w * THREE.MathUtils.smoothstep(Math.hypot(x, z), 30, 90);
  }
  return land;
}

/** Infinite, deterministic ground height (used by streamed chunks). */
export function heightAt(x: number, z: number) {
  const w = runwayWeight(x, z), b = baseHeight(x, z);
  return w > 0 ? b + (RUNWAY.h - b) * w : b;
}

/** Terrain mesh grid spacing (CHUNK_SIZE / CHUNK_SEGMENTS). */
export const GROUND_GRID = 2.5;
/** Exact height of the rendered terrain triangles, so contact never sinks or floats. */
export function groundAt(x: number, z: number) {
  const gx = x / GROUND_GRID, gz = z / GROUND_GRID, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const x0 = ix * GROUND_GRID, z0 = iz * GROUND_GRID, x1 = x0 + GROUND_GRID, z1 = z0 + GROUND_GRID;
  const hb = heightAt(x0, z1), hd = heightAt(x1, z0);
  if (fx + fz <= 1) { const ha = heightAt(x0, z0); return ha + (hd - ha) * fx + (hb - ha) * fz; }
  const hc = heightAt(x1, z1); return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}

export function makeTerrain(grass: THREE.Color, light: THREE.Color, forest: THREE.Color) {
  const geometry = new THREE.PlaneGeometry(300, 300, 110, 110);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, heightAt(x, z));
    const distance = Math.hypot(x, z);
    color.copy(grass).lerp(light, .22 + .18 * Math.sin(x * .13 + z * .05));
    color.lerp(forest, THREE.MathUtils.smoothstep(distance, 28, 100) * .7);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function makeMountains(radius: number, height: number, seed: number) {
  const random = seededRandom(seed);
  const segments = 160, rows = 9;
  const peaks = Array.from({ length: segments + 1 }, (_, i) => height * (.68 + .18 * Math.sin(i * .3) + .13 * Math.sin(i * .93) + random() * .16));
  peaks[segments] = peaks[0] ?? height;
  const vertices: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const r = radius + (t - .5) * 65;
      const y = -13 + (peaks[i] ?? height) * Math.sin(t * Math.PI) ** .85 + 2 * Math.sin(a * 17 + t * 12) * Math.sin(t * Math.PI);
      vertices.push(Math.sin(a) * r, y, Math.cos(a) * r);
      if (row < rows && i < segments) {
        const v = row * (segments + 1) + i;
        indices.push(v, v + 1, v + segments + 1, v + 1, v + segments + 2, v + segments + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeTree() {
  const random = seededRandom(317);
  const branches: THREE.BufferGeometry[] = [];
  const leaves: { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler; tint: number }[] = [];
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(top, bottom, dir.length(), 7, 3);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geo.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    branches.push(geo);
  }
  function foliage(center: THREE.Vector3, size: number) {
    for (let i = 0; i < 42; i++) {
      const a = random() * Math.PI * 2, cos = random() * 2 - 1;
      const r = Math.cbrt(random()) * size;
      const sin = Math.sqrt(1 - cos * cos);
      const s = .13 + random() * .15;
      leaves.push({
        position: center.clone().add(new THREE.Vector3(Math.cos(a) * sin * r, cos * r * .65, Math.sin(a) * sin * r)),
        scale: new THREE.Vector3(s * 1.6, s * .55, s),
        rotation: new THREE.Euler(random() * 3, random() * 6, random() * 3), tint: random(),
      });
    }
  }
  const base = new THREE.Vector3(0, 0, 0), fork = new THREE.Vector3(.25, 4.3, .1);
  branch(base, fork, .65, .36);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * 3.7, 7.8 + random() * 1.2, Math.sin(a) * 3.4);
    branch(fork, end, .29, .13);
    for (let j = 0; j < 4; j++) {
      const angle = a + (j - 1.5) * .42;
      const radius = 4.8 + random() * 1.3;
      const tip = new THREE.Vector3(Math.cos(angle) * radius, 9.2 + random() * 1.4, Math.sin(angle) * radius * .82);
      branch(end, tip, .13, .045);
      foliage(tip, .95);
      for (let k = 0; k < 3; k++) {
        const twig = tip.clone().add(new THREE.Vector3((random() - .5) * 1.6, .3 + random() * 1.25, (random() - .5) * 1.5));
        branch(tip, twig, .045, .014);
        foliage(twig, .85);
      }
    }
  }
  for (let i = 0; i < 35; i++) {
    const a = random() * Math.PI * 2, r = random() * 3.9;
    const tip = new THREE.Vector3(Math.cos(a) * r, 11.3 + .6 * (1 - r / 4) + random() * .8, Math.sin(a) * r);
    branch(fork, tip, .08, .015);
    foliage(tip, 1.1);
  }
  const geometry = mergeGeometries(branches);
  branches.forEach(g => g.dispose());
  return { geometry, leaves };
}

export function makeGrassTexture() {
  const random = seededRandom(78), size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = 185 + random() * 65;
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(120, 120);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}