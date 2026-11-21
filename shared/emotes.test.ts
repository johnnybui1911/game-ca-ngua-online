import { describe, expect, it } from 'vitest';
import { EMOTES, EMOTE_IDS, emoteLabel, isEmoteId } from './emotes';

describe('emote catalogue', () => {
  it('has unique, lowercase, non-empty ids', () => {
    expect(new Set(EMOTE_IDS).size).toBe(EMOTES.length);
    for (const id of EMOTE_IDS) expect(id).toMatch(/^[a-z]+$/);
  });

  it('has an emoji for every entry and short text', () => {
    for (const e of EMOTES) {
      expect(e.emoji.length).toBeGreaterThan(0);
      expect(e.text.length).toBeLessThanOrEqual(20);
    }
  });

  it('accepts every catalogue id', () => {
    for (const id of EMOTE_IDS) expect(isEmoteId(id)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const v of ['', 'TAUNT', '__proto__', '😈', 1, null, undefined, {}]) expect(isEmoteId(v)).toBe(false);
  });

  it('labels with emoji and text, trimmed when text is empty', () => {
    expect(emoteLabel('taunt')).toBe('😈 Đá nè!');
    expect(emoteLabel('laugh')).toBe('😂');
  });
});
