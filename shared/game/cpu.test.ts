import { describe, expect, it } from 'vitest';
import { NORMAL_KICK_MIN_PROGRESS, chooseCpuMove } from './cpu';
import { HARD_WEIGHTS, chooseHard } from './cpu-hard';
import { CPU_LEVELS, DEFAULT_CPU_LEVEL, isCpuLevel, type CpuLevel } from './cpu-level';
import { playMatch } from './cpu-sim';
import { applyMove, applyRoll, createGame, landingFor } from './engine';
import { mulberry32 } from './seeded-random';
import {
  POS_GATE,
  POS_STABLE,
  type Color,
  type DiceValue,
  type GameState,
  type HorsePos,
} from './types';

const S = POS_STABLE;

/** Move-phase state: `placed` positions per colour (others in the stable), `dice` rolled by `turn`. */
function moveState(
  colors: Color[],
  placed: Partial<Record<Color, HorsePos[]>>,
  dice: DiceValue,
  turn: Color = colors[0] ?? 0,
): GameState {
  const base = createGame(colors);
  const horses = base.horses.map((row, c) => placed[c as Color] ?? row);
  const rolled = applyRoll({ ...base, horses, turn }, dice).state;
  if (rolled.phase !== 'move') throw new Error('position has no legal move');
  return rolled;
}

/** Hard weights with every term off except `terms`, to test one term in isolation. */
function only(terms: Partial<typeof HARD_WEIGHTS>): typeof HARD_WEIGHTS {
  const zero = Object.fromEntries(Object.keys(HARD_WEIGHTS).map((k) => [k, 0])) as typeof HARD_WEIGHTS;
  return { ...zero, ...terms };
}

/** Yellow (colour 2) enters on track cell 28: yellow progress p sits on cell (28 + p) % 56. */
const yellowAt = (cell: number): number => (cell - 28 + 56) % 56;

/** Plays random legal moves and hands every move-phase state to `visit`. */
function walkGames(games: number, colors: Color[], visit: (state: GameState) => void): void {
  for (let g = 0; g < games; g++) {
    const rand = mulberry32(5000 + g);
    let state = createGame(colors);
    let rolls = 0;
    while (state.phase !== 'finished') {
      if (++rolls > 5000) throw new Error('too long');
      state = applyRoll(state, (Math.floor(rand() * 6) + 1) as DiceValue).state;
      if (state.phase !== 'move') continue;
      visit(state);
      const horse = state.legalHorses[Math.floor(rand() * state.legalHorses.length)] as number;
      state = applyMove(state, horse).state;
    }
  }
}

describe('cpu levels', () => {
  it('recognises exactly the three levels, Thường by default', () => {
    expect([...CPU_LEVELS]).toEqual(['easy', 'normal', 'hard']);
    expect(DEFAULT_CPU_LEVEL).toBe('normal');
    for (const l of CPU_LEVELS) expect(isCpuLevel(l)).toBe(true);
    for (const bad of ['ultra', 'Hard', '', 1, null, undefined]) expect(isCpuLevel(bad)).toBe(false);
  });
});

describe('Normal', () => {
  // Blue (colour 1) enters on track cell 14; red horse 11 reaches it with a 3.
  const nearVictim = { 1: [0, S, S, S] };
  const farVictim = { 2: [yellowAt(14), S, S, S] };

  it('climbs the home column rather than kick, even a victim near its home', () => {
    expect(chooseCpuMove(moveState([0, 2], { 0: [POS_GATE, 11, S, S], ...farVictim }, 3), 'normal')).toBe(0);
  });
  it('kicks a victim in the last quarter of its lap', () => {
    expect(yellowAt(14)).toBeGreaterThanOrEqual(NORMAL_KICK_MIN_PROGRESS);
    expect(chooseCpuMove(moveState([0, 2], { 0: [11, 20, S, S], ...farVictim }, 3), 'normal')).toBe(0);
  });
  it('leaves the stable rather than kick, even a victim near its home', () => {
    expect(chooseCpuMove(moveState([0, 2], { 0: [8, S, S, S], ...farVictim }, 6), 'normal')).toBe(1);
  });
  it('leaves a victim that has not got far alone when another move kicks nobody', () => {
    expect(chooseCpuMove(moveState([0, 1], { 0: [11, 20, S, S], ...nearVictim }, 3), 'normal')).toBe(1);
    // With a 6, leaving the stable comes first too.
    expect(chooseCpuMove(moveState([0, 1], { 0: [8, S, S, S], ...nearVictim }, 6), 'normal')).toBe(1);
  });
  it('kicks when every legal move kicks', () => {
    expect(chooseCpuMove(moveState([0, 1], { 0: [11, S, S, S], ...nearVictim }, 3), 'normal')).toBe(0);
  });
  it('is the default level', () => {
    const state = moveState([0, 1], { 0: [11, 20, S, S], ...nearVictim }, 3);
    expect(chooseCpuMove(state)).toBe(chooseCpuMove(state, 'normal'));
  });
});

describe('Easy', () => {
  // Red horses 0..3 all can leave the stable on a 6.
  const state = moveState([0, 1], {}, 6);
  const scripted = (...draws: number[]) => {
    let i = 0;
    return () => draws[i++] ?? 0;
  };

  it('plays the Normal choice when the first draw is below the smart rate', () => {
    expect(chooseCpuMove(state, 'easy', scripted(0.1))).toBe(chooseCpuMove(state, 'normal'));
  });
  it('otherwise picks the legal horse the second draw points at', () => {
    expect(chooseCpuMove(state, 'easy', scripted(0.9, 0))).toBe(0);
    expect(chooseCpuMove(state, 'easy', scripted(0.9, 0.3))).toBe(1);
    expect(chooseCpuMove(state, 'easy', scripted(0.9, 0.999))).toBe(3);
  });
  it('stays in range when rand returns 1', () => {
    expect(chooseCpuMove(state, 'easy', () => 1)).toBe(3);
  });
  it('draws among the moves that kick nobody, and kicks only when every move does', () => {
    const choice = moveState([0, 1], { 0: [11, 20, S, S], 1: [0, S, S, S] }, 3);
    for (const second of [0, 0.5, 0.999]) expect(chooseCpuMove(choice, 'easy', scripted(0.9, second))).toBe(1);
    const forced = moveState([0, 1], { 0: [11, S, S, S], 1: [0, S, S, S] }, 3);
    expect(chooseCpuMove(forced, 'easy', scripted(0.9, 0.5))).toBe(0);
  });
  it('does not kick even when it plays like Normal, while another move kicks nobody', () => {
    // Normal kicks the yellow horse near its home with horse 0; Easy moves horse 1 instead.
    const far = moveState([0, 2], { 0: [11, 20, S, S], 2: [yellowAt(14), S, S, S] }, 3);
    expect(chooseCpuMove(far, 'normal')).toBe(0);
    expect(chooseCpuMove(far, 'easy', scripted(0.1, 0))).toBe(1);
  });
  it('only picks legal horses', () => {
    walkGames(20, [0, 2], (s) => {
      const rand = mulberry32(s.horses.flat().reduce((a, b) => a + b, 7));
      expect(s.legalHorses).toContain(chooseCpuMove(s, 'easy', rand));
    });
  });
});

describe('Hard terms', () => {
  it('kicks the victim that has travelled furthest', () => {
    // Red h0 (cell 3) and h1 (cell 10) with a 2: h0 kicks cell 5, h1 kicks cell 12.
    const s = moveState([0, 2], { 0: [3, 10, S, S], 2: [yellowAt(5), yellowAt(12), S, S] }, 2);
    expect(chooseHard(s, only({ KICK_BASE: 6, KICK_PROGRESS: 0.5 }))).toBe(1);
    // Swapping which yellow horse stands where does not change the choice.
    const flipped = moveState([0, 2], { 0: [3, 10, S, S], 2: [yellowAt(12), yellowAt(5), S, S] }, 2);
    expect(chooseHard(flipped, only({ KICK_BASE: 6, KICK_PROGRESS: 0.5 }))).toBe(1);
  });

  it('moves a threatened horse out of reach instead of a safe one', () => {
    // Yellow horse on cell 8 threatens red on cell 10; red's other horse is safe. A 5 takes h1 to cell 15.
    const threatenedSecond = moveState([0, 2], { 0: [40, 10, S, S], 2: [yellowAt(8), S, S, S] }, 5);
    expect(chooseHard(threatenedSecond, only({ LOSS_PROGRESS: 1 }))).toBe(1);
    const threatenedFirst = moveState([0, 2], { 0: [10, 40, S, S], 2: [yellowAt(8), S, S, S] }, 5);
    expect(chooseHard(threatenedFirst, only({ LOSS_PROGRESS: 1 }))).toBe(0);
  });

  it('does not land in reach of an opponent when a safe move exists', () => {
    // h0 (cell 10) could kick on cell 12 but would then stand 4 cells ahead of yellow on cell 8; it is
    // already 2 ahead of it, and moving away is worth more than what the other horse's move offers.
    const s = moveState([0, 2], { 0: [10, 30, S, S], 2: [yellowAt(8), yellowAt(12), S, S] }, 2);
    expect(landingFor(s.horses, 0, 0, 2)?.kicked).not.toBeNull();
    // With only the danger term, staying exposed at a bigger distance costs more than not moving h0.
    expect(chooseHard(s, only({ LOSS_PROGRESS: 1 }))).toBe(1);
  });

  it('counts an opponent in the stable as a threat to its own entry cell', () => {
    // Yellow enters on cell 28 with a 1 or a 6, so red on cell 28 is exposed; h1 on cell 10 is not.
    const s = moveState([0, 2], { 0: [5, 28, S, S], 2: [S, S, S, S] }, 3);
    expect(chooseHard(s, only({ LOSS_PROGRESS: 1 }))).toBe(1);
  });

  it('prefers the move that leaves a threat on the most advanced opponent', () => {
    // After h1 moves 3 it sits 4 cells behind a yellow horse that has travelled far.
    const s = moveState([0, 2], { 0: [S, 20, S, S], 2: [yellowAt(27), S, S, S] }, 3);
    expect(chooseHard(s, only({ THREAT: 1, KICK_BASE: 6, KICK_PROGRESS: 0.5 }))).toBe(1);
  });

  it('does not park on a low home step while other horses still need to climb', () => {
    // A 2 would put the gate horse on step 2 and leave one free step for three horses.
    const s = moveState([0, 1], { 0: [POS_GATE, 20, S, S] }, 2);
    expect(chooseHard(s, only({ COLUMN_DEFICIT: 6 }))).toBe(1);
    // Normal climbs regardless.
    expect(chooseCpuMove(s, 'normal')).toBe(0);
  });

  it('frees the entry cell while horses wait in the stable', () => {
    const s = moveState([0, 1], { 0: [0, 30, S, S] }, 3);
    expect(chooseHard(s, only({ ENTRY: 5 }))).toBe(0);
  });

  it('plays the only move that wins', () => {
    // Steps 6 and 5 taken, h2 on step 3, h3 on the gate: a 2 brings h3 to step 2 and every horse is home.
    const s = moveState([0, 1], { 0: [POS_GATE + 6, POS_GATE + 5, POS_GATE + 3, POS_GATE] }, 2);
    expect(chooseHard(s)).toBe(3);
  });

  it('is deterministic and breaks ties towards the lowest horse index', () => {
    const s = moveState([0, 1], {}, 6);
    expect(chooseHard(s, only({}))).toBe(0);
    expect(chooseCpuMove(s, 'hard')).toBe(chooseCpuMove(s, 'hard'));
  });
});

describe('all levels', () => {
  it('only choose legal horses, never mutate the state, over seeded games', () => {
    for (const level of CPU_LEVELS) {
      walkGames(15, [0, 1, 2, 3], (s) => {
        const before = JSON.stringify(s);
        const rand = mulberry32(s.horses.flat().reduce((a, b) => a * 7 + b + 3, 1) >>> 0);
        const pick = chooseCpuMove(s, level, rand);
        expect(s.legalHorses).toContain(pick);
        expect(JSON.stringify(s)).toBe(before);
      });
    }
  });

  it('finish a full game at every level', () => {
    for (const level of CPU_LEVELS) {
      const levels: Partial<Record<Color, CpuLevel>> = { 0: level, 1: level, 2: level, 3: level };
      for (let seed = 1; seed <= 5; seed++) expect([0, 1, 2, 3]).toContain(playMatch(levels, seed).winner);
    }
  });

  it('throw outside the move phase', () => {
    const s = createGame([0, 1]);
    for (const level of CPU_LEVELS) expect(() => chooseCpuMove(s, level)).toThrow();
  });
});
