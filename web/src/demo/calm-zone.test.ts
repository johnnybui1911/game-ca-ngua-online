import { describe, expect, it } from 'vitest';
import { nearRect } from './calm-zone';

describe('nearRect', () => {
  const rect = { left: 100, top: 700, right: 300, bottom: 760 };

  it('is true inside the zone and within the margin around it', () => {
    expect(nearRect(200, 730, rect, 96)).toBe(true);
    expect(nearRect(100 - 96, 700 - 96, rect, 96)).toBe(true);
    expect(nearRect(300 + 96, 760 + 96, rect, 96)).toBe(true);
  });

  it('is false past the margin on any side', () => {
    expect(nearRect(100 - 97, 730, rect, 96)).toBe(false);
    expect(nearRect(300 + 97, 730, rect, 96)).toBe(false);
    expect(nearRect(200, 700 - 97, rect, 96)).toBe(false);
    expect(nearRect(200, 760 + 97, rect, 96)).toBe(false);
  });
});
