import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_GRID, drainageAt, noiseAt, groundAt, heightAt, runwayWeight, seededRandom } from './landscape-geometry';
import { SEA_LEVEL, roadDist } from './game-world';

/** Finite, deterministic world: all playable chunks are built before gameplay starts. */
export const CHUNK_SIZE = 160;
export const CHUNK_SEGMENTS = 64;
if (CHUNK_SIZE / CHUNK_SEGMENTS !== GROUND_GRID) throw new Error('GROUND_GRID must match chunk spacing');
const ROAD_CLEAR = 5;
export const WORLD_CHUNKS = { minX: -4, maxX: 4, minZ: -7, maxZ: 4 } as const;
export const WORLD_BOUNDS = { minX: -720, maxX: 720, minZ: -1200, maxZ: 800 } as const;
const COLLISION_CELL = 20, MAX_OBSTACLE_RADIUS = 5;
const worldObstacleGrid = new Map<string, Obstacle[]>();
let worldPreloaded = false;
export const worldGenerationStats = { chunksBuilt: 0, collisionCellsBuilt: 0, runtimeGenerationCalls: 0 };

export function beginWorldPreload() {
  worldPreloaded = false;
  worldObstacleGrid.clear();
  worldGenerationStats.chunksBuilt = 0;
  worldGenerationStats.collisionCellsBuilt = 0;
  worldGenerationStats.runtimeGenerationCalls = 0;
}
export function finishWorldPreload() { worldPreloaded = true; }
const insideChunkRange = (cx: number, cz: number) => cx >= WORLD_CHUNKS.minX && cx <= WORLD_CHUNKS.maxX && cz >= WORLD_CHUNKS.minZ && cz <= WORLD_CHUNKS.maxZ;
export function clampWorldPosition<T extends { x: number; z: number }>(position: T, margin = 1): T {
  position.x = THREE.MathUtils.clamp(position.x, WORLD_BOUNDS.minX + margin, WORLD_BOUNDS.maxX - margin);
  position.z = THREE.MathUtils.clamp(position.z, WORLD_BOUNDS.minZ + margin, WORLD_BOUNDS.maxZ - margin);
  return position;
}

export type ChunkColors = Record<'grass' | 'grassLight' | 'forest' | 'mountain' | 'mist' | 'bark' | 'leafLight' | 'sun' | 'sand' | 'earth' | 'water' | 'waterShallow' | 'waterDeep' | 'foam', THREE.Color>;

const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** 0..1 forest density, shared by terrain tint and tree placement. */
export function forestAt(x: number, z: number) {
  const y = heightAt(x, z), slope = slopeAt(x, z);
  const n = .22 + .8 * noiseAt(x / 110, z / 100) + .15 * noiseAt(x / 24 + 6, z / 24);
  const near = THREE.MathUtils.smoothstep(Math.hypot(x, z), 26, 60);
  const flank = .6 + .4 * THREE.MathUtils.smoothstep(y, 12, 60);
  return THREE.MathUtils.clamp(n * flank * near * (1 - runwayWeight(x, z)) * (1 - THREE.MathUtils.smoothstep(y, 115, 175)) * (1 - THREE.MathUtils.smoothstep(slope, 1.1, 2)), 0, 1);
}

export function slopeAt(x: number, z: number) {
  return Math.hypot(heightAt(x + 2.5, z) - heightAt(x - 2.5, z), heightAt(x, z + 2.5) - heightAt(x, z - 2.5)) / 5;
}

function colorAt(x: number, z: number, y: number, c: ChunkColors, out: THREE.Color) {
  const slope = slopeAt(x, z), d = drainageAt(x, z);
  out.copy(c.grass).lerp(c.grassLight, .15 + noiseAt(x / 22, z / 22) * .27);
  out.lerp(c.forest, forestAt(x, z) * .65);
  out.lerp(c.earth, THREE.MathUtils.smoothstep(slope, .45, .95) * .6);
  out.lerp(c.mountain, Math.max(THREE.MathUtils.smoothstep(slope, .8, 1.7), THREE.MathUtils.smoothstep(y, 100, 180)) * .95);
  out.lerp(c.foam, THREE.MathUtils.smoothstep(y + noiseAt(x / 32, z / 32) * 20, 225, 285) * (1 - THREE.MathUtils.smoothstep(slope, 1.2, 2.4)));
  out.lerp(c.sand, (1 - THREE.MathUtils.smoothstep(Math.abs(d.distance), 2, 15)) * (1 - THREE.MathUtils.smoothstep(slope, .5, 1.3)));
  // underwater: shallows turn turquoise, depths deep blue; a pale foam line marks the shore
  const depth = d.level - y;
  if (depth > 0 && d.distance < 0) out.lerp(c.waterShallow, THREE.MathUtils.smoothstep(depth, 0, 2.5) * .55).lerp(c.waterDeep, THREE.MathUtils.smoothstep(depth, 2, 18) * .65);
  out.lerp(c.sand, Math.max(0, 1 - Math.abs(depth) / .65) * .35);
  return out;
}

export type Item = { kind: 'pine' | 'broadleaf' | 'shrub' | 'grass' | 'log' | 'rock' | 'flower'; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tint: number };
export type Obstacle = { x: number; z: number; r: number; bottom: number; top: number; kind: 'tree' | 'rock' };
const itemCache = new Map<string, Item[]>(), obstacleCache = new Map<string, Obstacle[]>();

/** Deterministic decoration list for a chunk (shared by rendering and collision). */
export function chunkItems(cx: number, cz: number): Item[] {
  const key = `${cx},${cz}`, hit = itemCache.get(key); if (hit) return hit;
  if (!insideChunkRange(cx, cz) || worldPreloaded) { if (worldPreloaded) worldGenerationStats.runtimeGenerationCalls++; return []; }
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, random = seededRandom(hash(cx, cz)), out: Item[] = [];
  const candidates = Math.abs(cx) <= 1 && Math.abs(cz) <= 1 ? 700 : 220;
  for (let i = 0; i < candidates; i++) {
    const x = ox + (random() - .5) * CHUNK_SIZE, z = oz + (random() - .5) * CHUNK_SIZE;
    const r = random(), y = groundAt(x, z), f = forestAt(x, z), d = Math.hypot(x, z);
    const drainage = drainageAt(x, z), slope = slopeAt(x, z);
    if (d < 14 || (drainage.distance < 3 && y < drainage.level + 2) || roadDist(x, z) < ROAD_CLEAR || runwayWeight(x, z) > .02 || slope > 1.8) continue;
    if (y < 165 && r < f * .7) {
      const h = 4 + random() * 6, w = 1.2 + random() * 1.2;
      const kind = random() < (y > 45 ? .08 : .3) ? 'broadleaf' : 'pine';
      if (out.some(it => (it.kind === 'pine' || it.kind === 'broadleaf') && Math.hypot(it.x - x, it.z - z) < it.sx + w + .7)) continue;
      out.push({ kind, x, y, z, sx: w, sy: h, sz: w, ry: random() * 6, tint: random() * .55 });
    } else if (r > (y > 80 ? .83 : .94)) {
      const s = .3 + random() * (y > 80 ? 2.7 : 1.2);
      out.push({ kind: 'rock', x, y, z, sx: s * 1.3, sy: s * .8, sz: s, ry: random() * 6, tint: random() * .3 });
    } else if (r > .86 && f < .5 && y < 60) {
      out.push({ kind: 'flower', x, y: y + .2, z, sx: 1, sy: 1, sz: 1, ry: 0, tint: random() > .5 ? 1 : 0 });
    } else if (r > .72 && y < 130) {
      out.push({ kind: f > .55 ? 'shrub' : 'grass', x, y, z, sx: .5 + random() * .4, sy: .5 + random() * .5, sz: .5, ry: random() * 6, tint: random() });
    }
  }
  itemCache.set(key, out);
  return out;
}

function chunkObstacles(cx: number, cz: number): Obstacle[] {
  const key = `${cx},${cz}`, hit = obstacleCache.get(key); if (hit) return hit;
  if (!insideChunkRange(cx, cz) || worldPreloaded) { if (worldPreloaded) worldGenerationStats.runtimeGenerationCalls++; return []; }
  const out: Obstacle[] = [];
  for (const it of chunkItems(cx, cz)) {
    if (it.kind === 'pine' || it.kind === 'broadleaf') out.push({ kind: 'tree', x: it.x, z: it.z, r: Math.max(.24, it.sx * .22), bottom: it.y, top: it.y + it.sy * 1.15 });
    else if (it.kind === 'rock') out.push({ kind: 'rock', x: it.x, z: it.z, r: Math.max(it.sx, it.sz), bottom: it.y - .1, top: it.y + it.sy * 1.7 });
  }
  obstacleCache.set(key, out);
  for (const obstacle of out) {
    const gx = Math.floor(obstacle.x / COLLISION_CELL), gz = Math.floor(obstacle.z / COLLISION_CELL), cell = `${gx},${gz}`;
    const list = worldObstacleGrid.get(cell);
    if (list) list.push(obstacle); else worldObstacleGrid.set(cell, [obstacle]);
  }
  return out;
}

/** Prebuilds the obstacle lookup used by all movement after the loading screen. */
export function preloadChunkCollision(cx: number, cz: number) { chunkObstacles(cx, cz); }

const GOLDEN_TREE: Obstacle = { kind: 'tree', x: 0, z: 0, r: 1.1, bottom: -50, top: 1e3 };
export type Contact = { hit: boolean; x: number; z: number; kind?: Obstacle['kind'] };
/** Push a vertical cylinder (radius, base y, height) out of every tree and rock it overlaps. */
export function collideCircle(x: number, z: number, y: number, radius: number, height = 1.6): Contact {
  const res: Contact = { hit: false, x, z };
  const nearby: Obstacle[] = [{ ...GOLDEN_TREE, top: heightAt(0, 0) + 9 }];
  const reach = radius + MAX_OBSTACLE_RADIUS, minX = Math.floor((x - reach) / COLLISION_CELL), maxX = Math.floor((x + reach) / COLLISION_CELL);
  const minZ = Math.floor((z - reach) / COLLISION_CELL), maxZ = Math.floor((z + reach) / COLLISION_CELL);
  for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
    const cell = worldObstacleGrid.get(`${gx},${gz}`);
    if (cell) nearby.push(...cell);
    else if (!worldPreloaded) {
      const cx = Math.round(gx * COLLISION_CELL / CHUNK_SIZE), cz = Math.round(gz * COLLISION_CELL / CHUNK_SIZE);
      const obstacles = chunkObstacles(cx, cz);
      if (obstacles.length) nearby.push(...obstacles.filter(o => Math.floor(o.x / COLLISION_CELL) === gx && Math.floor(o.z / COLLISION_CELL) === gz));
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const o of nearby) {
      if (y > o.top - .15 || y + height < o.bottom) continue;
      const dx = res.x - o.x, dz = res.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
      if (d >= min) continue;
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      res.x = o.x + nx * min; res.z = o.z + nz * min; res.hit = true; res.kind = o.kind; changed = true;
    }
    if (!changed) break;
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
  const step = 40, half = 40, p: number[] = [], c: number[] = [], indices: number[] = [], tmp = new THREE.Color();
  const originX = cx * CHUNK_SIZE, originZ = cz * CHUNK_SIZE;
  for (let z = -half; z <= half; z++) for (let x = -half; x <= half; x++) {
    const wx = originX + x * step, wz = originZ + z * step, y = heightAt(wx, wz);
    p.push(wx, y - .35, wz); colorAt(wx, wz, y, colors, tmp).toArray(c, c.length);
    if (x < half && z < half) {
      const mx = x * step + step / 2, mz = z * step + step / 2;
      if (Math.abs(mx) < 720 && Math.abs(mz) < 1200) continue;
      const i = (z + half) * (half * 2 + 1) + x + half;
      indices.push(i, i + half * 2 + 1, i + 1, i + 1, i + half * 2 + 1, i + half * 2 + 2);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function makeChunk(cx: number, cz: number, colors: ChunkColors) {
  if (worldPreloaded) { worldGenerationStats.runtimeGenerationCalls++; throw new Error('Terrain generation attempted after world preload'); }
  if (!insideChunkRange(cx, cz)) throw new RangeError(`Chunk ${cx},${cz} is outside the preloaded world`);
  worldGenerationStats.chunksBuilt++;
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
      add(new THREE.CylinderGeometry(.06, .18, .8, 8), colors.bark, it, it.sy * .4);
      const leaf = colors.forest.clone().lerp(colors.grassLight, it.tint);
      if (it.kind === 'pine') {
        for (let tier = 0; tier < 4; tier++) {
          const crown = new THREE.ConeGeometry(1 - tier * .19, .36, 10, 2);
          const p = crown.getAttribute('position');
          for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const variation = 1 + .09 * Math.sin(a * 5 + tier); p.setX(i, p.getX(i) * variation); p.setZ(i, p.getZ(i) * variation); }
          add(crown, leaf.clone().lerp(colors.grassLight, tier * .035), it, it.sy * (.35 + tier * .18));
        }
      } else {
        for (let lobe = 0; lobe < 3; lobe++) add(new THREE.IcosahedronGeometry(1, 1).scale(.8, .3, .8).translate(Math.cos(lobe * 2.1) * .4, 0, Math.sin(lobe * 2.1) * .4), leaf.clone().lerp(colors.grassLight, lobe * .04), it, it.sy * (.68 + lobe * .07));
      }
    } else if (it.kind === 'rock') add(new THREE.IcosahedronGeometry(1, 1), colors.mountain.clone().lerp(colors.earth, it.tint), it, it.sy * .75);
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

/** Low-detail forest silhouettes beyond the detailed safety area, merged into one draw. */
export function makeFarForest(cx: number, cz: number, colors: ChunkColors) {
  const parts: THREE.BufferGeometry[] = [], random = seededRandom(hash(cx, cz) + 73), originX = cx * CHUNK_SIZE, originZ = cz * CHUNK_SIZE;
  for (let i = 0; i < 4400; i++) {
    const x = originX + (random() - .5) * 3200, z = originZ + (random() - .5) * 3200;
    if ((Math.abs(x - originX) < 740 && Math.abs(z - originZ) < 1220) || random() > forestAt(x, z) * .65) continue;
    const y = heightAt(x, z), d = drainageAt(x, z);
    if (y < d.level + 2 || y > 165 || roadDist(x, z) < 7 || runwayWeight(x, z) > .02) continue;
    const g = new THREE.ConeGeometry(2 + random() * 2, 8 + random() * 5, 5).toNonIndexed();
    g.deleteAttribute('uv'); g.translate(x, y + 4, z);
    const color = colors.forest.clone().lerp(colors.grass, random() * .2), c = new Float32Array(g.getAttribute('position').count * 3);
    for (let j = 0; j < c.length; j += 3) color.toArray(c, j);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
  }
  const geometry = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  parts.forEach(g => g.dispose()); return geometry;
}
