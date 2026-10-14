import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, seededRandom } from './landscape-geometry';
import { SEA_LEVEL, roadDist } from './game-world';

/** Pure, deterministic chunk generation for the streamed open world. */
export const CHUNK_SIZE = 80;
export const CHUNK_SEGMENTS = 32;
const ROAD_CLEAR = 5;
export const CHUNK_RADIUS = 2; // chunks loaded in each direction around the player

export type ChunkColors = Record<'grass' | 'grassLight' | 'forest' | 'mountain' | 'mist' | 'bark' | 'leafLight' | 'sun' | 'sand', THREE.Color>;

const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** 0..1 forest density, shared by terrain tint and tree placement. */
export function forestAt(x: number, z: number) {
  const n = .5 + .3 * Math.sin(x * .021 + 1.3) * Math.cos(z * .017 - .7) + .2 * Math.sin((x + z) * .043);
  const near = THREE.MathUtils.smoothstep(Math.hypot(x, z), 26, 60);
  return THREE.MathUtils.clamp(n * near, 0, 1);
}

function colorAt(x: number, z: number, y: number, c: ChunkColors, out: THREE.Color) {
  out.copy(c.grass).lerp(c.grassLight, .22 + .18 * Math.sin(x * .13 + z * .05));
  out.lerp(c.forest, forestAt(x, z) * .75);
  out.lerp(c.mountain, THREE.MathUtils.smoothstep(y, 26, 48) * .85);
  out.lerp(c.sand, 1 - THREE.MathUtils.smoothstep(y, SEA_LEVEL + .8, SEA_LEVEL + 3));
  return out;
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
  const random = seededRandom(hash(cx, cz)), parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: THREE.Color, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number) => {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute('uv');
    geo.scale(sx, sy, sz); geo.rotateY(ry); geo.translate(x, y, z);
    const c = new Float32Array(geo.getAttribute('position').count * 3);
    for (let i = 0; i < c.length; i += 3) color.toArray(c, i);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(geo);
  };
  for (let i = 0; i < 260; i++) {
    const x = ox + (random() - .5) * CHUNK_SIZE, z = oz + (random() - .5) * CHUNK_SIZE;
    const r = random(), y = heightAt(x, z), f = forestAt(x, z), d = Math.hypot(x, z);
    if (d < 14 || y < SEA_LEVEL + 1 || roadDist(x, z) < ROAD_CLEAR) continue; // keep the golden tree's hill clear
    if (y < 40 && r < f * .75) {
      const h = 2 + random() * 3.6, w = .8 + random() * .8;
      add(new THREE.ConeGeometry(1, 1, 5), colors.forest.clone().lerp(colors.grass, random() * .25), x, y + h * .5, z, w, h, w, random() * 6);
    } else if (r > .93) {
      const s = .3 + random() * (y > 26 ? 1.6 : .7);
      add(new THREE.DodecahedronGeometry(1, 0), colors.mountain.clone().lerp(colors.mist, random() * .3), x, y + s * .3, z, s * 1.3, s * .8, s, random() * 6);
    } else if (r > .86 && f < .4 && y < 26) {
      const flower = random() > .5 ? colors.sun : colors.leafLight;
      add(new THREE.IcosahedronGeometry(.18, 0), flower, x, y + .2, z, 1, 1, 1, 0);
    }
  }
  const deco = parts.length ? mergeGeometries(parts) : null;
  parts.forEach(g => g.dispose());
  deco?.computeVertexNormals();
  return { terrain, deco };
}
