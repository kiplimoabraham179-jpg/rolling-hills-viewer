import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '@/lib/landscape-geometry';
import { SEA_LEVEL, WIND, baseCap, roadDist, type Vehicle } from '@/lib/game-world';
import { collideCircle } from '@/lib/world-chunks';
import { hurtVehicle } from './game-rules';
import { readInput, type GameState } from './Explorer';
import type { LandscapePalette } from './LandscapeScene';

// Feel constants
const CAR_ROAD = 26, CAR_OFF = 14, CAR_STEER = 1.9, CAR_BURN = .8;
const PLANE_MAX = 44, PLANE_LIFT = 15, PLANE_TURN = 1.1, PLANE_BURN = 1.1, CEILING = 180;

export const vehicleCap = (g: GameState, v: Vehicle) => baseCap(v.type) + g.tankBonus;
export const say = (g: GameState, text: string, secs = 3) => { g.message = text; g.messageUntil = performance.now() + secs * 1000; };

/** Enter the nearest vehicle, or exit the current one. */
export function toggleVehicle(g: GameState) {
  if (g.mode === 'vehicle') {
    const v = g.vehicles[g.vid];
    if (v && v.type === 'plane' && v.pos.y > Math.max(heightAt(v.pos.x, v.pos.z), SEA_LEVEL) + 3) { say(g, 'Land the plane before getting out'); return; }
    g.mode = 'foot'; g.vid = -1;
    if (v) { g.pos.set(v.pos.x - Math.cos(v.yaw) * 2.4, v.pos.y, v.pos.z + Math.sin(v.yaw) * 2.4); v.speed = 0; v.throttle = 0; v.vy = 0; }
    g.vel.set(0, 0, 0); return;
  }
  const near = nearestVehicle(g);
  if (!near) { say(g, 'No vehicle nearby — walk up to a toy car or plane'); return; }
  g.mode = 'vehicle'; g.vid = near.i; g.lastDrag = 0;
  say(g, near.v.type === 'car' ? 'Car: W/S drive · A/D steer · F exit' : 'Plane: W/S throttle · A/D turn · Space climb · Q dive · F exit', 4);
}
export function nearestVehicle(g: GameState) {
  let best: { v: Vehicle; i: number; d: number } | null = null;
  g.vehicles.forEach((v, i) => { const d = v.pos.distanceTo(g.pos); if (d < 4.5 && (!best || d < best.d)) best = { v, i, d }; });
  return best as { v: Vehicle; i: number; d: number } | null;
}

function driveCar(g: GameState, v: Vehicle, dt: number) {
  const inp = readInput(g), onRoad = roadDist(v.pos.x, v.pos.z) < 4;
  const throttle = v.fuel > 0 ? inp.y : 0;
  const max = (onRoad ? CAR_ROAD : CAR_OFF) * (inp.run ? 1.25 : 1);
  const target = throttle >= 0 ? throttle * max : throttle * max * .4;
  v.speed += (target - v.speed) * (1 - Math.exp(-(throttle ? 1.4 : .9) * dt));
  v.fuel = Math.max(0, v.fuel - Math.abs(throttle) * CAR_BURN * (onRoad ? .7 : 1) * dt);
  if (v.fuel === 0 && Math.abs(inp.y) > 0) say(g, 'Out of fuel! Find a fuel bottle (F to get out)', 1);
  v.yaw -= inp.x * CAR_STEER * dt * THREE.MathUtils.clamp(v.speed / 8, -1, 1);
  const nx = v.pos.x + Math.sin(v.yaw) * v.speed * dt, nz = v.pos.z + Math.cos(v.yaw) * v.speed * dt;
  if (heightAt(nx, nz) < SEA_LEVEL - .7) { v.speed *= -.2; say(g, 'Too deep for a toy car — swim the rest!', 1.5); }
  else if (Math.hypot(nx, nz) < 2.2) v.speed *= -.3; // golden tree trunk
  else { v.pos.x = nx; v.pos.z = nz; }
  // trees and rocks: push the car out, crashes at speed cost durability
  const hit = collideCircle(v.pos.x, v.pos.z, v.pos.y, .95, 1.4);
  if (hit.hit) {
    v.pos.x = hit.x; v.pos.z = hit.z;
    if (Math.abs(v.speed) > 6) hurtVehicle(g, v, Math.abs(v.speed) * .9, hit.kind === 'rock' ? 'Crashed into a rock!' : 'Crashed into a tree!');
    v.speed *= -.25;
  }
  v.pos.y = heightAt(v.pos.x, v.pos.z);
  const fx = Math.sin(v.yaw) * 1.2, fz = Math.cos(v.yaw) * 1.2;
  v.pitch = Math.atan2(heightAt(v.pos.x - fx, v.pos.z - fz) - heightAt(v.pos.x + fx, v.pos.z + fz), 2.4);
  v.roll = THREE.MathUtils.lerp(v.roll, inp.x * .06 * Math.min(Math.abs(v.speed) / 15, 1), 1 - Math.exp(-6 * dt));
}

function flyPlane(g: GameState, v: Vehicle, dt: number) {
  const inp = readInput(g);
  v.throttle = v.fuel > 0 ? THREE.MathUtils.clamp(v.throttle + inp.y * dt * .7, 0, 1) : 0;
  if (v.fuel === 0 && v.pos.y > heightAt(v.pos.x, v.pos.z) + 3) say(g, 'Engine out — gliding down!', 1);
  v.speed += (v.throttle * PLANE_MAX * (inp.run ? 1.2 : 1) - v.speed) * (1 - Math.exp(-.6 * dt));
  v.fuel = Math.max(0, v.fuel - v.throttle * PLANE_BURN * dt);
  const ground = Math.max(heightAt(v.pos.x, v.pos.z), SEA_LEVEL) + .55, airborne = v.pos.y > ground + .1;
  const climb = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
  const vyT = v.speed > PLANE_LIFT ? climb * v.speed * .4 : airborne ? -9 : 0;
  v.vy += (vyT - v.vy) * (1 - Math.exp(-2 * dt));
  v.yaw -= inp.x * PLANE_TURN * dt * (airborne ? 1 : .6) * Math.min(1, v.speed / 6 + .2);
  v.pos.x += Math.sin(v.yaw) * v.speed * dt; v.pos.z += Math.cos(v.yaw) * v.speed * dt; v.pos.y += v.vy * dt;
  if (airborne) { // wind drifts the plane and helps or slows it
    v.pos.x += Math.sin(WIND.angle) * WIND.speed * .4 * dt;
    v.pos.z += Math.cos(WIND.angle) * WIND.speed * .4 * dt;
  }
  if (Math.hypot(v.pos.x, v.pos.z) < 2.2 && v.pos.y < heightAt(0, 0) + 14) { v.speed *= .3; v.pos.x *= 1.1; v.pos.z *= 1.1; }
  const phit = collideCircle(v.pos.x, v.pos.z, v.pos.y - .5, 1.4, 1.2);
  if (phit.hit) {
    v.pos.x = phit.x; v.pos.z = phit.z;
    if (v.speed > 8) hurtVehicle(g, v, v.speed * .8, phit.kind === 'rock' ? 'Clipped a rock!' : 'Clipped a tree!');
    v.speed *= .4;
  }
  const g2 = Math.max(heightAt(v.pos.x, v.pos.z), SEA_LEVEL) + .55;
  if (v.pos.y <= g2) { v.pos.y = g2; v.vy = Math.max(v.vy, 0); if (v.throttle < .2) v.speed *= Math.exp(-1.2 * dt); }
  v.pos.y = Math.min(v.pos.y, CEILING);
  v.pitch = THREE.MathUtils.lerp(v.pitch, -Math.atan2(v.vy, Math.max(v.speed, 4)), 1 - Math.exp(-5 * dt));
  v.roll = THREE.MathUtils.lerp(v.roll, inp.x * (airborne ? .6 : .05), 1 - Math.exp(-4 * dt));
}

const TINTS = ['car', 'toyShirt', 'toyPants'] as const;

export function Vehicles({ game, palette }: { game: GameState; palette: LandscapePalette }) {
  const refs = useRef<(THREE.Group | null)[]>([]), props = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, .05), g = game;
    const v = g.mode === 'vehicle' ? g.vehicles[g.vid] : undefined;
    if (v) { if (v.type === 'car') driveCar(g, v, dt); else flyPlane(g, v, dt); g.pos.copy(v.pos); g.yaw = v.yaw; }
    g.vehicles.forEach((veh, i) => {
      const n = refs.current[i]; if (!n) return;
      n.position.copy(veh.pos); n.rotation.set(veh.pitch, veh.yaw, veh.roll, 'YXZ');
      const p = props.current[i]; if (p) p.rotation.z += dt * (5 + veh.throttle * 60);
    });
  });
  return <>{game.vehicles.map((v, i) => <group key={i} ref={el => { refs.current[i] = el; }}>
    {v.type === 'car' ? <group position-y={.42}>
      <mesh castShadow position-y={.15}><boxGeometry args={[1.5, .5, 2.6]} /><meshStandardMaterial color={palette[TINTS[v.tint % 3]!]} roughness={.35} metalness={.1} /></mesh>
      <mesh castShadow position={[0, .58, -.15]}><boxGeometry args={[1.25, .45, 1.3]} /><meshStandardMaterial color={palette.mist} roughness={.15} metalness={.3} /></mesh>
      <mesh position={[0, .2, 1.31]}><boxGeometry args={[1.1, .16, .04]} /><meshStandardMaterial color={palette.sun} emissive={palette.sun} emissiveIntensity={.6} /></mesh>
      {[[-.78, .82], [.78, .82], [-.78, -.82], [.78, -.82]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x!, -.05, z!]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[.36, .36, .28, 14]} /><meshStandardMaterial color={palette.bark} roughness={.9} /></mesh>)}
    </group> : <group>
      <mesh castShadow rotation-x={Math.PI / 2}><capsuleGeometry args={[.42, 2.6, 6, 12]} /><meshStandardMaterial color={palette.plane} roughness={.4} /></mesh>
      <mesh castShadow position={[0, .05, .35]}><boxGeometry args={[6.2, .1, 1.1]} /><meshStandardMaterial color={palette[TINTS[(v.tint + 1) % 3]!]} roughness={.5} /></mesh>
      <mesh castShadow position={[0, .1, -1.6]}><boxGeometry args={[2.2, .08, .6]} /><meshStandardMaterial color={palette.toyHat} roughness={.5} /></mesh>
      <mesh castShadow position={[0, .5, -1.65]}><boxGeometry args={[.08, .8, .6]} /><meshStandardMaterial color={palette.toyHat} roughness={.5} /></mesh>
      <mesh position={[0, .42, .5]}><sphereGeometry args={[.3, 12, 8]} /><meshStandardMaterial color={palette.mist} roughness={.1} metalness={.3} /></mesh>
      <mesh ref={el => { props.current[i] = el; }} position={[0, 0, 1.78]}><boxGeometry args={[1.6, .14, .04]} /><meshStandardMaterial color={palette.bark} /></mesh>
      {[-.9, .9].map(x => <mesh key={x} position={[x, -.55, .4]}><sphereGeometry args={[.16, 10, 8]} /><meshStandardMaterial color={palette.bark} /></mesh>)}
    </group>}
  </group>)}</>;
}
