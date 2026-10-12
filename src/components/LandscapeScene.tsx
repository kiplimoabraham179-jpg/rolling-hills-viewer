import { useEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt, makeGrassTexture, makeMountains, makeTerrain, makeTree, seededRandom } from '@/lib/landscape-geometry';

export type LandscapePalette = Record<'sky' | 'mist' | 'grass' | 'grassLight' | 'forest' | 'mountain' | 'leaf' | 'leafLight' | 'bark' | 'sun', THREE.Color>;

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

function Forest({ palette }: { palette: LandscapePalette }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = seededRandom(6), dummy = new THREE.Object3D();
    for (let i = 0; i < 3600; i++) {
      const angle = random() * Math.PI * 2, radius = 35 + random() * 95;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const h = 1.8 + random() * 3.4;
      dummy.position.set(x, heightAt(x, z) + h * .5, z);
      dummy.scale.set(.8 + random() * .9, h, .8 + random() * .9);
      dummy.rotation.set(0, random() * Math.PI, 0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, palette.forest.clone().lerp(palette.grass, random() * .22));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [palette]);
  return <instancedMesh ref={meshRef} args={[undefined, undefined, 3600]}>
    <coneGeometry args={[1, 1, 5]} /><meshStandardMaterial roughness={1} />
  </instancedMesh>;
}

function Atmosphere({ palette }: { palette: LandscapePalette }) {
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
    <mesh geometry={sky}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>
    <fog attach="fog" args={[palette.mist, 65, 330]} />
    <hemisphereLight args={[palette.mist, palette.forest, .9]} />
    <directionalLight color={palette.sun} position={[-45, 32, 35]} intensity={2.7} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-25} shadow-camera-right={25}
      shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-near={1} shadow-camera-far={130}
      shadow-bias={-.0003} shadow-normalBias={.035} />
    <Environment resolution={64}>
      <Lightformer intensity={.7} color={palette.mist} position={[0, 20, 0]} rotation-x={Math.PI / 2} scale={100} />
      <Lightformer intensity={1} color={palette.sun} position={[-20, 15, 20]} scale={30} />
    </Environment>
  </>;
}

export function LandscapeScene({ palette, onReady }: { palette: LandscapePalette; onReady: () => void }) {
  const terrain = useMemo(() => makeTerrain(palette.grass, palette.grassLight, palette.forest), [palette]);
  const texture = useMemo(makeGrassTexture, []);
  const mountains = useMemo(() => [makeMountains(155, 49, 11), makeMountains(225, 67, 88), makeMountains(295, 88, 65)], []);
  const ready = useRef(false);
  useFrame(() => { if (!ready.current) { ready.current = true; onReady(); } });
  useEffect(() => () => { terrain.dispose(); texture.dispose(); mountains.forEach(g => g.dispose()); }, [terrain, texture, mountains]);
  return <>
    <Atmosphere palette={palette} />
    <mesh geometry={terrain} receiveShadow><meshStandardMaterial vertexColors map={texture} roughness={1} bumpMap={texture} bumpScale={.12} /></mesh>
    {mountains.map((geometry, i) => <mesh key={i} geometry={geometry}>
      <meshStandardMaterial color={palette.mountain.clone().lerp(palette.mist, i * .18)} roughness={1} side={THREE.DoubleSide} />
    </mesh>)}
    <Forest palette={palette} />
    <Tree palette={palette} />
  </>;
}