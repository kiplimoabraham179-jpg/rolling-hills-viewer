/** Shared seeded geography. No renderer or game-state dependencies. */
export const WATER_LEVEL = -3;
export const LAKE = { x: -150, z: -180, r: 120, rx: 138, rz: 100 } as const;
export const PEAK = { x: 60, z: -680 } as const;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function noiseAt(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const hash = (a: number, b: number) => { const n = Math.sin(a * 127.1 + b * 311.7 + 42) * 43758.5453; return n - Math.floor(n); };
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const riverX = (z: number) => -155 + 36 * Math.sin((z + 220) / 100) + 22 * Math.sin((z + 220) / 47) + Math.max(0, -z - 300) * .19;
export const riverHalfWidth = (z: number) => 8 + 4 * noiseAt(z / 95, 8);
export const riverLevel = (z: number) => WATER_LEVEL + Math.max(0, -z - 260) * .055;
export const tributaryZ = (x: number) => -430 - (x + 155) * .27 + 14 * Math.sin((x + 155) / 58);
export const tributaryLevel = (x: number) => riverLevel(-430) + Math.max(0, x - riverX(-430)) * .035;

/** Includes floodplain, lake bed and coastal drainage, not just the visible water. */
export function drainageAt(x: number, z: number): { level: number; distance: number; width: number; kind: 'lake' | 'river' | 'stream' | 'sea' } {
  const angle = Math.atan2((z - LAKE.z) / LAKE.rz, (x - LAKE.x) / LAKE.rx);
  const shore = 1 + .035 * Math.sin(angle * 5) + .025 * Math.sin(angle * 9);
  const lakeD = (Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) - shore) * 105;
  let result: ReturnType<typeof drainageAt> = { level: WATER_LEVEL, distance: lakeD, width: 0, kind: 'lake' };
  if (z < -220 && z > -1050) {
    const d = Math.abs(x - riverX(z)) * .87 - riverHalfWidth(z);
    if (d < result.distance) result = { level: riverLevel(z), distance: d, width: riverHalfWidth(z), kind: 'river' };
  }
  const join = riverX(-430);
  if (x > join && x < 365) {
    const d = Math.abs(z - tributaryZ(x)) * .93 - 3.8;
    if (d < result.distance) result = { level: tributaryLevel(x), distance: d, width: 3.8, kind: 'stream' };
  }
  const coastD = (440 - z - 14 * Math.sin(x / 70)) * .6;
  if (coastD < result.distance) result = { level: WATER_LEVEL, distance: coastD, width: 0, kind: 'sea' };
  return result;
}

/** Local water level for swimming, detection and vehicle water contact. */
export function waterLevelAt(x: number, z: number) {
  const d = drainageAt(x, z);
  return d.distance < 0 ? d.level : WATER_LEVEL;
}

/** Connected basin ranges with broad foothills and narrower, rugged summits. */
export function basinHeight(x: number, z: number) {
  const warpX = x + (noiseAt(x / 230, z / 230) - .5) * 65;
  const warpZ = z + (noiseAt(x / 190 + 9, z / 190) - .5) * 55;
  const rolling = 5 + 11 * noiseAt(warpX / 125, warpZ / 125) + 3 * (noiseAt(x / 38, z / 38) - .5);
  const ridge = 1 - Math.abs(noiseAt(warpX / 73, warpZ / 100) * 2 - 1);
  const crag = .67 + .33 * ridge * ridge;
  const north = 275 * Math.exp(-((warpZ + 700) / 160) ** 2) * (.65 + .35 * noiseAt(warpX / 180, 13));
  const west = 220 * Math.exp(-((warpX + 540) / 160) ** 2) * Math.exp(-((warpZ + 210) / 690) ** 2);
  const east = 205 * Math.exp(-((warpX - 520) / 155) ** 2) * Math.exp(-((warpZ + 300) / 690) ** 2);
  const peak = 115 * Math.exp(-(((x - PEAK.x) / 90) ** 2 + ((z - PEAK.z) / 110) ** 2));
  const far = smooth(650, 1400, Math.hypot(x, z)) * 160 * (1 - Math.abs(noiseAt(x / 310, z / 310) * 2 - 1)) ** 2;
  // Channels etched into mountain flanks create connected ravines, not random spikes.
  const gullies = (1 - smooth(.025, .14, Math.abs(noiseAt(x / 95 + 5, z / 150) - .5))) * 16;
  let land = rolling + (north + west + east + far) * crag + peak - gullies * smooth(30, 110, north + west + east);
  // A broad low saddle gives a climbable way through the western range.
  const pass = Math.exp(-((z - (80 + 30 * Math.sin(x / 90))) / 64) ** 2);
  land -= west * crag * pass * .77;
  const d = drainageAt(x, z);
  if (d.distance < 55) {
    const depth = d.kind === 'lake' ? Math.min(22, 3 + Math.max(0, -d.distance) * .25) : d.kind === 'sea' ? 13 : 3.2;
    const bankHeight = d.level + 3 + Math.max(0, d.distance) * .22;
    const bed = d.distance < 0 ? d.level - depth : bankHeight;
    land += (bed - land) * (1 - smooth(0, 55, Math.max(0, d.distance)));
  }
  return land;
}