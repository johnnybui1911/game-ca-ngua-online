import type { GameState } from './types';
import { POS_GATE, POS_STABLE } from './types';
import { landingFor } from './engine';

/**
 * Priority: kick an opponent; else reach/climb the home column (highest
 * resulting step); else leave the stable; else the most advanced track horse.
 * Ties go to the lowest horse index.
 */
export function chooseCpuMove(state: GameState): number {
  if (state.phase !== 'move' || state.dice === null) throw new Error('CPU can only choose in the move phase');
  const color = state.turn;
  const dice = state.dice;

  let kick = -1;
  let home = -1;
  let homeStep = 0;
  let leave = -1;
  let advance = -1;
  let advancePos = -2;

  for (const horse of [...state.legalHorses].sort((a, b) => a - b)) {
    const landing = landingFor(state.horses, color, horse, dice);
    if (landing === null) continue;
    const pos = state.horses[color]?.[horse] ?? POS_STABLE;
    if (landing.kicked && kick < 0) kick = horse;
    if (landing.to > POS_GATE && landing.to - POS_GATE > homeStep) {
      home = horse;
      homeStep = landing.to - POS_GATE;
    }
    if (pos === POS_STABLE && leave < 0) leave = horse;
    if (pos > advancePos) {
      advance = horse;
      advancePos = pos;
    }
  }

  for (const pick of [kick, home, leave, advance]) if (pick >= 0) return pick;
  throw new Error('No legal horse to choose');
}
