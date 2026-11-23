import type { CSSProperties } from 'react';
import type { DiceValue } from '../../../shared/game/types';

/** Cells of the 3x3 grid (row by row) that hold a pip, per face. */
const PIP_CELLS: Record<DiceValue, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface Props {
  /** The face that came up; null while the die is still being thrown or nobody has thrown yet. */
  value: DiceValue | null;
  /** CSS colour of whoever threw it, for the edge of the tile. */
  seatColor?: string;
}

/** The die of the match HUD: its pips once thrown, a spinner until then. */
export function DieFace({ value, seatColor }: Props) {
  return (
    <span
      className={`dice${value === null ? ' is-loading' : ''}`}
      data-testid="dice-value"
      role="img"
      aria-label={value === null ? 'Xúc xắc đang được đổ' : `Xúc xắc: ${value}`}
      style={seatColor ? ({ '--seat-color': seatColor } as CSSProperties) : undefined}
    >
      {value === null ? (
        <span className="dice-spinner" aria-hidden="true" />
      ) : (
        <span className="dice-pips" key={value} aria-hidden="true">
          {PIP_CELLS[value].map((cell) => (
            <span key={cell} className="dice-pip" style={{ gridArea: `${Math.floor(cell / 3) + 1} / ${(cell % 3) + 1}` }} />
          ))}
        </span>
      )}
      <span className="dice-text">{value ?? '–'}</span>
    </span>
  );
}
