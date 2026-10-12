import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { Expand, Minimize, Minus, Plus, RotateCcw, Orbit, TreeDeciduous, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LandscapeScene, type LandscapePalette } from './LandscapeScene';

const INITIAL_POSITION: [number, number, number] = [27, 21, 48];
const INITIAL_TARGET: [number, number, number] = [0, 17, 0];

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
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
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const names = { sky: 'sky', mist: 'mist', grass: 'grass', grassLight: 'grass-light', forest: 'forest', mountain: 'mountain', leaf: 'leaf', leafLight: 'leaf-light', bark: 'bark', sun: 'sun' };
    const entries = Object.entries(names).map(([key, name]) => {
      // Browsers resolve OKLCH to sRGB through canvas; Three.js receives linear color.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Color conversion unavailable');
      ctx.fillStyle = css.getPropertyValue(`--scene-${name}`).trim(); ctx.fillRect(0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return [key, new THREE.Color().setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, THREE.SRGBColorSpace)];
    });
    setPalette(Object.fromEntries(entries) as LandscapePalette);
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const reset = () => {
    const orbit = controls.current;
    if (!orbit) return;
    setRotating(false);
    orbit.object.position.set(...INITIAL_POSITION); orbit.target.set(...INITIAL_TARGET); orbit.update();
  };
  const zoom = (factor: number) => {
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
        {palette && <Canvas shadows dpr={[1, 1.5]} camera={{ position: INITIAL_POSITION, fov: 44, near: .2, far: 1000 }} gl={{ antialias: true, powerPreference: 'high-performance' }}
          fallback={<div className="scene-loading" role="alert"><p>WebGL isn’t available in this browser.</p><small>Try a browser with hardware acceleration enabled.</small></div>}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
            gl.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setContextLost(true); });
            gl.domElement.addEventListener('webglcontextrestored', () => setContextLost(false));
          }}>
          <Suspense fallback={null}><LandscapeScene palette={palette} onReady={() => setReady(true)} /></Suspense>
          <OrbitControls ref={controls} makeDefault target={INITIAL_TARGET} enableDamping dampingFactor={.07} autoRotate={rotating} autoRotateSpeed={.45}
            minDistance={15} maxDistance={125} minPolarAngle={.12} maxPolarAngle={Math.PI / 2 - .035} zoomSpeed={.7} rotateSpeed={.6} panSpeed={.7} />
        </Canvas>}
      </div>
      {!ready && <div className="scene-loading" role="status"><LoaderCircle className="animate-spin" size={25} /><p>Growing your landscape…</p></div>}
      {contextLost && <div className="scene-loading" role="alert"><p>The 3D connection was interrupted.</p><Button onClick={() => window.location.reload()}>Reload landscape</Button></div>}
    </SceneBoundary>
    <header className="landscape-header"><div className="landscape-brand"><TreeDeciduous strokeWidth={1.4} /><h1>Living Landscape <span>3D</span></h1></div><p>A moment in the mountains.</p></header>
    <div className="scene-status"><span className="status-dot" />{ready ? 'Live landscape' : 'Preparing scene'}</div>
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
      <p className="landscape-instructions">Drag to rotate · Scroll to zoom · Pinch to explore</p>
      {notice && <p role="status" className="landscape-instructions">{notice}</p>}
    </div>
  </div>;
}