import { describe, expect, it } from 'vitest';
import { PACE_NAMES } from '../../../shared/game/pace';
import { PACE_LABELS, paceEstimateText } from './paces';

describe('paceEstimateText', () => {
  it('names the pace, the seats and a range from the bare animations to an all-CPU match', () => {
    expect(paceEstimateText('vua', 4, false)).toBe('Vừa · ván 4 người khoảng 30–40 phút bàn cờ chạy, chưa kể thời gian suy nghĩ.');
    expect(paceEstimateText('nhanh', 4, false)).toContain('Nhanh · ván 4 người khoảng 15–25 phút');
    expect(paceEstimateText('thu-thai', 2, false)).toContain('Thư thả · ván 2 người khoảng 8–10 phút');
  });

  it('says a quick match is one, shows a single number when both ends round to it, and never 0 minutes', () => {
    expect(paceEstimateText('vua', 4, true)).toContain('Vừa · ván nhanh 4 người khoảng 4 phút');
    expect(paceEstimateText('thu-thai', 4, true)).toContain('khoảng 4–5 phút');
    expect(paceEstimateText('nhanh', 2, true)).toContain('khoảng 1 phút');
  });

  it('never shows a slower pace as shorter, nor a quick match as longer than a normal one', () => {
    const ends = (text: string) =>
      (/khoảng (\d+)(?:–(\d+))? phút/.exec(text) ?? [])
        .slice(1)
        .filter((n) => n !== undefined)
        .map(Number);
    for (const seats of [2, 3, 4]) {
      for (const quick of [false, true]) {
        const shown = PACE_NAMES.map((pace) => ends(paceEstimateText(pace, seats, quick)));
        for (let i = 1; i < shown.length; i++) {
          expect(shown[i]![0]).toBeGreaterThanOrEqual(shown[i - 1]![0]!);
          expect(shown[i]!.at(-1)).toBeGreaterThanOrEqual(shown[i - 1]!.at(-1)!);
        }
      }
      for (const pace of PACE_NAMES) {
        expect(ends(paceEstimateText(pace, seats, true))[0]).toBeLessThan(ends(paceEstimateText(pace, seats, false))[0]!);
      }
    }
  });

  it('labels every pace', () => {
    expect(PACE_NAMES.map((pace) => PACE_LABELS[pace])).toEqual(['Nhanh', 'Vừa', 'Thư thả']);
  });
});
