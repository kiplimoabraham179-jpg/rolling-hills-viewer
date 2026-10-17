import { describe, expect, it } from 'vitest';
import { activeTreasure, advanceQuest, showTreasureMarker, type QuestState } from '@/lib/adventure-rules';
import { groundAt, heightAt, RUNWAY } from '@/lib/landscape-geometry';
import { createVehicles, onRunway, PLANE_GEAR, surfaceAt } from '@/lib/game-world';
import { chunkItems, collideCircle, makeChunk, sweepCircle } from '@/lib/world-chunks';
import * as THREE from 'three';

const initial = (): QuestState => ({ quest: 'find', treasureIdx: 0, deposited: 0, discovered: false, pos: { x: 7, y: groundAt(7, 14), z: 14 } });
describe('Seven sequential treasure levels', () => {
  it('hides undiscovered treasure markers', () => {
    const g = initial(); expect(showTreasureMarker(g)).toBe(false);
    g.discovered = true; expect(showTreasureMarker(g)).toBe(true);
    g.quest = 'carry'; expect(showTreasureMarker(g)).toBe(false);
  });
  it('unlocks each next treasure only after depositing the previous one', () => {
    const g = initial();
    for (let level = 0; level < 7; level++) {
      g.pos = activeTreasure(level).pos; expect(advanceQuest(g)).toBe('pickup');
      expect(g.treasureIdx).toBe(level); expect(g.deposited).toBe(level);
      g.pos = { x: 3, z: 3, y: groundAt(3, 3) };
      expect(advanceQuest(g)).toBe(level === 6 ? 'complete' : 'deposit');
      expect(g.deposited).toBe(level + 1);
    }
    expect(g.quest).toBe('done'); expect(advanceQuest(g)).toBe(null); expect(g.deposited).toBe(7);
  });
  it('does not discover or collect submerged treasure from overhead', () => {
    const g = initial(); g.treasureIdx = 1; const t = activeTreasure(1).pos;
    g.pos = { x: t.x, z: t.z, y: 20 }; expect(advanceQuest(g)).toBe(null); expect(g.discovered).toBe(false);
    g.pos = { x: t.x, z: t.z, y: -5 }; expect(advanceQuest(g)).toBe('discover');
    g.pos = t; expect(advanceQuest(g)).toBe('pickup');
  });
  it('does not deposit from an aircraft above the home tree', () => {
    const g = initial(); g.quest = 'carry'; g.pos = { x: 3, z: 3, y: 80 };
    expect(advanceQuest(g)).toBe(null); expect(g.deposited).toBe(0);
  });
});
describe('Terrain and runway contact', () => {
  it('keeps the entire runway flat and airplane gear above its surface', () => {
    for (const x of [-180, -140, -100, -60]) expect(heightAt(x, 25)).toBe(RUNWAY.h);
    for (const v of createVehicles().filter(v => v.type === 'plane')) expect(v.pos.y - PLANE_GEAR).toBeCloseTo(surfaceAt(v.pos.x, v.pos.z), 6);
    expect(onRunway(-120, 25)).toBe(true); expect(onRunway(100, 25)).toBe(false);
  });
  it('matches deterministic distant chunks and triangle contact at shared edges', () => {
    const colors = Object.fromEntries(['grass','grassLight','forest','mountain','mist','bark','leafLight','sun','sand','water','waterDeep','foam'].map(k => [k, new THREE.Color()])) as Parameters<typeof makeChunk>[2];
    const a = makeChunk(10, -10, colors), b = makeChunk(11, -10, colors);
    for (let z = -840; z <= -760; z += 2.5) expect(groundAt(840, z)).toBeCloseTo(heightAt(840, z), 8);
    const pa = a.terrain.getAttribute('position'), pb = b.terrain.getAttribute('position');
    const edgeA = Array.from({length: pa.count}, (_, i) => i).filter(i => pa.getX(i) === 840).map(i => pa.getY(i));
    const edgeB = Array.from({length: pb.count}, (_, i) => i).filter(i => pb.getX(i) === 840).map(i => pb.getY(i));
    expect(edgeA).toEqual(edgeB); a.terrain.dispose(); a.deco?.dispose(); b.terrain.dispose(); b.deco?.dispose();
  });
  it('stops swept motion at a trunk and separates overlapping bodies', () => {
    const y = heightAt(0, 0);
    const hit = sweepCircle(-5, 0, 5, 0, y, .42, 2.4);
    expect(hit.hit).toBe(true); expect(hit.x).toBeLessThan(-1);
    const result = collideCircle(0, 0, y, .42, 2.4); expect(Math.hypot(result.x, result.z)).toBeGreaterThanOrEqual(1.52);
  });
  it('keeps runway clear of solid vegetation and rocks', () => {
    const items = chunkItems(-1, 0).filter(it => onRunway(it.x, it.z)); expect(items).toHaveLength(0);
  });
});