import { groundAt } from './landscape-geometry';
import { HOME_RADIUS, LEVELS, SEA_LEVEL, treasureAt } from './game-world';

export type QuestState = { quest: 'find' | 'carry' | 'done'; treasureIdx: number; deposited: number; discovered: boolean; pos: { x: number; y: number; z: number } };
export const activeTreasure = (index: number) => {
  const t = treasureAt(index);
  t.pos.y = groundAt(t.pos.x, t.pos.z);
  return t;
};
export const showTreasureMarker = (g: QuestState) => g.quest === 'find' && g.discovered;
/** Shared, three-dimensional proximity rules: flying over home cannot deposit. */
export function advanceQuest(g: QuestState): 'discover' | 'pickup' | 'deposit' | 'complete' | null {
  if (g.quest === 'done') return null;
  if (g.quest === 'carry') {
    if (Math.hypot(g.pos.x, g.pos.z) >= HOME_RADIUS || Math.abs(g.pos.y - groundAt(g.pos.x, g.pos.z)) > 3) return null;
    g.deposited = Math.min(LEVELS, g.deposited + 1);
    g.treasureIdx = Math.min(LEVELS - 1, g.deposited);
    g.discovered = false;
    g.quest = g.deposited === LEVELS ? 'done' : 'find';
    return g.quest === 'done' ? 'complete' : 'deposit';
  }
  const p = activeTreasure(g.treasureIdx).pos;
  const distance = Math.hypot(g.pos.x - p.x, g.pos.y - p.y, g.pos.z - p.z);
  if (distance < 3) { g.discovered = true; g.quest = 'carry'; return 'pickup'; }
  // Underwater treasures cannot be spotted from an aircraft or the shore.
  if (!g.discovered && distance < 22 && (p.y >= SEA_LEVEL || g.pos.y < SEA_LEVEL)) {
    g.discovered = true; return 'discover';
  }
  return null;
}