import type { GameState } from './Explorer';
import type { Vehicle } from '@/lib/game-world';
import { sfx } from '@/lib/sfx';

export const say = (g: GameState, text: string, secs = 3) => { g.message = text; g.messageUntil = performance.now() + secs * 1000; };

const HIT_COOLDOWN = 700; // ms between damage ticks so one collision counts once

/** Damage the explorer; returns true when the hit landed. */
export function hurtPlayer(g: GameState, amount: number, why: string) {
  const now = performance.now();
  if (now - g.hurtAt < HIT_COOLDOWN || amount <= 0) return false;
  g.hurtAt = now; g.health = Math.max(0, g.health - amount);
  sfx.hurt();
  say(g, `${why} −${Math.round(amount)} health`, 1.8);
  return true;
}

export function hurtVehicle(g: GameState, v: Vehicle, amount: number, why: string) {
  const now = performance.now();
  if (now - g.hurtAt < HIT_COOLDOWN || amount <= 0) return false;
  g.hurtAt = now; v.health = Math.max(0, v.health - amount);
  sfx.bump();
  say(g, `${why} −${Math.round(amount)} ${v.type} health`, 1.8);
  return true;
}
