import { useEffect, useMemo, useRef, useState } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Player, FollowCamera, type GameState, type CharacterKind } from './Explorer';
import { heightAt, makeGrassTexture, makeMountains, makeTree } from '@/lib/landscape-geometry';
import { Vehicles } from './Vehicles';
import { WorldFeatures } from './WorldFeatures';
import { CHUNK_RADIUS, CHUNK_SIZE, makeChunk } from '@/lib/world-chunks';

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
  useFrame(() => {
    const cx = Math.round(game.pos.x / CHUNK_SIZE), cz = Math.round(game.pos.z / CHUNK_SIZE);
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
      if (Math.max(Math.abs(x! - cx), Math.abs(z! - cz)) > CHUNK_RADIUS + 1) { c.terrain.dispose(); c.deco?.dispose(); map.delete(key); removed = true; }
    }
    const sig = `${cx},${cz},${map.size}`;
    if (built || removed || sig !== center.current) { center.current = sig; setChunks([...map.values()]); }
  });
  useEffect(() => () => { cache.current.forEach(c => { c.terrain.dispose(); c.deco?.dispose(); }); cache.current.clear(); }, [palette]);
  return <>{chunks.map(c => <group key={c.key}>
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
  const mountains = useMemo(() => [makeMountains(430, 70, 11), makeMountains(520, 95, 88), makeMountains(610, 120, 65)], []);
  useEffect(() => () => mountains.forEach(m => m.dispose()), [mountains]);
  const sky = useMemo(() => {
    const geo = new THREE.SphereGeometry(650, 32, 16);
    const p = geo.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const blend = THREE.MathUtils.smoothstep(p.getY(i) / 650, -.08, .32);
      palette.mist.clone().lerp(palette.sky, blend).toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [palette]);
  useEffect(() => () => sky.dispose(), [sky]);
  return <>
    <FollowWorld game={game} sun={sun}>
      <mesh geometry={sky}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>
      {mountains.map((geometry, i) => <mesh key={i} geometry={geometry}>
        <meshBasicMaterial color={palette.mountain.clone().lerp(palette.mist, .35 + i * .15)} fog={false} side={THREE.DoubleSide} />
      </mesh>)}
    </FollowWorld>
    <fog attach="fog" args={[palette.mist, 110, 300]} />
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