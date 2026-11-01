import * as THREE from 'three';
import { LAKE, drainageAt, riverHalfWidth, riverLevel, riverX, tributaryLevel, tributaryZ } from './geography';
import { groundAt } from './landscape-geometry';

type Vertex = { x: number; z: number; y: number; depth: number };
/** Clip each water triangle to its actual terrain shoreline, never a rectangular lake overlay. */
export function makeInlandWater(shallow: THREE.Color, blue: THREE.Color, deep: THREE.Color) {
  const positions: number[] = [], colors: number[] = [], color = new THREE.Color();
  const vertex = (x: number, z: number, y: number): Vertex => ({ x, z, y, depth: y - groundAt(x, z) });
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const input = [a, b, c], polygon: Vertex[] = [];
    for (let i = 0; i < 3; i++) {
      const p = input[i], q = input[(i + 1) % 3]; if (!p || !q) continue;
      if (p.depth >= .02) polygon.push(p);
      if ((p.depth >= .02) !== (q.depth >= .02)) {
        const t = (.02 - p.depth) / (q.depth - p.depth);
        polygon.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, depth: .02 });
      }
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      const first = polygon[0], second = polygon[i], third = polygon[i + 1];
      if (!first || !second || !third) continue;
      for (const p of [first, second, third]) {
        positions.push(p.x, p.y, p.z);
        color.copy(shallow).lerp(blue, THREE.MathUtils.smoothstep(p.depth, .1, 5)).lerp(deep, THREE.MathUtils.smoothstep(p.depth, 7, 24) * .65).toArray(colors, colors.length);
      }
    }
  };
  const quad = (a: Vertex, b: Vertex, c: Vertex, d: Vertex) => { triangle(a, c, b); triangle(b, c, d); };
  for (let z = LAKE.z - 116; z < LAKE.z + 116; z += 4) for (let x = LAKE.x - 155; x < LAKE.x + 155; x += 4) {
    const v = (px: number, pz: number) => { const p = vertex(px, pz, -3); if (drainageAt(px, pz).kind !== 'lake') p.depth = -.1; return p; };
    quad(v(x, z), v(x + 4, z), v(x, z + 4), v(x + 4, z + 4));
  }
  for (let z = -1048; z < -220; z += 4) for (let s = -1; s < 1; s += .25) {
    const v = (pz: number, offset: number) => vertex(riverX(pz) + offset * riverHalfWidth(pz) / .87, pz, riverLevel(pz));
    quad(v(z, s), v(z, s + .25), v(z + 4, s), v(z + 4, s + .25));
  }
  for (let x = riverX(-430); x < 364; x += 4) {
    const v = (px: number, s: number) => vertex(px, tributaryZ(px) + s * 3.8 / .93, tributaryLevel(px));
    quad(v(x, -1), v(x + 4, -1), v(x, 1), v(x + 4, 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}