import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../../../shared/protocol';
import { nextSettings } from './settings';

describe('nextSettings', () => {
  it('turning quick on from the default time preselects 20 s', () => {
    expect(nextSettings(DEFAULT_ROOM_SETTINGS, { quick: true })).toEqual({ turnSeconds: 20, quick: true, autoRoll: false, pace: 'vua' });
  });

  it('turning quick on keeps another chosen time', () => {
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, turnSeconds: 15 }, { quick: true }).turnSeconds).toBe(15);
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, turnSeconds: 60 }, { quick: true }).turnSeconds).toBe(60);
  });

  it('turning quick off keeps the time', () => {
    expect(nextSettings({ turnSeconds: 20, quick: true, autoRoll: false, pace: 'vua' }, { quick: false })).toEqual({
      turnSeconds: 20,
      quick: false,
      autoRoll: false,
      pace: 'vua',
    });
  });

  it('choosing the time together with quick wins over the preselect', () => {
    expect(nextSettings(DEFAULT_ROOM_SETTINGS, { quick: true, turnSeconds: 30 }).turnSeconds).toBe(30);
  });

  it('changing the time, auto-roll or the pace leaves the rest alone', () => {
    const current = { turnSeconds: 20 as const, quick: true, autoRoll: false, pace: 'vua' as const };
    expect(nextSettings(current, { turnSeconds: 10 })).toEqual({ turnSeconds: 10, quick: true, autoRoll: false, pace: 'vua' });
    expect(nextSettings(current, { autoRoll: true })).toEqual({ turnSeconds: 20, quick: true, autoRoll: true, pace: 'vua' });
    expect(nextSettings(current, { pace: 'thu-thai' })).toEqual({ turnSeconds: 20, quick: true, autoRoll: false, pace: 'thu-thai' });
  });

  it('turning quick on keeps the chosen pace', () => {
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, pace: 'nhanh' }, { quick: true }).pace).toBe('nhanh');
  });

  it('never changes the time when quick stays on', () => {
    const on = { turnSeconds: 30 as const, quick: true, autoRoll: false, pace: 'vua' as const };
    expect(nextSettings(on, { quick: true }).turnSeconds).toBe(30);
  });
});
