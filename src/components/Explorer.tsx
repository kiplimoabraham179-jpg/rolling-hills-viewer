import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '@/lib/landscape-geometry';
import type { LandscapePalette } from './LandscapeScene';

export type CharacterKind = 'toy' | 'bird';
export type GameState = {
  keys: Set<string>; joy: { x: number; y: number }; jumpHeld: boolean; downHeld: boolean;
  pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; grounded: boolean;
  camYaw: number; camPitch: number; camDist: number;
};

// Feel constants
const WALK = 6, RUN = 11, FLY = 13, FLY_BOOST = 22, ACCEL = 9, GRAVITY = 26, JUMP = 9.5, CLIMB = 9;
const TURN = 12;
export const SPAWN = new THREE.Vector3(7, 0, 14);

export function createGame(): GameState {
  return { keys: new Set(), joy: { x: 0, y: 0 }, jumpHeld: false, downHeld: false, pos: SPAWN.clone().setY(heightAt(SPAWN.x, SPAWN.z)),
    vel: new THREE.Vector3(), yaw: Math.PI, grounded: true, camYaw: 0, camPitch: .32, camDist: 9 };
}
export function respawn(g: GameState, kind: CharacterKind) {
  g.pos.copy(SPAWN).setY(heightAt(SPAWN.x, SPAWN.z) + (kind === 'bird' ? 4 : 0)); g.vel.set(0, 0, 0); g.yaw = Math.PI; g.camYaw = 0; g.camPitch = .32;
}

function readInput(g: GameState) {
  const k = g.keys;
  let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  x += g.joy.x; y += g.joy.y;
  const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
  const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(g.joy.x, g.joy.y) > .92;
  const up = k.has('Space') || k.has('KeyE') || g.jumpHeld;
  const down = k.has('KeyQ') || k.has('KeyC') || k.has('ControlLeft') || g.downHeld;
  return { x, y, run, up, down };
}
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function Player({ game, kind, palette }: { game: GameState; kind: CharacterKind; palette: LandscapePalette }) {
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), shadow = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null), armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null), wingR = useRef<THREE.Group>(null);
  const phase = useRef(0), jumpLatch = useRef(false), target = useRef(new THREE.Vector3());

  useFrame((state, raw) => {
    const dt = Math.min(raw, .05), g = game, input = readInput(g), t = state.clock.elapsedTime;
    const s = Math.sin(g.camYaw), c = Math.cos(g.camYaw);
    // camera-relative: forward = away from camera, right = camera right
    const dx = -s * input.y + c * input.x, dz = -c * input.y - s * input.x;
    const speed = kind === 'bird' ? (input.run ? FLY_BOOST : FLY) : (input.run ? RUN : WALK);
    target.current.set(dx * speed, 0, dz * speed);
    const k = 1 - Math.exp(-(kind === 'bird' ? ACCEL * .5 : g.grounded ? ACCEL : ACCEL * .35) * dt);
    g.vel.x += (target.current.x - g.vel.x) * k; g.vel.z += (target.current.z - g.vel.z) * k;
    const ground = heightAt(g.pos.x, g.pos.z);
    if (kind === 'bird') {
      const vy = (input.up ? CLIMB : 0) - (input.down ? CLIMB : 0);
      g.vel.y += (vy - g.vel.y) * (1 - Math.exp(-5 * dt));
    } else {
      if (input.up && g.grounded && !jumpLatch.current) { g.vel.y = JUMP; g.grounded = false; }
      jumpLatch.current = input.up;
      g.vel.y -= GRAVITY * dt;
    }
    g.pos.addScaledVector(g.vel, dt);
    // open world: terrain is streamed in chunks, no hard boundary
    if (!Number.isFinite(g.pos.x) || !Number.isFinite(g.pos.z)) g.pos.copy(SPAWN);
    // tree trunk collision
    const tr = Math.hypot(g.pos.x, g.pos.z), floor = heightAt(g.pos.x, g.pos.z);
    if (tr < 1.3 && g.pos.y < floor + 6) { const f = 1.3 / Math.max(tr, .001); g.pos.x *= f; g.pos.z *= f; }
    // terrain following
    const minY = heightAt(g.pos.x, g.pos.z) + (kind === 'bird' ? 1.2 : 0);
    if (g.pos.y <= minY) { g.pos.y = minY; if (g.vel.y < 0) g.vel.y = 0; g.grounded = true; }
    else if (kind === 'toy' && g.grounded && g.pos.y - minY < .45 && g.vel.y <= 0) g.pos.y = minY; // stick to downhill slopes
    else g.grounded = kind === 'bird' ? false : g.pos.y - minY < .02;
    if (kind === 'bird') g.pos.y = Math.min(g.pos.y, ground + 60);

    const hs = Math.hypot(g.vel.x, g.vel.z);
    if (hs > .3) g.yaw = lerpAngle(g.yaw, Math.atan2(g.vel.x, g.vel.z), 1 - Math.exp(-TURN * dt));
    const node = root.current; if (!node) return;
    node.position.copy(g.pos); node.rotation.y = g.yaw;
    if (shadow.current) { shadow.current.position.set(g.pos.x, heightAt(g.pos.x, g.pos.z) + .05, g.pos.z); const h = g.pos.y - heightAt(g.pos.x, g.pos.z); shadow.current.scale.setScalar(Math.max(.3, 1 - h * .04)); }

    if (kind === 'toy') {
      phase.current += dt * (2 + hs * 1.6);
      const moving = THREE.MathUtils.clamp(hs / WALK, 0, 1.4), sw = Math.sin(phase.current) * .8 * moving;
      const air = g.grounded ? 0 : 1;
      if (legL.current) legL.current.rotation.x = air ? -.5 : sw; if (legR.current) legR.current.rotation.x = air ? .3 : -sw;
      if (armL.current) { armL.current.rotation.x = air ? -2.4 : -sw * .9; armL.current.rotation.z = .12; }
      if (armR.current) { armR.current.rotation.x = air ? -2.4 : sw * .9; armR.current.rotation.z = -.12; }
      if (body.current) { body.current.position.y = g.grounded ? Math.abs(Math.cos(phase.current)) * .09 * moving + Math.sin(t * 2.2) * .02 * (1 - Math.min(moving, 1)) : 0;
        body.current.rotation.x = moving * .12; }
    } else {
      const flap = input.up ? 16 : hs > 1 ? 9 : 5;
      phase.current += dt * flap;
      const w = Math.sin(phase.current) * (input.down ? .25 : .75);
      if (wingL.current) wingL.current.rotation.z = w; if (wingR.current) wingR.current.rotation.z = -w;
      if (body.current) { body.current.position.y = Math.sin(phase.current) * -.08 + 1; body.current.rotation.x = THREE.MathUtils.clamp(-g.vel.y * .04 + hs * .015, -.5, .5); body.current.rotation.z = 0; }
    }
  });

  return <>
    <mesh ref={shadow} rotation-x={-Math.PI / 2}><circleGeometry args={[.6, 20]} /><meshBasicMaterial color={palette.forest} transparent opacity={.45} depthWrite={false} /></mesh>
    <group ref={root}>
      {kind === 'toy' ? <group ref={body}>
        {[[-.17, legL], [.17, legR]].map(([x, ref], i) => <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, .78, 0]}>
          <mesh position={[0, -.33, 0]} castShadow><capsuleGeometry args={[.12, .42, 4, 10]} /><meshStandardMaterial color={palette.toyPants} roughness={.6} /></mesh>
          <mesh position={[0, -.72, .06]} castShadow><boxGeometry args={[.22, .14, .34]} /><meshStandardMaterial color={palette.bark} roughness={.7} /></mesh>
        </group>)}
        <mesh position={[0, 1.15, 0]} castShadow><capsuleGeometry args={[.3, .38, 6, 14]} /><meshStandardMaterial color={palette.toyShirt} roughness={.45} /></mesh>
        <mesh position={[0, 1.18, -.3]} castShadow><boxGeometry args={[.42, .48, .22]} /><meshStandardMaterial color={palette.bark} roughness={.8} /></mesh>
        {[[-.4, armL], [.4, armR]].map(([x, ref], i) => <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, 1.42, 0]}>
          <mesh position={[0, -.27, 0]} castShadow><capsuleGeometry args={[.09, .36, 4, 10]} /><meshStandardMaterial color={palette.toyShirt} roughness={.45} /></mesh>
          <mesh position={[0, -.55, 0]} castShadow><sphereGeometry args={[.1, 12, 10]} /><meshStandardMaterial color={palette.toySkin} roughness={.5} /></mesh>
        </group>)}
        <mesh position={[0, 1.9, 0]} castShadow><sphereGeometry args={[.32, 22, 16]} /><meshStandardMaterial color={palette.toySkin} roughness={.45} /></mesh>
        {[-.11, .11].map(x => <mesh key={x} position={[x, 1.94, .29]}><sphereGeometry args={[.04, 8, 6]} /><meshStandardMaterial color={palette.forest} /></mesh>)}
        <mesh position={[0, 2.12, 0]} castShadow><cylinderGeometry args={[.5, .5, .04, 24]} /><meshStandardMaterial color={palette.toyHat} roughness={.7} /></mesh>
        <mesh position={[0, 2.24, 0]} castShadow><cylinderGeometry args={[.25, .3, .24, 20]} /><meshStandardMaterial color={palette.toyHat} roughness={.7} /></mesh>
      </group> : <group ref={body}>
        <mesh castShadow scale={[.75, .7, 1.25]}><sphereGeometry args={[.5, 20, 14]} /><meshStandardMaterial color={palette.bird} roughness={.5} /></mesh>
        <mesh position={[0, .25, .6]} castShadow><sphereGeometry args={[.3, 18, 12]} /><meshStandardMaterial color={palette.bird} roughness={.5} /></mesh>
        <mesh position={[0, .2, .95]} rotation-x={Math.PI / 2}><coneGeometry args={[.09, .28, 8]} /><meshStandardMaterial color={palette.toyHat} /></mesh>
        {[-.13, .13].map(x => <mesh key={x} position={[x, .32, .82]}><sphereGeometry args={[.04, 8, 6]} /><meshStandardMaterial color={palette.forest} /></mesh>)}
        <mesh position={[0, -.05, .1]} scale={[.55, .5, .9]}><sphereGeometry args={[.5, 16, 12]} /><meshStandardMaterial color={palette.toySkin} roughness={.6} /></mesh>
        <mesh position={[0, .05, -.75]} rotation-x={-.25} scale={[1, .15, 1]}><coneGeometry args={[.32, .7, 4]} /><meshStandardMaterial color={palette.birdWing} roughness={.6} /></mesh>
        {[[-1, wingL], [1, wingR]].map(([side, ref], i) => <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[(side as number) * .3, .12, 0]}>
          <mesh position={[(side as number) * .65, 0, 0]} scale={[1.3, .08, .55]} castShadow><sphereGeometry args={[.5, 14, 8]} /><meshStandardMaterial color={palette.birdWing} roughness={.6} /></mesh>
        </group>)}
      </group>}
    </group>
  </>;
}

export function FollowCamera({ game }: { game: GameState }) {
  const { camera, gl } = useThree();
  const look = useRef(new THREE.Vector3()), want = useRef(new THREE.Vector3()), first = useRef(true);
  useEffect(() => {
    const el = gl.domElement; const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
    const down = (e: PointerEvent) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d0 = Math.hypot(a!.x - b!.x, a!.y - b!.y); p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a!.x - b!.x, a!.y - b!.y); if (pinch) game.camDist = THREE.MathUtils.clamp(game.camDist * d0 / d1, 4, 26); pinch = d1; return; }
      game.camYaw -= (e.clientX - p.x) * .006; game.camPitch = THREE.MathUtils.clamp(game.camPitch + (e.clientY - p.y) * .004, -.1, 1.2);
      p.x = e.clientX; p.y = e.clientY;
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); game.camDist = THREE.MathUtils.clamp(game.camDist * (1 + Math.sign(e.deltaY) * .1), 4, 26); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); };
  }, [gl, game]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, .05), g = game, d = g.camDist;
    want.current.set(g.pos.x + Math.sin(g.camYaw) * Math.cos(g.camPitch) * d, g.pos.y + 1.6 + Math.sin(g.camPitch) * d, g.pos.z + Math.cos(g.camYaw) * Math.cos(g.camPitch) * d);
    want.current.y = Math.max(want.current.y, heightAt(want.current.x, want.current.z) + .8);
    const k = first.current ? 1 : 1 - Math.exp(-6 * dt); first.current = false;
    camera.position.lerp(want.current, k);
    look.current.lerp(new THREE.Vector3(g.pos.x, g.pos.y + 1.4, g.pos.z), first.current ? 1 : 1 - Math.exp(-10 * dt));
    camera.lookAt(look.current);
  });
  return null;
}
