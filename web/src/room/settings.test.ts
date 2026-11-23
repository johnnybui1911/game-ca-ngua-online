import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS } from '../../../shared/protocol';
import { nextSettings } from './settings';

describe('nextSettings', () => {
  it('turning quick on from the default time preselects 20 s', () => {
    expect(nextSettings(DEFAULT_ROOM_SETTINGS, { quick: true })).toEqual({ ...DEFAULT_ROOM_SETTINGS, turnSeconds: 20, quick: true });
  });

  it('turning quick on keeps another chosen time', () => {
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, turnSeconds: 15 }, { quick: true }).turnSeconds).toBe(15);
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, turnSeconds: 60 }, { quick: true }).turnSeconds).toBe(60);
  });

  it('turning quick off keeps the time', () => {
    const on = { ...DEFAULT_ROOM_SETTINGS, turnSeconds: 20 as const, quick: true };
    expect(nextSettings(on, { quick: false })).toEqual({ ...on, quick: false });
  });

  it('choosing the time together with quick wins over the preselect', () => {
    expect(nextSettings(DEFAULT_ROOM_SETTINGS, { quick: true, turnSeconds: 30 }).turnSeconds).toBe(30);
  });

  it('changing the time, auto-roll, the pace or the rules leaves the rest alone', () => {
    const current = { ...DEFAULT_ROOM_SETTINGS, turnSeconds: 20 as const, quick: true };
    expect(nextSettings(current, { turnSeconds: 10 })).toEqual({ ...current, turnSeconds: 10 });
    expect(nextSettings(current, { autoRoll: true })).toEqual({ ...current, autoRoll: true });
    expect(nextSettings(current, { pace: 'thu-thai' })).toEqual({ ...current, pace: 'thu-thai' });
    expect(nextSettings(current, { rules: { tripleBonusForfeit: false } })).toEqual({ ...current, rules: { tripleBonusForfeit: false } });
  });

  it('turning quick on keeps the chosen pace', () => {
    expect(nextSettings({ ...DEFAULT_ROOM_SETTINGS, pace: 'nhanh' }, { quick: true }).pace).toBe('nhanh');
  });

  it('never changes the time when quick stays on', () => {
    const on = { ...DEFAULT_ROOM_SETTINGS, quick: true };
    expect(nextSettings(on, { quick: true }).turnSeconds).toBe(30);
  });
});
