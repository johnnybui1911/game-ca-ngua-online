import { describe, expect, it } from 'vitest';
import { createGame } from '../../../shared/game/engine';
import { POS_STABLE, type DiceValue, type GameState } from '../../../shared/game/types';
import { describeMove } from './move-text';

function stateWith(horses: number[], dice: DiceValue, others?: { color: 0 | 1 | 2 | 3; row: number[] }): GameState {
  const g = createGame([0, 1]);
  g.horses[0] = horses;
  if (others) g.horses[others.color] = others.row;
  return { ...g, phase: 'move', dice, legalHorses: [0, 1, 2, 3] };
}

describe('describeMove', () => {
  it('describes leaving the stable', () => {
    expect(describeMove(stateWith([POS_STABLE, POS_STABLE, POS_STABLE, POS_STABLE], 6), 1)).toBe('Quân 2: ra quân');
  });

  it('describes a plain track move', () => {
    expect(describeMove(stateWith([10, POS_STABLE, POS_STABLE, POS_STABLE], 4), 0)).toBe('Quân 1: đi 4 ô');
  });

  it('calls a renamed horse by its name and an unnamed one by its number', () => {
    const g = stateWith([10, POS_STABLE, POS_STABLE, POS_STABLE], 4);
    expect(describeMove(g, 0, ['Xích Thố', '', '', ''])).toBe('Xích Thố: đi 4 ô');
    expect(describeMove(g, 0, ['', '', '', ''])).toBe('Quân 1: đi 4 ô');
  });

  it('describes climbing from the gate', () => {
    expect(describeMove(stateWith([POS_STABLE, POS_STABLE, 55, POS_STABLE], 5), 2)).toBe('Quân 3: lên bậc 5');
  });

  it('describes climbing one more home step', () => {
    expect(describeMove(stateWith([POS_STABLE, POS_STABLE, POS_STABLE, 58], 4), 3)).toBe('Quân 4: lên bậc 4');
  });

  it('mentions the colour that gets kicked', () => {
    // Red horse at progress 10 (cell 10) moving 4 lands on cell 14 = blue's entry, where a blue horse stands.
    const g = stateWith([10, POS_STABLE, POS_STABLE, POS_STABLE], 4, { color: 1, row: [0, -1, -1, -1] });
    expect(describeMove(g, 0)).toBe('Quân 1: đi 4 ô, đá xanh dương');
  });
});
