import * as THREE from 'three';
import { LAKE, PEAK, RUNWAY, heightAt, seededRandom } from './landscape-geometry';

/** Pure, deterministic world layout: sea, roads, fuel bottles, treasure, vehicle spawns. */
export const SEA_LEVEL = -3;
export const COAST_START = 400;
export const COAST_END = 520;

export const roadAX = (z: number) => 22 * Math.sin(z / 65) + 10 * Math.sin(z / 23 + 1) - 10 * Math.sin(1);
export const roadBZ = (x: number) => 70 + 18 * Math.sin(x / 55);
export const ROAD_A = { from: 10, to: 485 };
export const ROAD_B = { from: -420, to: 420 };
export const ROAD_HALF = 3;

/** Approximate distance to the nearest road centreline. */
export function roadDist(x: number, z: number) {
  let d = Infinity;
  if (z >= ROAD_A.from && z <= ROAD_A.to) d = Math.abs(x - roadAX(z)) * .85;
  if (x >= ROAD_B.from && x <= ROAD_B.to) d = Math.min(d, Math.abs(z - roadBZ(x)) * .9);
  return d;
}

export type RoadPath = [number, number][];
export function roadPaths(): RoadPath[] {
  const a: RoadPath = [], b: RoadPath = [];
  for (let z = ROAD_A.from; z <= ROAD_A.to; z += 2) a.push([roadAX(z), z]);
  for (let x = ROAD_B.from; x <= ROAD_B.to; x += 2) b.push([x, roadBZ(x)]);
  return [a, b];
}

/** Terrain-hugging ribbon geometry for all roads (3 verts across to avoid terrain poke). */
export function makeRoadGeometry() {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const path of roadPaths()) {
    const base = pos.length / 3;
    path.forEach(([x, z], i) => {
      const [px, pz] = path[Math.max(0, i - 1)]!, [nx, nz] = path[Math.min(path.length - 1, i + 1)]!;
      const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
      for (const s of [-1, 0, 1]) {
        const vx = x + rx * ROAD_HALF * s, vz = z + rz * ROAD_HALF * s;
        pos.push(vx, Math.max(heightAt(vx, vz), heightAt(x, z) - .4) + .14, vz); uv.push((s + 1) / 2, i * .5);
      }
      if (i < path.length - 1) { const v = base + i * 3; idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4, v + 1, v + 4, v + 2, v + 2, v + 4, v + 5); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function makeRoadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6b6b6b'; ctx.fillRect(0, 0, 64, 64);
  const r = seededRandom(5);
  for (let i = 0; i < 400; i++) { const v = 90 + r() * 70; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(r() * 64, r() * 64, 1, 1); }
  ctx.fillStyle = '#e8e2c8'; ctx.fillRect(30, 0, 4, 32); ctx.fillRect(0, 0, 3, 64); ctx.fillRect(61, 0, 3, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const FUEL_BOTTLES: THREE.Vector3[] = (() => {
  const r = seededRandom(909), out: THREE.Vector3[] = [];
  for (let z = 45; z < 480; z += 55) out.push(new THREE.Vector3(roadAX(z) + 1.5, 0, z));
  for (let x = -380; x <= 380; x += 95) out.push(new THREE.Vector3(x, 0, roadBZ(x) - 1.5));
  for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = 40 + r() * 220; out.push(new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d * .8 - 30)); }
  out.forEach(p => { p.y = Math.max(heightAt(p.x, p.z), SEA_LEVEL - 20) + .9; });
  return out;
})();

export const HOME_RADIUS = 7;
export { RUNWAY } from './landscape-geometry';

/** Sequential treasure hunt: only one treasure exists at a time; the next spawns after a deposit. */
const FIXED_TREASURES: { x: number; z: number; hint: string }[] = [
  { x: 52, z: -58, hint: 'Hidden among the dark pines of the forest valley, north-east of the tree' },
  { x: 38, z: 600, hint: 'Sunk on the seabed off the southern coast — dive for it' },
  { x: LAKE.x + 6, z: LAKE.z - 4, hint: 'Resting on the bottom of the north-west lake' },
  { x: PEAK.x - 30, z: PEAK.z + 40, hint: 'High on the snowy slopes of the great northern peak' },
  { x: -430, z: 70, hint: 'Far to the west, beyond the airfield, at the foot of the western range' },
];
export function treasureAt(i: number) {
  const f = FIXED_TREASURES[i];
  if (f) return { pos: new THREE.Vector3(f.x, 0, f.z), hint: f.hint };
  const r = seededRandom(7000 + i * 31); r();
  const a = r() * Math.PI * 2, d = 380 + r() * 520;
  return { pos: new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d), hint: `Somewhere out in the wilds, roughly ${Math.round(d / 100) * 100} m from the golden tree` };
}

export type VehicleType = 'car' | 'plane';
export type Vehicle = { type: VehicleType; pos: THREE.Vector3; yaw: number; speed: number; vy: number; pitch: number; roll: number; throttle: number; fuel: number; tint: number; health: number; spawn: [number, number, number] };
export const baseCap = (t: VehicleType) => t === 'car' ? 60 : 90;
export const PLANE_GEAR = .74; // fuselage centre above wheel contact
export const CAR_GEAR = 0;

export function placeVehicle(v: Vehicle) {
  const [x, z, yaw] = v.spawn;
  v.pos.set(x, heightAt(x, z) + (v.type === 'plane' ? PLANE_GEAR : CAR_GEAR), z); v.yaw = yaw;
  v.speed = 0; v.vy = 0; v.pitch = 0; v.roll = 0; v.throttle = 0; v.health = 100;
}

export function createVehicles(): Vehicle[] {
  const mk = (type: VehicleType, x: number, z: number, yaw: number, tint: number): Vehicle => {
    const v: Vehicle = { type, pos: new THREE.Vector3(), yaw, speed: 0, vy: 0, pitch: 0, roll: 0, throttle: 0, fuel: baseCap(type), tint, health: 100, spawn: [x, z, yaw] };
    placeVehicle(v); return v;
  };
  // planes wait at the east end of the runway, nose pointing down the strip (west)
  return [mk('car', roadAX(24) + 1.6, 24, 0, 0), mk('car', roadAX(36) - 1.6, 36, 0, 1), mk('car', 110, roadBZ(110), Math.PI / 2, 2),
    mk('plane', RUNWAY.x + RUNWAY.halfLength - 8, RUNWAY.z - 3, -Math.PI / 2, 0), mk('plane', RUNWAY.x + RUNWAY.halfLength - 14, RUNWAY.z + 14, -Math.PI / 2, 1)];
}
export const TREASURE = treasureAt(0).pos;
TREASURE.y = heightAt(TREASURE.x, TREASURE.z);
