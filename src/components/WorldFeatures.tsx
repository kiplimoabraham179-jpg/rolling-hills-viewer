import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '@/lib/landscape-geometry';
import { FUEL_BOTTLES, HOME_RADIUS, SEA_LEVEL, TREASURE, makeRoadGeometry, makeRoadTexture } from '@/lib/game-world';
import type { GameState } from './Explorer';
import type { LandscapePalette } from './LandscapeScene';
import { say, vehicleCap } from './Vehicles';

function Roads() {
  const geo = useMemo(makeRoadGeometry, []), tex = useMemo(makeRoadTexture, []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial map={tex} roughness={.95} polygonOffset polygonOffsetFactor={-2} /></mesh>;
}

function Sea({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { const m = ref.current; if (m) { m.position.x = game.pos.x; m.position.y = SEA_LEVEL + Math.sin(clock.elapsedTime * .8) * .06; } });
  return <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, SEA_LEVEL, 1180]}>
    <planeGeometry args={[2400, 1600]} />
    <meshStandardMaterial color={palette.water} transparent opacity={.72} roughness={.15} metalness={.2} side={THREE.DoubleSide} depthWrite={false} />
  </mesh>;
}

function FuelBottles({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const bottles = useRef<THREE.InstancedMesh>(null), caps = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const g = game, t = clock.elapsedTime;
    FUEL_BOTTLES.forEach((b, i) => {
      if (!g.collected[i] && Math.hypot(b.x - g.pos.x, b.z - g.pos.z) < 2.8 && Math.abs(b.y - g.pos.y) < 5) {
        g.collected[i] = true; g.tankBonus += 15;
        g.vehicles.forEach(v => { v.fuel = vehicleCap(g, v); });
        say(g, `Fuel bottle! Tanks +15 (cars ${60 + g.tankBonus} · planes ${90 + g.tankBonus}) and refilled`);
      }
      const on = !g.collected[i];
      dummy.position.set(b.x, b.y + Math.sin(t * 2 + i) * .2, b.z); dummy.rotation.set(0, t * 1.5 + i, 0); dummy.scale.setScalar(on ? 1 : 0); dummy.updateMatrix();
      bottles.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.y += .62; dummy.updateMatrix(); caps.current?.setMatrixAt(i, dummy.matrix);
    });
    if (bottles.current) bottles.current.instanceMatrix.needsUpdate = true;
    if (caps.current) caps.current.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={bottles} args={[undefined, undefined, FUEL_BOTTLES.length]} castShadow frustumCulled={false}>
      <capsuleGeometry args={[.32, .55, 4, 12]} /><meshStandardMaterial color={palette.fuel} emissive={palette.fuel} emissiveIntensity={.35} roughness={.3} />
    </instancedMesh>
    <instancedMesh ref={caps} args={[undefined, undefined, FUEL_BOTTLES.length]} frustumCulled={false}>
      <cylinderGeometry args={[.14, .14, .22, 10]} /><meshStandardMaterial color={palette.sun} roughness={.4} />
    </instancedMesh>
  </>;
}

function Treasure({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const chest = useRef<THREE.Group>(null), beacon = useRef<THREE.Mesh>(null);
  const home = useMemo(() => new THREE.Vector3(3.5, heightAt(3.5, 3.5), 3.5), []);
  useFrame(({ clock }) => {
    const g = game, c = chest.current; if (!c) return;
    if (g.quest === 'find' && g.pos.distanceTo(TREASURE) < 3) { g.quest = 'carry'; say(g, 'Treasure found! Bring it back to the golden tree', 5); }
    if (g.quest === 'carry' && Math.hypot(g.pos.x, g.pos.z) < HOME_RADIUS) { g.quest = 'done'; say(g, 'Treasure returned to the golden tree — quest complete!', 6); }
    if (g.quest === 'find') c.position.copy(TREASURE);
    else if (g.quest === 'carry') c.position.set(g.pos.x, g.pos.y + (g.mode === 'vehicle' ? 2 : 2.7), g.pos.z);
    else c.position.copy(home);
    c.rotation.y = g.quest === 'carry' ? g.yaw : .4;
    c.scale.setScalar(g.quest === 'carry' ? .55 : 1);
    if (beacon.current) { beacon.current.visible = g.quest === 'find'; beacon.current.position.set(TREASURE.x, SEA_LEVEL + 4, TREASURE.z); beacon.current.rotation.y = clock.elapsedTime; }
  });
  return <>
    <group ref={chest}>
      <mesh castShadow position-y={.4}><boxGeometry args={[1.4, .8, .9]} /><meshStandardMaterial color={palette.bark} roughness={.8} /></mesh>
      <mesh castShadow position-y={.95} rotation-z={Math.PI / 2}><cylinderGeometry args={[.45, .45, 1.4, 12, 1, false, 0, Math.PI]} /><meshStandardMaterial color={palette.bark} roughness={.8} /></mesh>
      <mesh position={[0, .55, 0]}><boxGeometry args={[1.46, .12, .96]} /><meshStandardMaterial color={palette.gold} metalness={.8} roughness={.25} emissive={palette.gold} emissiveIntensity={.25} /></mesh>
      <mesh position={[0, .6, .47]}><boxGeometry args={[.22, .26, .06]} /><meshStandardMaterial color={palette.gold} metalness={.8} roughness={.25} /></mesh>
    </group>
    <mesh ref={beacon}><octahedronGeometry args={[1.2, 0]} /><meshStandardMaterial color={palette.gold} emissive={palette.gold} emissiveIntensity={.8} /></mesh>
  </>;
}

/** Writes the camera's compass heading (radians clockwise from north = −Z). */
function HeadingProbe({ game }: { game: GameState }) {
  const { camera } = useThree(); const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => { camera.getWorldDirection(v); game.heading = Math.atan2(v.x, -v.z); });
  return null;
}

export function WorldFeatures({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  return <><Roads /><Sea game={game} palette={palette} /><FuelBottles game={game} palette={palette} /><Treasure game={game} palette={palette} /><HeadingProbe game={game} /></>;
}
