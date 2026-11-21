import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, createGame, engine } from './engine';
import { chooseCpuMove } from './cpu';
import { mulberry32 } from './seeded-random';
import {
  COLORS,
  POS_GATE,
  POS_STABLE,
  isOnTrack,
  trackCell,
  type Color,
  type DiceValue,
  type GameState,
  type HorsePos,
} from './types';

/** Builds a roll-phase state with the given horse positions (others in stable). */
function make(
  colors: Color[],
  placed: Partial<Record<Color, HorsePos[]>>,
  turn: Color = colors[0] ?? 0,
): GameState {
  const base = createGame(colors);
  const horses = base.horses.map((row, c) => placed[c as Color] ?? row);
  return { ...base, horses, turn };
}

function setPos(g: GameState, color: number, horse: number, pos: HorsePos): void {
  const row = g.horses[color];
  if (!row) throw new Error('bad colour');
  row[horse] = pos;
}
function posOf(g: GameState, color: number, horse: number): HorsePos {
  const p = g.horses[color]?.[horse];
  if (p === undefined) throw new Error('bad index');
  return p;
}

const legal = (state: GameState, dice: DiceValue) => applyRoll(state, dice).state.legalHorses;
const S = POS_STABLE;

describe('createGame', () => {
  it('sorts colours and starts in roll phase with everything in the stable', () => {
    const g = createGame([2, 0, 1]);
    expect(g.colors).toEqual([0, 1, 2]);
    expect(g.turn).toBe(0);
    expect(g.phase).toBe('roll');
    expect(g.horses.flat().every((p) => p === S)).toBe(true);
  });
  it('rejects bad colour sets', () => {
    expect(() => createGame([0])).toThrow();
    expect(() => createGame([0, 0])).toThrow();
    expect(() => createGame([0, 1, 2, 3, 0])).toThrow();
    expect(() => createGame([0, 7 as Color])).toThrow();
  });
});

describe('rule 1: leaving the stable', () => {
  it('only on 1 and 6', () => {
    const g = createGame([0, 1]);
    expect(legal(g, 1)).toEqual([0, 1, 2, 3]);
    expect(legal(g, 6)).toEqual([0, 1, 2, 3]);
    for (const d of [2, 3, 4, 5] as DiceValue[]) expect(legal(g, d)).toEqual([]);
  });
  it('is blocked by an own horse on the entry cell', () => {
    const g = make([0, 1], { 0: [0, S, S, S] });
    expect(legal(g, 6)).toEqual([0]);
  });
  it('kicks an opponent on the entry cell', () => {
    // colour 1 horse at progress 42 stands on cell 56 -> 0 (colour 0 entry).
    const g = make([0, 1], { 1: [42, S, S, S] });
    expect(trackCell(1, 42)).toBe(0);
    const r1 = applyRoll(g, 1);
    const r = applyMove(r1.state, 0);
    expect(r.events[0]).toMatchObject({
      type: 'moved',
      from: S,
      to: 0,
      kicked: { color: 1, horse: 0, from: 42 },
    });
    expect(posOf(r.state, 1, 0)).toBe(S);
    expect(posOf(r.state, 0, 0)).toBe(0);
  });
});

describe('rule 2: track movement', () => {
  it('moves exactly dice cells', () => {
    const g = make([0, 1], { 0: [10, S, S, S] });
    const r = applyMove(applyRoll(g, 3).state, 0);
    expect(posOf(r.state, 0, 0)).toBe(13);
  });
  it('is blocked by any horse in between, own or foreign', () => {
    const own = make([0, 1], { 0: [10, 12, S, S] });
    expect(legal(own, 4)).toEqual([1]);
    const foreign = make([0, 1], { 0: [10, S, S, S], 1: [S, S, S, S] });
    setPos(foreign, 1, 0, 53); // cell 67%56=11
    expect(trackCell(1, 53)).toBe(11);
    expect(legal(foreign, 4)).toEqual([]);
    expect(legal(foreign, 1)).toEqual([0, 1, 2, 3]); // landing on the neighbour is a kick, not a pass
  });
  it('cannot land on an own horse but kicks an opponent', () => {
    const own = make([0, 1], { 0: [10, 14, S, S] });
    expect(legal(own, 4)).toEqual([1]);
    const opp = make([0, 1], { 0: [10, S, S, S], 1: [S, S, S, S] });
    setPos(opp, 1, 2, 0); // cell 14
    const r = applyMove(applyRoll(opp, 4).state, 0);
    expect(r.events[0]).toMatchObject({ kicked: { color: 1, horse: 2, from: 0 } });
    expect(posOf(r.state, 1, 2)).toBe(S);
  });
  it('kicks across colour offsets by absolute cell', () => {
    // Colour 2 progress 30 -> cell 58%56=2. Colour 0 progress 2 is cell 2.
    const g = make([0, 2], { 0: [S, S, S, S], 2: [30, S, S, S] });
    setPos(g, 0, 1, 0);
    const r = applyMove(applyRoll(g, 2).state, 1);
    expect(trackCell(0, 2)).toBe(trackCell(2, 30));
    expect(r.events[0]).toMatchObject({ kicked: { color: 2, horse: 0, from: 30 } });
  });
  it('cannot overshoot the gate', () => {
    const g = make([0, 1], { 0: [53, S, S, S] });
    expect(legal(g, 3)).toEqual([]);
    expect(legal(g, 2)).toEqual([0]);
  });
  it('colour offsets: a foreign horse on a home column does not block the track', () => {
    const g = make([0, 1], { 0: [10, S, S, S], 1: [S, S, S, S] });
    setPos(g, 1, 0, POS_GATE + 2); // home column, cell-free
    expect(legal(g, 3)).toEqual([0]);
  });
});

describe('rule 3: gate to home', () => {
  it('climbs to step n', () => {
    const g = make([0, 1], { 0: [POS_GATE, S, S, S] });
    const r = applyMove(applyRoll(g, 4).state, 0);
    expect(posOf(r.state, 0, 0)).toBe(POS_GATE + 4);
  });
  it('is blocked when a lower step holds an own horse', () => {
    const g = make([0, 1], { 0: [POS_GATE, POS_GATE + 2, S, S] });
    expect(legal(g, 3)).toEqual([1]); // horse 0 is blocked, only horse 1 steps 2 -> 3
    expect(legal(g, 2)).toEqual([]);
    expect(legal(g, 1)).toEqual([0, 2, 3]);
  });
  it('is blocked on the target step itself', () => {
    const g = make([0, 1], { 0: [POS_GATE, POS_GATE + 5, S, S] });
    expect(legal(g, 5)).toEqual([]);
  });
});

describe('rule 4: home column', () => {
  it('step k to k+1 only on exactly k+1', () => {
    const g = make([0, 1], { 0: [POS_GATE + 2, S, S, S] });
    expect(legal(g, 3)).toEqual([0]);
    expect(legal(g, 1)).toEqual([1, 2, 3]);
    for (const d of [2, 4, 5] as DiceValue[]) expect(legal(g, d)).toEqual([]);
  });
  it('needs the next step to be empty', () => {
    const g = make([0, 1], { 0: [POS_GATE + 2, POS_GATE + 3, S, S] });
    expect(legal(g, 3)).toEqual([]);
  });
  it('step 6 cannot move', () => {
    const g = make([0, 1], { 0: [POS_GATE + 6, S, S, S] });
    for (const d of [1, 2, 3, 4, 5, 6] as DiceValue[]) {
      expect(legal(g, d)).not.toContain(0);
    }
  });
});

describe('rule 5: extra rolls and turn order', () => {
  it('1 and 6 give another roll after a move', () => {
    for (const d of [1, 6] as DiceValue[]) {
      const g = make([0, 1], { 0: [10, S, S, S] });
      const r = applyMove(applyRoll(g, d).state, 0);
      expect(r.events.at(-1)).toEqual({ type: 'turn', color: 0, extraRoll: true });
      expect(r.state.turn).toBe(0);
      expect(r.state.phase).toBe('roll');
      expect(r.state.dice).toBeNull();
    }
  });
  it('1 and 6 give another roll with no legal move', () => {
    const g = make([0, 1], { 0: [POS_GATE + 6, POS_GATE + 5, POS_GATE + 4, POS_GATE + 3] });
    for (const d of [1, 6] as DiceValue[]) {
      const r = applyRoll(g, d);
      expect(r.events).toEqual([
        { type: 'rolled', color: 0, dice: d, legalHorses: [] },
        { type: 'turn', color: 0, extraRoll: true },
      ]);
      expect(r.state.turn).toBe(0);
    }
  });
  it('other rolls pass the turn, with or without a legal move', () => {
    const g = make([0, 1], { 0: [10, S, S, S] });
    const moved = applyMove(applyRoll(g, 3).state, 0);
    expect(moved.events.at(-1)).toEqual({ type: 'turn', color: 1, extraRoll: false });
    const none = applyRoll(createGame([0, 1]), 3);
    expect(none.events.at(-1)).toEqual({ type: 'turn', color: 1, extraRoll: false });
    expect(none.state.turn).toBe(1);
    expect(none.state.dice).toBeNull();
    expect(none.state.phase).toBe('roll');
  });
  it.each([
    [[0, 1], [0, 1, 0]],
    [[0, 2, 3], [0, 2, 3, 0]],
    [[0, 1, 2, 3], [0, 1, 2, 3, 0]],
  ] as [Color[], Color[]][])('turn order for %j', (colors, order) => {
    let g = createGame(colors);
    const seen: Color[] = [g.turn];
    for (let i = 1; i < order.length; i++) {
      g = applyRoll(g, 2).state;
      seen.push(g.turn);
    }
    expect(seen).toEqual(order);
  });
});

describe('rule 6: forced move', () => {
  it('rolled event lists legal horses and phase becomes move', () => {
    const g = make([0, 1], { 0: [10, S, S, S] });
    const r = applyRoll(g, 6);
    expect(r.events[0]).toEqual({ type: 'rolled', color: 0, dice: 6, legalHorses: [0, 1, 2, 3] });
    expect(r.state.phase).toBe('move');
    expect(r.state.dice).toBe(6);
  });
  it('rejects illegal calls', () => {
    const g = make([0, 1], { 0: [10, S, S, S] });
    expect(() => applyMove(g, 0)).toThrow();
    const m = applyRoll(g, 3).state;
    expect(() => applyRoll(m, 3)).toThrow();
    expect(() => applyMove(m, 1)).toThrow();
    expect(() => applyMove(m, 9)).toThrow();
  });
});

describe('rule 7: winning', () => {
  it('last horse onto the home column wins', () => {
    const g = make([0, 1], { 0: [POS_GATE + 6, POS_GATE + 5, POS_GATE + 4, POS_GATE] });
    const r = applyMove(applyRoll(g, 3).state, 3);
    expect(r.events.map((e) => e.type)).toEqual(['moved', 'won']);
    expect(r.state.phase).toBe('finished');
    expect(r.state.winner).toBe(0);
    expect(() => applyRoll(r.state, 1)).toThrow();
  });
  it('does not win while a horse is still on the track', () => {
    const g = make([0, 1], { 0: [POS_GATE + 6, POS_GATE + 5, POS_GATE + 4, 40] });
    const r = applyMove(applyRoll(g, 2).state, 3);
    expect(r.state.winner).toBeNull();
    expect(r.state.phase).toBe('roll');
  });
});

describe('immutability', () => {
  it('never mutates inputs', () => {
    const g = make([0, 1], { 0: [10, S, S, S], 1: [14, S, S, S] });
    const snap = structuredClone(g);
    const rolled = applyRoll(g, 4);
    expect(g).toEqual(snap);
    const rolledSnap = structuredClone(rolled.state);
    applyMove(rolled.state, 0);
    expect(rolled.state).toEqual(rolledSnap);
    expect(rolled.state.horses).not.toBe(g.horses);
  });
});

describe('chooseCpuMove', () => {
  const pick = (g: GameState, d: DiceValue) => chooseCpuMove(applyRoll(g, d).state);
  it('prefers a kick over everything', () => {
    const g = make([0, 1], { 0: [POS_GATE, 10, S, S], 1: [S, S, S, S] });
    setPos(g, 1, 0, 55); // cell (14+55)%56 = 13
    expect(trackCell(1, 55)).toBe(13);
    expect(pick(g, 3)).toBe(1);
  });
  it('prefers home climbing, highest resulting step first', () => {
    const g = make([0, 1], { 0: [POS_GATE - 2, POS_GATE, POS_GATE + 2, 20] });
    expect(pick(g, 3)).toBe(2);
    const h = make([0, 1], { 0: [53, 20, S, S] });
    expect(pick(h, 2)).toBe(0);
  });
  it('prefers leaving the stable over plain advancing', () => {
    const g = make([0, 1], { 0: [20, S, S, S] });
    expect(pick(g, 6)).toBe(1);
  });
  it('else advances the furthest horse, ties to lowest index', () => {
    const g = make([0, 1], { 0: [10, 30, 30 - 20, S] });
    expect(pick(g, 3)).toBe(1);
    const t = make([0, 1], { 0: [S, S, S, S] });
    expect(pick(t, 6)).toBe(0);
  });
});

function assertConsistent(state: GameState): void {
  const cells = new Set<number>();
  for (const color of COLORS) {
    const homes = new Set<number>();
    for (const pos of state.horses[color] ?? []) {
      if (isOnTrack(pos)) {
        const cell = trackCell(color, pos);
        if (cells.has(cell)) throw new Error(`two horses on cell ${cell}`);
        cells.add(cell);
      } else if (pos > POS_GATE) {
        if (homes.has(pos)) throw new Error(`two horses on home step ${pos} of colour ${color}`);
        homes.add(pos);
      }
    }
  }
}

describe('simulation', () => {
  it('200 seeded CPU-vs-CPU games finish with consistent boards', () => {
    const colorSets: Color[][] = [
      [0, 1],
      [0, 2],
      [1, 3],
      [0, 1, 2],
      [0, 1, 3],
      [0, 1, 2, 3],
    ];
    for (let game = 0; game < 200; game++) {
      const rand = mulberry32(1000 + game);
      let state = engine.createGame(colorSets[game % colorSets.length] ?? [0, 1]);
      let rolls = 0;
      while (state.phase !== 'finished') {
        if (++rolls > 5000) throw new Error(`game ${game} exceeded 5000 rolls`);
        const dice = (Math.floor(rand() * 6) + 1) as DiceValue;
        state = engine.applyRoll(state, dice).state;
        assertConsistent(state);
        if (state.phase === 'move') {
          state = engine.applyMove(state, engine.chooseCpuMove(state)).state;
          assertConsistent(state);
        }
      }
      expect(state.winner).not.toBeNull();
      expect((state.horses[state.winner as Color] ?? []).every((p) => p > POS_GATE)).toBe(true);
    }
  });
});
