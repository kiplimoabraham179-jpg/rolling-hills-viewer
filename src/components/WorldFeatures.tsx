import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LAKE, heightAt } from '@/lib/landscape-geometry';
import { FUEL_BOTTLES, HOME_RADIUS, LEVELS, RUNWAY, SEA_LEVEL, WIND, makeRoadGeometry, makeRoadTexture, treasureAt, updateWind } from '@/lib/game-world';
import type { GameState } from './Explorer';
import type { LandscapePalette } from './LandscapeScene';
import { say, vehicleCap } from './Vehicles';
import { sfx } from '@/lib/sfx';

function Roads() {
  const geo = useMemo(makeRoadGeometry, []), tex = useMemo(makeRoadTexture, []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial map={tex} roughness={.95} polygonOffset polygonOffsetFactor={-2} /></mesh>;
}

/** Saturated blue water with wind-driven ripples: one sea sheet plus the lake disc. */
function Water({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const sea = useRef<THREE.Mesh>(null), lake = useRef<THREE.Mesh>(null);
  const seaGeo = useMemo(() => { const g = new THREE.PlaneGeometry(2400, 1600, 72, 48); g.rotateX(-Math.PI / 2); return g; }, []);
  const lakeGeo = useMemo(() => { const g = new THREE.CircleGeometry(LAKE.r + 14, 40, 0, Math.PI * 2); g.rotateX(-Math.PI / 2); return g; }, []);
  useEffect(() => () => { seaGeo.dispose(); lakeGeo.dispose(); }, [seaGeo, lakeGeo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, m = sea.current;
    if (m) {
      m.position.x = game.pos.x; m.position.z = Math.max(1180, game.pos.z);
      const p = seaGeo.getAttribute('position');
      const wx = Math.sin(WIND.angle), wz = Math.cos(WIND.angle), amp = .12 + WIND.speed * .02;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + m.position.x, z = p.getZ(i) + m.position.z;
        p.setY(i, Math.sin((x * wx + z * wz) * .25 + t * 1.6) * amp + Math.sin(x * .09 - t * .9) * amp * .5);
      }
      p.needsUpdate = true; seaGeo.computeVertexNormals();
    }
    if (lake.current) lake.current.position.y = SEA_LEVEL + .05 + Math.sin(t * 1.4) * .05;
  });
  const waterMat = <meshStandardMaterial color={palette.water} emissive={palette.waterDeep} emissiveIntensity={.35} transparent opacity={.82} roughness={.12} metalness={.25} side={THREE.DoubleSide} depthWrite={false} />;
  return <>
    <mesh ref={sea} geometry={seaGeo} position={[0, SEA_LEVEL, 1180]}>{waterMat}</mesh>
    <mesh ref={lake} geometry={lakeGeo} position={[LAKE.x, SEA_LEVEL + .05, LAKE.z]}>
      <meshStandardMaterial color={palette.water} emissive={palette.waterDeep} emissiveIntensity={.3} transparent opacity={.8} roughness={.15} metalness={.2} depthWrite={false} />
    </mesh>
  </>;
}

/** Windsock at the runway threshold — shows wind direction and strength. */
function Windsock({ palette }: { palette: LandscapePalette }) {
  const sock = useRef<THREE.Group>(null);
  const y = heightAt(RUNWAY.x + RUNWAY.halfLength + 6, RUNWAY.z - 7);
  useFrame(({ clock }) => {
    const s = sock.current; if (!s) return;
    s.rotation.y = WIND.angle + Math.PI; // cone points where the wind comes from
    s.rotation.z = THREE.MathUtils.lerp(.9, .05, Math.min(WIND.speed / 8, 1)); // stronger wind = straighter sock
    s.position.y = 3.1 + Math.sin(clock.elapsedTime * 2.2) * .05 * WIND.speed * .1;
  });
  return <group position={[RUNWAY.x + RUNWAY.halfLength + 6, y, RUNWAY.z - 7]}>
    <mesh castShadow position-y={1.6}><cylinderGeometry args={[.06, .09, 3.2, 8]} /><meshStandardMaterial color={palette.mist} roughness={.5} /></mesh>
    <group ref={sock} position-y={0}>
      <mesh castShadow rotation-x={Math.PI / 2} position-z={.75}><coneGeometry args={[.32, 1.5, 10, 1, true]} /><meshStandardMaterial color={palette.car} roughness={.6} side={THREE.DoubleSide} /></mesh>
      <mesh position-z={.35} rotation-x={Math.PI / 2}><torusGeometry args={[.3, .04, 6, 14]} /><meshStandardMaterial color={palette.plane} roughness={.5} /></mesh>
    </group>
  </group>;
}

/** Soft toy clouds that drift with the wind and wrap around the player. */
function Clouds({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: (i * 173) % 600 - 300, z: (i * 289) % 600 - 300, y: 95 + (i % 3) * 22, s: 6 + (i % 4) * 2.5 })), []);
  useFrame((_, raw) => {
    const dt = Math.min(raw, .05), g = group.current; if (!g) return;
    const wx = Math.sin(WIND.angle) * WIND.speed, wz = Math.cos(WIND.angle) * WIND.speed;
    g.children.forEach((c, i) => {
      const s = seeds[i]!;
      c.position.x += wx * dt * 1.6; c.position.z += wz * dt * 1.6;
      // wrap in a 700-unit box around the player
      if (c.position.x - game.pos.x > 350) c.position.x -= 700; if (c.position.x - game.pos.x < -350) c.position.x += 700;
      if (c.position.z - game.pos.z > 350) c.position.z -= 700; if (c.position.z - game.pos.z < -350) c.position.z += 700;
      c.position.y = s.y + Math.sin(clockSafe() * .3 + i) * 2;
    });
  });
  const clockRef = useRef(0);
  useFrame(({ clock }) => { clockRef.current = clock.elapsedTime; });
  const clockSafe = () => clockRef.current;
  return <group ref={group}>
    {seeds.map((s, i) => <group key={i} position={[s.x, s.y, s.z]}>
      {[[0, 0, 0, 1], [1.1, -.15, .3, .7], [-1.1, -.1, -.2, .75], [.3, .35, -.4, .6]].map(([x, y, z, k], j) =>
        <mesh key={j} position={[(x ?? 0) * s.s, (y ?? 0) * s.s, (z ?? 0) * s.s]} scale={s.s * (k ?? 1)}>
          <sphereGeometry args={[1, 12, 9]} /><meshStandardMaterial color={palette.foam} roughness={1} transparent opacity={.92} />
        </mesh>)}
    </group>)}
  </group>;
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
        sfx.pickup();
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

/** Levels 1–7: find the treasure, carry it home, deposit to unlock the next. */
function Treasure({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const chest = useRef<THREE.Group>(null), beacon = useRef<THREE.Mesh>(null);
  const home = useMemo(() => new THREE.Vector3(3.5, heightAt(3.5, 3.5), 3.5), []);
  const target = useMemo(() => {
    const t = treasureAt(game.treasureIdx); t.pos.y = heightAt(t.pos.x, t.pos.z); return t;
  }, [game.treasureIdx]);
  useFrame(({ clock }) => {
    const g = game, c = chest.current; if (!c) return;
    const tp = target.pos;
    // discovery: the treasure only appears on the map once you get close
    if (g.quest === 'find' && !g.discovered && Math.hypot(tp.x - g.pos.x, tp.z - g.pos.z) < 55) {
      g.discovered = true; sfx.discover(); say(g, 'You spotted something shiny! Check the map', 4);
    }
    if (g.quest === 'find' && g.pos.distanceTo(tp) < 3) {
      g.quest = 'carry'; sfx.pickup(); say(g, `Treasure ${g.treasureIdx + 1} found! Bring it back to the golden tree`, 5);
    }
    if (g.quest === 'carry' && Math.hypot(g.pos.x, g.pos.z) < HOME_RADIUS) {
      g.deposited++; g.tankBonus += 5; g.health = 100;
      g.vehicles.forEach(v => { v.fuel = vehicleCap(g, v); });
      if (g.deposited >= LEVELS) { g.quest = 'done'; sfx.levelup(); say(g, 'All 7 treasures are home — you finished the whole adventure!', 8); }
      else {
        g.quest = 'find'; g.treasureIdx++; g.discovered = false; sfx.deposit();
        say(g, `Level ${g.deposited} complete! Level ${g.deposited + 1}: ${treasureAt(g.treasureIdx).hint}`, 8);
      }
    }
    if (g.quest === 'find') c.position.copy(tp);
    else if (g.quest === 'carry') c.position.set(g.pos.x, g.pos.y + (g.mode === 'vehicle' ? 2 : 2.7), g.pos.z);
    else c.position.copy(home);
    c.rotation.y = g.quest === 'carry' ? g.yaw : .4;
    c.scale.setScalar(g.quest === 'carry' ? .55 : 1);
    if (beacon.current) { beacon.current.visible = g.quest === 'find' && g.discovered; beacon.current.position.set(tp.x, Math.max(tp.y, SEA_LEVEL) + 5, tp.z); beacon.current.rotation.y = clock.elapsedTime; }
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
  useFrame(({ clock }) => updateWind(clock.elapsedTime));
  return <>
    <Roads /><Water game={game} palette={palette} /><Windsock palette={palette} /><Clouds game={game} palette={palette} />
    <FuelBottles game={game} palette={palette} /><Treasure game={game} palette={palette} /><HeadingProbe game={game} />
  </>;
}
