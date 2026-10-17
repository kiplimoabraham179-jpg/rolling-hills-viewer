import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_GRID, groundAt, heightAt, runwayWeight, seededRandom } from './landscape-geometry';
import { SEA_LEVEL, roadDist } from './game-world';

/** Pure, deterministic chunk generation for the streamed open world. */
export const CHUNK_SIZE = 80;
export const CHUNK_SEGMENTS = 32;
if (CHUNK_SIZE / CHUNK_SEGMENTS !== GROUND_GRID) throw new Error('GROUND_GRID must match chunk spacing');
const ROAD_CLEAR = 5;
export const CHUNK_RADIUS = 2; // chunks loaded in each direction around the player

export type ChunkColors = Record<'grass' | 'grassLight' | 'forest' | 'mountain' | 'mist' | 'bark' | 'leafLight' | 'sun' | 'sand' | 'water' | 'waterDeep' | 'foam', THREE.Color>;

const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** 0..1 forest density, shared by terrain tint and tree placement. */
export function forestAt(x: number, z: number) {
  const n = .5 + .3 * Math.sin(x * .021 + 1.3) * Math.cos(z * .017 - .7) + .2 * Math.sin((x + z) * .043);
  const near = THREE.MathUtils.smoothstep(Math.hypot(x, z), 26, 60);
  return THREE.MathUtils.clamp(n * near * (1 - runwayWeight(x, z)), 0, 1);
}

function colorAt(x: number, z: number, y: number, c: ChunkColors, out: THREE.Color) {
  out.copy(c.grass).lerp(c.grassLight, .22 + .18 * Math.sin(x * .13 + z * .05));
  out.lerp(c.forest, forestAt(x, z) * .75);
  out.lerp(c.mountain, THREE.MathUtils.smoothstep(y, 26, 48) * .85);
  out.lerp(c.foam, THREE.MathUtils.smoothstep(y, 95, 125) * .9); // snow caps
  out.lerp(c.sand, 1 - THREE.MathUtils.smoothstep(y, SEA_LEVEL + .8, SEA_LEVEL + 3));
  // underwater: shallows turn turquoise, depths deep blue; a pale foam line marks the shore
  const depth = SEA_LEVEL - y;
  if (depth > 0) out.lerp(c.water, THREE.MathUtils.smoothstep(depth, 0, 2.5) * .7).lerp(c.waterDeep, THREE.MathUtils.smoothstep(depth, 2, 12) * .85);
  out.lerp(c.sand, Math.max(0, 1 - Math.abs(depth) / .65) * .35);
  return out;
}

export type Item = { kind: 'pine' | 'broadleaf' | 'shrub' | 'grass' | 'log' | 'rock' | 'flower'; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: number };
export type Obstacle = { x: number; z: number; r: number; bottom: number; top: number; kind: 'tree' | 'rock' };
const itemCache = new Map<string, Item[]>(), obstacleCache = new Map<string, Obstacle[]>();

/** Deterministic decoration list for a chunk (shared by rendering and collision). */
export function chunkItems(cx: number, cz: number): Item[] {
  const key = `${cx},${cz}`, hit = itemCache.get(key); if (hit) return hit;
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, random = seededRandom(hash(cx, cz)), out: Item[] = [];
  for (let i = 0; i < 260; i++) {
    const x = ox + (random() - .5) * CHUNK_SIZE, z = oz + (random() - .5) * CHUNK_SIZE;
    const r = random(), y = groundAt(x, z), f = forestAt(x, z), d = Math.hypot(x, z);
    if (d < 14 || y < SEA_LEVEL + 1 || roadDist(x, z) < ROAD_CLEAR || runwayWeight(x, z) > .02) continue; // clear hill, roads, airfield
    if (y < 40 && r < f * .75) {
      const h = 2 + random() * 3.6, w = .8 + random() * .8;
      const kind = random() < .3 ? 'broadleaf' : 'pine';
      if (out.some(it => (it.kind === 'pine' || it.kind === 'broadleaf') && Math.hypot(it.x - x, it.z - z) < it.sx + w + .7)) continue;
      out.push({ kind, x, y, z, sx: w, sy: h, sz: w, ry: random() * 6, tint: random() * .55 });
    } else if (r > .93) {
      const s = .3 + random() * (y > 26 ? 1.6 : .7);
      out.push({ kind: 'rock', x, y, z, sx: s * 1.3, sy: s * .8, sz: s, ry: random() * 6, tint: random() * .3 });
    } else if (r > .86 && f < .4 && y < 26) {
      out.push({ kind: 'flower', x, y: y + .2, z, sx: 1, sy: 1, sz: 1, ry: 0, tint: random() > .5 ? 1 : 0 });
    } else if (r > .78 && y < 40) {
      out.push({ kind: f > .55 ? 'shrub' : 'grass', x, y, z, sx: .5 + random() * .4, sy: .5 + random() * .5, sz: .5, ry: random() * 6, tint: random() });
    }
  }
  if (itemCache.size > 300) itemCache.clear();
  itemCache.set(key, out);
  return out;
}

function chunkObstacles(cx: number, cz: number): Obstacle[] {
  const key = `${cx},${cz}`, hit = obstacleCache.get(key); if (hit) return hit;
  const out: Obstacle[] = [];
  for (const it of chunkItems(cx, cz)) {
    if (it.kind === 'pine' || it.kind === 'broadleaf') out.push({ kind: 'tree', x: it.x, z: it.z, r: Math.max(.24, it.sx * .22), bottom: it.y, top: it.y + it.sy * 1.15 });
    else if (it.kind === 'rock') out.push({ kind: 'rock', x: it.x, z: it.z, r: Math.max(it.sx, it.sz), bottom: it.y - .1, top: it.y + it.sy * 1.7 });
  }
  if (obstacleCache.size > 300) obstacleCache.clear();
  obstacleCache.set(key, out);
  return out;
}

const GOLDEN_TREE: Obstacle = { kind: 'tree', x: 0, z: 0, r: 1.1, bottom: -50, top: 1e3 };
export type Contact = { hit: boolean; x: number; z: number; kind?: Obstacle['kind'] };
/** Push a vertical cylinder (radius, base y, height) out of every tree and rock it overlaps. */
export function collideCircle(x: number, z: number, y: number, radius: number, height = 1.6): Contact {
  const res: Contact = { hit: false, x, z };
  const ccx = Math.round(x / CHUNK_SIZE), ccz = Math.round(z / CHUNK_SIZE);
  const list: Obstacle[][] = [[{ ...GOLDEN_TREE, top: heightAt(0, 0) + 9 }]];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) list.push(chunkObstacles(ccx + i, ccz + j));
  for (let pass = 0; pass < 4; pass++) for (const arr of list) for (const o of arr) {
    if (y > o.top - .15 || y + height < o.bottom) continue;
    const dx = res.x - o.x, dz = res.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
    if (d >= min) continue;
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
    res.x = o.x + nx * min; res.z = o.z + nz * min; res.hit = true; res.kind = o.kind;
  }
  return res;
}

/** Sample a swept motion in short intervals so fast vehicles cannot skip trunks. */
export function sweepCircle(fromX: number, fromZ: number, x: number, z: number, y: number, radius: number, height: number): Contact {
  const steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / Math.max(.18, radius * .4)));
  let px = fromX, pz = fromZ;
  for (let i = 1; i <= steps; i++) {
    const hit = collideCircle(fromX + (x - fromX) * i / steps, fromZ + (z - fromZ) * i / steps, y, radius, height);
    if (hit.hit) return hit;
    px = hit.x; pz = hit.z;
  }
  return { hit: false, x: px, z: pz };
}

/** Coarse reachable horizon: every vertex uses the very same infinite height field. */
export function makeFarTerrain(cx: number, cz: number, colors: ChunkColors) {
  const step = 20, half = 40, p: number[] = [], c: number[] = [], indices: number[] = [], tmp = new THREE.Color();
  for (let z = -half; z <= half; z++) for (let x = -half; x <= half; x++) {
    const wx = cx * CHUNK_SIZE + x * step, wz = cz * CHUNK_SIZE + z * step, y = heightAt(wx, wz);
    p.push(wx, y - .35, wz); colorAt(wx, wz, y, colors, tmp).toArray(c, c.length);
    if (x < half && z < half) {
      // Leave a hole beneath the detailed chunk safety area.
      if (Math.abs(x * step + step / 2) < 120 && Math.abs(z * step + step / 2) < 120) continue;
      const i = (z + half) * (half * 2 + 1) + x + half;
      indices.push(i, i + half * 2 + 1, i + 1, i + 1, i + half * 2 + 1, i + half * 2 + 2);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function makeChunk(cx: number, cz: number, colors: ChunkColors) {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const terrain = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
  terrain.rotateX(-Math.PI / 2);
  const p = terrain.getAttribute('position');
  const col = new Float32Array(p.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, z = p.getZ(i) + oz, y = heightAt(x, z);
    p.setXYZ(i, x, y, z);
    colorAt(x, z, y, colors, tmp).toArray(col, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // normals from the height function so chunk edges shade seamlessly
  const nrm = terrain.getAttribute('normal'), e = .5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const n = new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  terrain.computeBoundingSphere();

  // decorations merged into one vertex-colored mesh: pines, rocks, flowers
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: THREE.Color, it: Item, yOff: number) => {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute('uv');
    geo.scale(it.sx, it.sy, it.sz); geo.rotateY(it.ry); geo.translate(it.x, it.y + yOff, it.z);
    const c = new Float32Array(geo.getAttribute('position').count * 3);
    for (let i = 0; i < c.length; i += 3) color.toArray(c, i);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(geo);
  };
  for (const it of chunkItems(cx, cz)) {
    if (it.kind === 'pine' || it.kind === 'broadleaf') {
      add(new THREE.CylinderGeometry(.1, .2, .6, 6), colors.bark, it, it.sy * .3);
      const leaf = colors.forest.clone().lerp(colors.grassLight, it.tint);
      if (it.kind === 'pine') {
        add(new THREE.ConeGeometry(1, .75, 7), leaf, it, it.sy * .52);
        add(new THREE.ConeGeometry(.75, .6, 7), leaf.clone().lerp(colors.grassLight, .12), it, it.sy * .8);
      } else add(new THREE.IcosahedronGeometry(1, 1).scale(1.4, .48, 1.2), leaf, it, it.sy * .75);
    } else if (it.kind === 'rock') add(new THREE.DodecahedronGeometry(1, 0), colors.mountain.clone().lerp(colors.mist, it.tint), it, it.sy * .75);
    else if (it.kind === 'shrub') add(new THREE.IcosahedronGeometry(.8, 1), colors.grass.clone().lerp(colors.forest, .4), it, it.sy * .5);
    else if (it.kind === 'grass') {
      for (let blade = 0; blade < 3; blade++) add(new THREE.ConeGeometry(.08, .8, 3).rotateZ((blade - 1) * .3), colors.grassLight, it, it.sy * .4);
    } else add(new THREE.IcosahedronGeometry(.18, 0), it.tint ? colors.sun : colors.leafLight, it, 0);
  }
  const deco = parts.length ? mergeGeometries(parts) : null;
  parts.forEach(g => g.dispose());
  deco?.computeVertexNormals();
  return { terrain, deco };
}
