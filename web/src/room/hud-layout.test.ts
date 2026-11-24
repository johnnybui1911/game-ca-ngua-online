import { describe, expect, it } from 'vitest';
import { hasLongHudName } from './hud-layout';

describe('mobile HUD name layout', () => {
  it('uses one row when every name has at most eight words', () => {
    expect(hasLongHudName(['Nam', 'Máy 1', 'a b c d e f g h'])).toBe(false);
  });

  it('uses two rows if any name has more than eight whitespace-separated words', () => {
    expect(hasLongHudName(['Nam', ' a  b\tc d e f g h i '])).toBe(true);
  });
});
