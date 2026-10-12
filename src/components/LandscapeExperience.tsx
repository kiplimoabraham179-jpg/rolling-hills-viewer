import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { Expand, Minimize, Minus, Plus, RotateCcw, Orbit, TreeDeciduous, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createGame, respawn, type CharacterKind } from './Explorer';
import { LandscapeScene, type LandscapePalette } from './LandscapeScene';

const INITIAL_POSITION: [number, number, number] = [0, 22, 49];
const INITIAL_TARGET: [number, number, number] = [0, 17, 0];

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    return this.state.failed ? <div className="scene-loading" role="alert"><TreeDeciduous size={32} /><p>The landscape couldn’t open.</p><small>Your browser needs WebGL to display this scene. Try enabling hardware acceleration or using another browser.</small><Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button></div> : this.props.children;
  }
}

export default function LandscapeExperience() {
  const controls = useRef<OrbitControlsImpl>(null);
  const container = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<LandscapePalette | null>(null);
  const [ready, setReady] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const game = useRef(createGame()).current;
  const [kind, setKind] = useState<CharacterKind>('toy');
  const [follow, setFollow] = useState(true);
  const [touch, setTouch] = useState(false);
  const knob = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
    const kd = (e: KeyboardEvent) => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); } game.keys.add(e.code); };
    const ku = (e: KeyboardEvent) => game.keys.delete(e.code);
    const clear = () => game.keys.clear();
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', clear); };
  }, [game]);
  const joy = (e: React.PointerEvent<HTMLDivElement>, end = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 50, y = (e.clientY - r.top - r.height / 2) / 50;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (end) { x = 0; y = 0; }
    game.joy.x = x; game.joy.y = -y;
    if (knob.current) knob.current.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
  };
  const switchKind = (k: CharacterKind) => { setKind(k); respawn(game, k); };

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const names = { sky: 'sky', mist: 'mist', grass: 'grass', grassLight: 'grass-light', forest: 'forest', mountain: 'mountain', leaf: 'leaf', leafLight: 'leaf-light', bark: 'bark', sun: 'sun', toySkin: 'toy-skin', toyShirt: 'toy-shirt', toyPants: 'toy-pants', toyHat: 'toy-hat', bird: 'bird', birdWing: 'bird-wing' };
    const entries = Object.entries(names).map(([key, name]) => {
      // Browsers resolve OKLCH to sRGB through canvas; Three.js receives linear color.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Color conversion unavailable');
      ctx.fillStyle = css.getPropertyValue(`--scene-${name}`).trim(); ctx.fillRect(0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return [key, new THREE.Color().setRGB((pixel[0] ?? 0) / 255, (pixel[1] ?? 0) / 255, (pixel[2] ?? 0) / 255, THREE.SRGBColorSpace)];
    });
    setPalette(Object.fromEntries(entries) as LandscapePalette);
    const probe = document.createElement('canvas');
    const webgl = probe.getContext('webgl2');
    if (!webgl) setUnavailable(true);
    else webgl.getExtension('WEBGL_lose_context')?.loseContext();
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const reset = () => {
    if (follow) { game.camYaw = game.yaw + Math.PI; game.camPitch = .32; game.camDist = 9; return; }
    const orbit = controls.current;
    if (!orbit) return;
    setRotating(false);
    orbit.object.position.set(...INITIAL_POSITION); orbit.target.set(...INITIAL_TARGET); orbit.update();
  };
  const zoom = (factor: number) => {
    if (follow) { game.camDist = THREE.MathUtils.clamp(game.camDist * factor, 4, 26); return; }
    const orbit = controls.current;
    if (!orbit) return;
    const offset = orbit.object.position.clone().sub(orbit.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, orbit.minDistance, orbit.maxDistance));
    orbit.object.position.copy(orbit.target).add(offset); orbit.update();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (container.current?.requestFullscreen) await container.current.requestFullscreen();
      else setNotice('Fullscreen is not supported in this browser.');
    } catch { setNotice('Fullscreen is unavailable in this window.'); }
  };

  return <div className="landscape-app" ref={container}>
    <SceneBoundary>
      <div className="landscape-canvas" aria-label="Interactive 3D landscape with a golden-green tree and mountain valley">
        {palette && !unavailable && <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: INITIAL_POSITION, fov: 44, near: .2, far: 1000 }} gl={{ antialias: true, powerPreference: 'high-performance' }}
          fallback={<div className="scene-loading" role="alert"><p>WebGL isn’t available in this browser.</p><small>Try a browser with hardware acceleration enabled.</small></div>}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
            gl.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setContextLost(true); });
            gl.domElement.addEventListener('webglcontextrestored', () => setContextLost(false));
          }}>
          <Suspense fallback={null}><LandscapeScene palette={palette} onReady={() => setReady(true)} game={game} kind={kind} follow={follow} /></Suspense>
          {!follow && <OrbitControls ref={controls} makeDefault target={[game.pos.x, game.pos.y + 1, game.pos.z]} enableDamping dampingFactor={.07} autoRotate={rotating} autoRotateSpeed={.45}
            minDistance={15} maxDistance={125} minPolarAngle={.12} maxPolarAngle={Math.PI / 2 - .035} zoomSpeed={.7} rotateSpeed={.6} panSpeed={.7} />}
        </Canvas>}
      </div>
      {!ready && !unavailable && <div className="scene-loading" role="status"><LoaderCircle className="motion-safe:animate-spin" size={25} /><p>Growing your landscape…</p></div>}
      {unavailable && <div className="scene-loading" role="alert"><TreeDeciduous size={32} /><p>WebGL isn’t available in this browser.</p><small>Enable hardware acceleration or try another browser to explore this landscape.</small></div>}
      {contextLost && <div className="scene-loading" role="alert"><p>The 3D connection was interrupted.</p><Button onClick={() => window.location.reload()}>Reload landscape</Button></div>}
    </SceneBoundary>
    <header className="landscape-header"><div className="landscape-brand"><TreeDeciduous strokeWidth={1.4} /><h1>Living Landscape <span>3D</span></h1></div><p>A moment in the mountains.</p></header>
    <div className="scene-status"><span className="status-dot" />{ready ? 'Live landscape' : 'Preparing scene'}</div>
    <div className="game-hud" aria-label="Game controls">
      <div className="row" role="group" aria-label="Character">
        <Button size="sm" variant={kind === 'toy' ? 'default' : 'secondary'} aria-pressed={kind === 'toy'} onClick={() => switchKind('toy')}>Toy explorer</Button>
        <Button size="sm" variant={kind === 'bird' ? 'default' : 'secondary'} aria-pressed={kind === 'bird'} onClick={() => switchKind('bird')}>Bird</Button>
      </div>
      <div className="row">
        <Button size="sm" variant="secondary" onClick={() => respawn(game, kind)}>Respawn</Button>
        <Button size="sm" variant="secondary" aria-pressed={!follow} onClick={() => setFollow(f => !f)}>{follow ? 'Free camera' : 'Follow camera'}</Button>
      </div>
      <p className="hint">WASD / arrows move · Shift run · {kind === 'bird' ? 'Space/E up · Q/C down' : 'Space jump'} · drag to orbit camera</p>
    </div>
    {touch && <><div className="joystick" aria-label="Movement joystick" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); joy(e); }} onPointerMove={e => { if (e.buttons || e.pressure) joy(e); }} onPointerUp={e => joy(e, true)} onPointerCancel={e => joy(e, true)}><div className="joystick-knob" ref={knob} /></div>
      <div className="touch-buttons">
        <Button aria-label={kind === 'bird' ? 'Fly up' : 'Jump'} onPointerDown={() => { game.jumpHeld = true; }} onPointerUp={() => { game.jumpHeld = false; }} onPointerLeave={() => { game.jumpHeld = false; }}>{kind === 'bird' ? 'Up' : 'Jump'}</Button>
        {kind === 'bird' && <Button variant="secondary" aria-label="Fly down" onPointerDown={() => { game.downHeld = true; }} onPointerUp={() => { game.downHeld = false; }} onPointerLeave={() => { game.downHeld = false; }}>Down</Button>}
      </div></>}
    <div className="landscape-caption"><p>01 / THE GOLDEN CANOPY</p><h2>Somewhere, a little closer to nature.</h2></div>
    <div className="landscape-bottom">
      <div className="landscape-toolbar" role="toolbar" aria-label="Landscape camera controls">
        <Button variant="ghost" onClick={reset} aria-label="Reset View" title="Reset View"><RotateCcw /><span className="toolbar-label">Reset view</span></Button>
        <span className="toolbar-divider" />
        <Button variant="ghost" onClick={() => setRotating(v => !v)} aria-label="Auto Rotate" aria-pressed={rotating} title="Auto Rotate" className={rotating ? 'tool-active' : ''}><Orbit /><span className="toolbar-label">Auto rotate</span></Button>
        <span className="toolbar-divider" />
        <Button variant="ghost" size="icon" aria-label="Zoom Out" title="Zoom Out" onClick={() => zoom(1.18)}><Minus /></Button>
        <Button variant="ghost" size="icon" aria-label="Zoom In" title="Zoom In" onClick={() => zoom(1 / 1.18)}><Plus /></Button>
        <span className="toolbar-divider" />
        <Button variant="ghost" size="icon" aria-label={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'} title="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Expand />}</Button>
      </div>
      <p className="landscape-instructions">{follow ? 'Move with WASD or joystick · Drag to orbit · Scroll to zoom' : 'Free camera · Drag to rotate · Scroll to zoom · Pinch to explore'}</p>
      {notice && <p role="status" className="landscape-instructions">{notice}</p>}
    </div>
  </div>;
}