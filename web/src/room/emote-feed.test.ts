import { describe, expect, it } from 'vitest';
import { EMOTE_SHOW_MS, isShown, receiveEmote, type EmoteBySeat } from './emote-feed';

describe('emote feed', () => {
  it('replaces the same seat and keeps the others', () => {
    let s: EmoteBySeat = {};
    s = receiveEmote(s, 0, 'taunt', 1, 100);
    s = receiveEmote(s, 1, 'nice', 2, 200);
    s = receiveEmote(s, 0, 'mercy', 3, 300);
    expect(s[0]).toEqual({ id: 'mercy', n: 3, at: 300 });
    expect(s[1]).toEqual({ id: 'nice', n: 2, at: 200 });
  });

  it('does not mutate the previous map', () => {
    const prev: EmoteBySeat = {};
    receiveEmote(prev, 0, 'taunt', 1, 0);
    expect(prev).toEqual({});
  });

  it('gives a repeated id a new counter value', () => {
    let s = receiveEmote({}, 0, 'laugh', 1, 0);
    const first = s[0]!.n;
    s = receiveEmote(s, 0, 'laugh', 2, 10);
    expect(s[0]!.n).not.toBe(first);
  });

  it('is shown for exactly EMOTE_SHOW_MS', () => {
    const e = { id: 'taunt', n: 1, at: 1000 } as const;
    expect(isShown(e, 1000)).toBe(true);
    expect(isShown(e, 1000 + EMOTE_SHOW_MS - 1)).toBe(true);
    expect(isShown(e, 1000 + EMOTE_SHOW_MS)).toBe(false);
    expect(isShown(undefined, 0)).toBe(false);
  });

  it('accepts any seat key', () => {
    expect(receiveEmote({}, 99, 'nice', 1, 0)[99]?.id).toBe('nice');
  });
});
