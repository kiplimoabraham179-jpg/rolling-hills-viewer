import { useEffect, useRef, useState } from 'react';
import { heightAt } from '@/lib/landscape-geometry';
import { forestAt } from '@/lib/world-chunks';
import { FUEL_BOTTLES, LEVELS, RUNWAY, SEA_LEVEL, WIND, roadPaths, treasureAt } from '@/lib/game-world';
import { activeTreasure, showTreasureMarker } from '@/lib/adventure-rules';
import type { GameState } from './Explorer';
import { nearestVehicle, vehicleCap } from './Vehicles';

const MAP = 160, SCALE = 2.2, CELL = 4; // px, world units per px, px per terrain cell
const ROADS = roadPaths();

type Snap = { mode: GameState['mode']; type: string | undefined; fuel: number; cap: number; speed: number; alt: number; near: string | undefined; quest: GameState['quest']; dist: number; msg: string; bonus: number; bottles: number; under: boolean; level: number; deposited: number; discovered: boolean; health: number; vehicleHealth: number; hint: string; wind: number; direction: string };

export function MapHud({ game }: { game: GameState }) {
  const map = useRef<HTMLCanvasElement>(null), dial = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<Snap | null>(null);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement), v = (n: string) => css.getPropertyValue(`--scene-${n}`).trim();
    const col = { water: v('water'), sand: v('sand'), grass: v('grass'), forest: v('forest'), mountain: v('mountain'), road: v('road'), fuel: v('fuel'), gold: v('gold'), car: v('car'), plane: v('plane'), leaf: v('leaf-light'), ink: v('bark'), white: v('foam') };
    const bg = document.createElement('canvas'); bg.width = bg.height = MAP;
    let bgAt = { x: 1e9, z: 1e9 }, raf = 0;
    const drawBg = (cx: number, cz: number) => {
      const b = bg.getContext('2d'); if (!b) return;
      for (let py = 0; py < MAP; py += CELL) for (let px = 0; px < MAP; px += CELL) {
        const x = cx + (px + CELL / 2 - MAP / 2) * SCALE, z = cz + (py + CELL / 2 - MAP / 2) * SCALE, h = heightAt(x, z);
        b.fillStyle = h < SEA_LEVEL ? col.water : h < SEA_LEVEL + 1.5 ? col.sand : h > 30 ? col.mountain : forestAt(x, z) > .5 ? col.forest : col.grass;
        b.fillRect(px, py, CELL, CELL);
      }
      bgAt = { x: cx, z: cz };
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = game, c = map.current?.getContext('2d');
      if (dial.current) dial.current.style.transform = `rotate(${-g.heading}rad)`;
      if (!c) return;
      if (Math.hypot(g.pos.x - bgAt.x, g.pos.z - bgAt.z) > 30) drawBg(g.pos.x, g.pos.z);
      const toMap = (x: number, z: number): [number, number] => [MAP / 2 + (x - g.pos.x) / SCALE, MAP / 2 + (z - g.pos.z) / SCALE];
      c.clearRect(0, 0, MAP, MAP);
      c.save(); c.beginPath(); c.arc(MAP / 2, MAP / 2, MAP / 2 - 1, 0, Math.PI * 2); c.clip();
      c.globalAlpha = .82; c.drawImage(bg, (bgAt.x - g.pos.x) / SCALE, (bgAt.z - g.pos.z) / SCALE); c.globalAlpha = 1;
      c.strokeStyle = col.road; c.lineWidth = 2.5;
      for (const path of ROADS) { c.beginPath(); path.forEach(([x, z], i) => { const [mx, my] = toMap(x, z); if (i) c.lineTo(mx, my); else c.moveTo(mx, my); }); c.stroke(); }
      const dot = (x: number, z: number, r: number, fill: string) => { const [mx, my] = toMap(x, z); c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
      FUEL_BOTTLES.forEach((b, i) => { if (!g.collected[i]) dot(b.x, b.z, 2.5, col.fuel); });
      g.vehicles.forEach((v, i) => { if (i !== g.vid) { const [mx, my] = toMap(v.pos.x, v.pos.z); c.fillStyle = v.type === 'car' ? col.car : col.plane; c.fillRect(mx - 3, my - 3, 6, 6); } });
      dot(0, 0, 4, col.leaf);
      const [rx, rz] = toMap(RUNWAY.x, RUNWAY.z); c.fillStyle = col.road; c.fillRect(rx - RUNWAY.halfLength / SCALE, rz - 3, RUNWAY.halfLength * 2 / SCALE, 6);
      c.restore();
      // treasure marker, pinned to the rim when off-map
      if (showTreasureMarker(g)) {
        const target = activeTreasure(g.treasureIdx).pos;
        let [mx, my] = toMap(target.x, target.z); const dx = mx - MAP / 2, dy = my - MAP / 2, l = Math.hypot(dx, dy), R = MAP / 2 - 7;
        if (l > R) { mx = MAP / 2 + dx / l * R; my = MAP / 2 + dy / l * R; }
        c.fillStyle = col.gold; c.strokeStyle = col.ink; c.lineWidth = 1; c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      if (g.quest === 'carry') { const [hx, hy] = toMap(0, 0); const dx = hx - MAP / 2, dy = hy - MAP / 2, l = Math.hypot(dx, dy), R = MAP / 2 - 7;
        const k = l > R ? R / l : 1; c.strokeStyle = col.gold; c.lineWidth = 2; c.beginPath(); c.arc(MAP / 2 + dx * k, MAP / 2 + dy * k, 6, 0, Math.PI * 2); c.stroke(); }
      // player arrow
      c.save(); c.translate(MAP / 2, MAP / 2); c.rotate(Math.atan2(-Math.sin(g.yaw), Math.cos(g.yaw)) + Math.PI);
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fillStyle = col.white; c.strokeStyle = col.ink; c.lineWidth = 1.2; c.fill(); c.stroke(); c.restore();
    };
    loop();
    const id = window.setInterval(() => {
      const g = game, v = g.mode === 'vehicle' ? g.vehicles[g.vid] : undefined, near = g.mode === 'foot' ? nearestVehicle(g) : null;
      const target = showTreasureMarker(g) ? activeTreasure(g.treasureIdx).pos : g.quest === 'carry' ? { x: 0, z: 0 } : null;
      setS({ mode: g.mode, type: v?.type, fuel: v?.fuel ?? 0, cap: v ? vehicleCap(g, v) : 0, speed: Math.abs(v?.speed ?? Math.hypot(g.vel.x, g.vel.z)), alt: v ? v.pos.y - Math.max(heightAt(v.pos.x, v.pos.z), SEA_LEVEL) : 0,
        near: near?.v.type, quest: g.quest, dist: target ? Math.hypot(target.x - g.pos.x, target.z - g.pos.z) : 0,
        msg: performance.now() < g.messageUntil ? g.message : '', bonus: g.tankBonus, bottles: g.collected.filter(Boolean).length, under: g.camUnder,
        level: Math.min(LEVELS, g.treasureIdx + 1), deposited: g.deposited, discovered: g.discovered, health: g.health, vehicleHealth: v?.health ?? 100, hint: treasureAt(g.treasureIdx).hint,
        wind: WIND.speed, direction: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'][((Math.round(WIND.angle / (Math.PI / 4)) % 8) + 8) % 8] ?? 'S' });
    }, 120);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [game]);

  const pct = s && s.cap ? s.fuel / s.cap : 0;
  return <>
    {s?.under && <div className="underwater-tint" aria-hidden />}
    <div className="nav-hud" aria-label="Compass and minimap">
      <div className="compass" role="img" aria-label="Compass"><div className="compass-dial" ref={dial}>
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => <span key={d} className={d === 'N' ? 'north' : ''} style={{ transform: `rotate(${i * 90}deg) translateY(-25px) rotate(${-i * 90}deg)` }}>{d}</span>)}
      </div><i className="compass-needle" /></div>
      <canvas ref={map} width={MAP} height={MAP} className="minimap" aria-label="Minimap" />
      {s && <div className="quest-card" role="status">
        <strong>{s.quest === 'done' ? 'Adventure complete ✓' : `Level ${s.level}/${LEVELS}`}</strong>
        <span>{s.quest === 'find' ? s.discovered ? `Treasure spotted · ${Math.round(s.dist)} m` : s.hint : s.quest === 'carry' ? `Return to the golden tree · ${Math.round(s.dist)} m` : 'All seven treasures are safe at home.'}</span>
        <span className="muted">Deposited {s.deposited}/{LEVELS} · bottles {s.bottles}/{FUEL_BOTTLES.length}</span>
        <span className="wind-readout">Wind toward {s.direction} · {s.wind.toFixed(1)} m/s</span>
      </div>}
    </div>
    {s && <div className="health-card" aria-label="Explorer health">
      <div className="gauge-head"><strong>Explorer</strong><span>{Math.ceil(s.health)} / 100</span></div>
      <div className="fuel-bar health-bar" role="meter" aria-label="Explorer health" aria-valuenow={Math.ceil(s.health)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.health}%` }} className={s.health < 25 ? 'low' : ''} /></div>
    </div>}
    {s && s.mode === 'vehicle' && <div className="gauge-card" aria-label="Vehicle gauges">
      <div className="gauge-head"><strong>{s.type === 'car' ? 'Toy car' : 'Toy plane'}</strong><span>{Math.round(s.speed * 3.6)} km/h{s.type === 'plane' ? ` · ${Math.round(s.alt)} m up` : ''}</span></div>
      <div className="fuel-bar" role="meter" aria-label="Fuel" aria-valuenow={Math.round(s.fuel)} aria-valuemin={0} aria-valuemax={Math.round(s.cap)}><i style={{ width: `${pct * 100}%` }} className={pct < .2 ? 'low' : ''} /></div>
      <span className="muted">Fuel {Math.round(s.fuel)} / {Math.round(s.cap)} · F to exit</span>
      <div className="fuel-bar health-bar" role="meter" aria-label="Vehicle health" aria-valuenow={Math.ceil(s.vehicleHealth)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.vehicleHealth}%` }} className={s.vehicleHealth < 25 ? 'low' : ''} /></div>
      <span className="muted">Condition {Math.ceil(s.vehicleHealth)} / 100</span>
    </div>}
    {s && (s.msg || s.near) && <div className="game-toast" role="status">{s.msg || `Press F to ${s.near === 'car' ? 'drive the toy car' : 'fly the toy plane'}`}</div>}
  </>;
}
