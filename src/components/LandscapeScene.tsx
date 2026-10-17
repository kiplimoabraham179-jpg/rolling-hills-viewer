import { useEffect, useMemo, useRef, useState } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Player, FollowCamera, type GameState, type CharacterKind } from './Explorer';
import { PEAK, heightAt, makeGrassTexture, makeTree, seededRandom } from '@/lib/landscape-geometry';
import { WIND } from '@/lib/game-world';
import { Vehicles } from './Vehicles';
import { WorldFeatures } from './WorldFeatures';
import { CHUNK_RADIUS, CHUNK_SIZE, makeChunk, makeFarTerrain } from '@/lib/world-chunks';

export type LandscapePalette = Record<'sky' | 'mist' | 'grass' | 'grassLight' | 'forest' | 'mountain' | 'leaf' | 'leafLight' | 'bark' | 'sun' | 'toySkin' | 'toyShirt' | 'toyPants' | 'toyHat' | 'bird' | 'birdWing' | 'sand' | 'water' | 'waterDeep' | 'foam' | 'road' | 'car' | 'plane' | 'fuel' | 'gold', THREE.Color>;

function Tree({ palette }: { palette: LandscapePalette }) {
  const tree = useMemo(makeTree, []);
  const leaves = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = leaves.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    tree.leaves.forEach((leaf, i) => {
      dummy.position.copy(leaf.position); dummy.scale.copy(leaf.scale); dummy.rotation.copy(leaf.rotation); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, palette.leaf.clone().lerp(palette.leafLight, leaf.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tree, palette]);
  useEffect(() => () => tree.geometry?.dispose(), [tree]);
  return <group position={[0, heightAt(0, 0), 0]} scale={1.18}>
    {tree.geometry && <mesh geometry={tree.geometry} castShadow receiveShadow><meshStandardMaterial color={palette.bark} roughness={.98} /></mesh>}
    <instancedMesh ref={leaves} args={[undefined, undefined, tree.leaves.length]} castShadow receiveShadow>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={.85} />
    </instancedMesh>
  </group>;
}

type Chunk = { key: string; terrain: THREE.BufferGeometry; deco: THREE.BufferGeometry | null };

/** Streams deterministic terrain chunks around the player and recycles far ones. */
function ChunkWorld({ palette, game, texture }: { palette: LandscapePalette; game: GameState; texture: THREE.Texture }) {
  const cache = useRef(new Map<string, Chunk>());
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const center = useRef('');
  const [farCenter, setFarCenter] = useState<[number, number]>([0, 0]);
  const far = useMemo(() => makeFarTerrain(farCenter[0], farCenter[1], palette), [farCenter, palette]);
  useEffect(() => () => far.dispose(), [far]);
  useFrame(() => {
    const cx = Math.round(game.pos.x / CHUNK_SIZE), cz = Math.round(game.pos.z / CHUNK_SIZE);
    if (farCenter[0] !== cx || farCenter[1] !== cz) setFarCenter([cx, cz]);
    const wanted: [number, number][] = [];
    for (let x = -CHUNK_RADIUS; x <= CHUNK_RADIUS; x++) for (let z = -CHUNK_RADIUS; z <= CHUNK_RADIUS; z++) wanted.push([cx + x, cz + z]);
    wanted.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    const map = cache.current;
    // build at most 2 missing chunks per frame (nearest first) to avoid hitches
    let built = 0;
    for (const [x, z] of wanted) {
      const key = `${x},${z}`;
      if (map.has(key) || built >= 2) continue;
      map.set(key, { key, ...makeChunk(x, z, palette) }); built++;
    }
    const keys = new Set(wanted.map(([x, z]) => `${x},${z}`));
    let removed = false;
    for (const [key, c] of map) if (!keys.has(key)) {
      const [x, z] = key.split(',').map(Number);
      if (x !== undefined && z !== undefined && Math.max(Math.abs(x - cx), Math.abs(z - cz)) > CHUNK_RADIUS + 1) { c.terrain.dispose(); c.deco?.dispose(); map.delete(key); removed = true; }
    }
    const sig = `${cx},${cz},${map.size}`;
    if (built || removed || sig !== center.current) { center.current = sig; setChunks([...map.values()]); }
  });
  useEffect(() => () => { cache.current.forEach(c => { c.terrain.dispose(); c.deco?.dispose(); }); cache.current.clear(); }, [palette]);
  return <><mesh geometry={far} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>{chunks.map(c => <group key={c.key}>
    <mesh geometry={c.terrain} receiveShadow><meshStandardMaterial vertexColors map={texture} roughness={1} bumpMap={texture} bumpScale={.12} /></mesh>
    {c.deco && <mesh geometry={c.deco} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.95} flatShading /></mesh>}
  </group>)}</>;
}

/** Keeps sky, sun shadows and horizon ranges centred on the player. */
function FollowWorld({ game, children, sun }: { game: GameState; children: React.ReactNode; sun: React.RefObject<THREE.DirectionalLight | null> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    g.current?.position.set(game.pos.x, 0, game.pos.z);
    const l = sun.current;
    if (l) { l.position.set(game.pos.x - 45, game.pos.y + 32, game.pos.z + 35); l.target.position.set(game.pos.x, game.pos.y, game.pos.z); l.target.updateMatrixWorld(); }
  });
  return <group ref={g}>{children}</group>;
}

function Atmosphere({ palette, game }: { palette: LandscapePalette; game: GameState }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useMemo(() => {
    const geo = new THREE.SphereGeometry(650, 32, 16);
    const p = geo.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const blend = THREE.MathUtils.smoothstep(p.getY(i) / 650, -.08, .32);
      palette.sky.clone().lerp(palette.mist, (1 - blend) * .22).toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [palette]);
  useEffect(() => () => sky.dispose(), [sky]);
  return <>
    <FollowWorld game={game} sun={sun}>
      <mesh geometry={sky}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>
      <mesh position={[-300, 320, -220]}><sphereGeometry args={[12, 16, 12]} /><meshBasicMaterial color={palette.sun} /></mesh>
    </FollowWorld>
    <Snow palette={palette} />
    <hemisphereLight args={[palette.mist, palette.forest, .9]} />
    <directionalLight ref={sun} color={palette.sun} position={[-45, 32, 35]} intensity={2.7} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-25} shadow-camera-right={25}
      shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-near={1} shadow-camera-far={130}
      shadow-bias={-.0003} shadow-normalBias={.035} />
    <Environment resolution={64}>
      <Lightformer intensity={.7} color={palette.mist} position={[0, 20, 0]} rotation-x={Math.PI / 2} scale={100} />
      <Lightformer intensity={1} color={palette.sun} position={[-20, 15, 20]} scale={30} />
    </Environment>
  </>;
}

/** Localized falling snow around the great northern peak only — the rest of the sky stays clear. */
function Snow({ palette }: { palette: LandscapePalette }) {
  const COUNT = 500;
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(COUNT * 3), r = seededRandom(726);
    for (let i = 0; i < COUNT; i++) pos.set([PEAK.x + (r() - .5) * 180, 150 + r() * 60, PEAK.z + (r() - .5) * 180], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, .05), p = geo.getAttribute('position');
    for (let i = 0; i < COUNT; i++) {
      let y = p.getY(i) - (6 + (i % 5)) * dt;
      const x = p.getX(i) + Math.sin(WIND.angle) * WIND.speed * .5 * dt, z = p.getZ(i) + Math.cos(WIND.angle) * WIND.speed * .5 * dt;
      if (y < Math.max(100, heightAt(x, z))) y = 200;
      p.setXYZ(i, x > PEAK.x + 130 ? x - 260 : x < PEAK.x - 130 ? x + 260 : x, y, z > PEAK.z + 130 ? z - 260 : z < PEAK.z - 130 ? z + 260 : z);
    }
    p.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} frustumCulled={false}>
    <pointsMaterial color={palette.foam} size={.9} sizeAttenuation transparent opacity={.85} />
  </points>;
}

export function LandscapeScene({ palette, onReady, game, kind, follow }: { palette: LandscapePalette; onReady: () => void; game: GameState; kind: CharacterKind; follow: boolean }) {
  const texture = useMemo(() => { const t = makeGrassTexture(); t.repeat.set(32, 32); return t; }, []);
  const ready = useRef(false);
  useFrame(() => { if (!ready.current) { ready.current = true; onReady(); } });
  useEffect(() => () => texture.dispose(), [texture]);
  return <>
    <Atmosphere palette={palette} game={game} />
    <ChunkWorld palette={palette} game={game} texture={texture} />
    <Tree palette={palette} />
    <WorldFeatures game={game} palette={palette} />
    <Vehicles game={game} palette={palette} />
    <Player game={game} kind={kind} palette={palette} />
    {follow && <FollowCamera game={game} />}
  </>;
}