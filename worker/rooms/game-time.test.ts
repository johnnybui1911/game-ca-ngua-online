import { describe, expect, it } from 'vitest';
import { createGame } from '../../shared/game/engine';
import { POS_GATE, type Color, type RuleVariant } from '../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS, GAME_MINUTES_OPTIONS } from '../../shared/protocol';
import { timingsFor } from './constants';
import { drawFrom } from './dice-shaping';
import {
  finishExpiredGame, nextWake, parseRoomSettings, reconcileConnections, resumeGame, settingsOf,
  startGameClock, timingsOf, toSnapshot, type RoomState,
} from './room-state';
import type { Env } from '../env';

const base = timingsFor({} as Env);
const connected = new Set(['host']);

function room(variant: RuleVariant = 'classic'): RoomState {
  return {
    code: 'ABC234', name: 'Test', visibility: 'private', hostId: 'host', status: 'playing',
    seats: [
      { color: 0, occupant: { kind: 'human', user: { id: 'host', displayName: 'Host' } } },
      { color: 1, occupant: { kind: 'cpu', name: 'Máy 1' } },
      { color: 2, occupant: { kind: 'cpu', name: 'Máy 2' } },
    ],
    game: createGame([0, 1, 2], variant), seq: 1, dueAt: 20_000, actionDueAt: 20_000,
    noHumanConnectedSince: null, disconnectedSince: {}, gameDeadline: 10_000,
    settings: { ...DEFAULT_ROOM_SETTINGS },
  };
}

function setHome(r: RoomState, color: Color, steps: number[]): void {
  r.game!.horses[color] = [...steps.map((step) => POS_GATE + step), ...Array(4 - steps.length).fill(-1)];
}

describe('whole-game time', () => {
  it('accepts only the ordered duration choices and keeps old messages valid', () => {
    expect(GAME_MINUTES_OPTIONS).toEqual([0, 20, 30, 60]);
    for (const gameMinutes of GAME_MINUTES_OPTIONS) {
      expect(parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, gameMinutes })?.gameMinutes).toBe(gameMinutes);
    }
    for (const gameMinutes of [null, 10, -1, '60', 60.5]) {
      expect(parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, gameMinutes })).toBeNull();
    }
    const { gameMinutes: _ignored, ...old } = DEFAULT_ROOM_SETTINGS;
    expect(parseRoomSettings(old)?.gameMinutes).toBeUndefined();
  });

  it('defaults new rooms to 60 minutes and old rooms to unlimited, including stored settings without the field', () => {
    const r = room();
    startGameClock(r, 1_000);
    expect(r.gameDeadline).toBe(3_601_000);
    startGameClock(r, 1_000, 2_000);
    expect(r.gameDeadline).toBe(3_000);
    delete r.settings;
    startGameClock(r, 1_000);
    expect(settingsOf(r).gameMinutes).toBe(0);
    expect(r.gameDeadline).toBeNull();
    r.settings = { turnSeconds: 30, quick: false, autoRoll: false };
    expect(settingsOf(r).gameMinutes).toBe(0);
    r.settings.gameMinutes = 0;
    startGameClock(r, 1_000, 2_000);
    expect(nextWake(r, base)).toBe(20_000);
    expect(finishExpiredGame(r, 99_000)).toBeNull();
    delete r.gameDeadline;
    expect(finishExpiredGame(r, 99_000)).toBeNull();
  });

  it.each(['classic', 'quick'] as const)('expires %s before a due turn action', (variant) => {
    const r = room(variant);
    setHome(r, 1, [1]);
    expect(nextWake(r, base)).toBe(10_000);
    expect(finishExpiredGame(r, 9_999)).toBeNull();
    expect(finishExpiredGame(r, 20_000)).toEqual([{ type: 'won', color: 1 }]);
    expect(r.status).toBe('finished');
    expect(r.game).toMatchObject({ phase: 'finished', winner: 1, timeWinReason: 'home-count', dice: null, legalHorses: [] });
    expect(r.dueAt).toBeNull();
    expect(r.actionDueAt).toBeNull();
    expect(r.gameDeadline).toBeNull();
    expect(finishExpiredGame(r, 20_001)).toBeNull();
  });

  it('compares home count before steps or kicks', () => {
    const r = room();
    setHome(r, 0, [1, 2]);
    setHome(r, 1, [6]);
    r.game!.kicks![1] = 10;
    finishExpiredGame(r, 10_000);
    expect(r.game).toMatchObject({ winner: 0, timeWinReason: 'home-count' });
  });

  it('compares total home steps among players tied on count', () => {
    const r = room();
    setHome(r, 0, [6, 5]);
    setHome(r, 1, [3, 2]);
    setHome(r, 2, [6]);
    r.game!.kicks![1] = 10;
    finishExpiredGame(r, 10_000);
    expect(r.game).toMatchObject({ winner: 0, timeWinReason: 'home-steps' });
  });

  it('compares kicks among players still tied, treating absent kick data as zero', () => {
    const r = room();
    setHome(r, 0, [3]);
    setHome(r, 1, [3]);
    r.game!.kicks![1] = 2;
    finishExpiredGame(r, 10_000);
    expect(r.game).toMatchObject({ winner: 1, timeWinReason: 'kicks' });
    const legacy = room();
    delete legacy.game!.kicks;
    finishExpiredGame(legacy, 10_000, (colors) => colors[2]!);
    expect(legacy.game).toMatchObject({ winner: 2, timeWinReason: 'random' });
  });

  it('draws only among tied leaders, with unbiased byte rejection', () => {
    const r = room();
    setHome(r, 0, [1]);
    setHome(r, 1, [1]);
    finishExpiredGame(r, 10_000, (colors) => {
      expect(colors).toEqual([0, 1]);
      return colors[1]!;
    });
    expect(r.game).toMatchObject({ winner: 1, timeWinReason: 'random' });
    const feed = [255, 0, 1, 2, 253, 254];
    let i = 0;
    const fill = (bytes: Uint8Array) => { bytes[0] = feed[i++]!; return bytes; };
    expect(Array.from({ length: 5 }, () => drawFrom([0, 1, 2] as const, fill))).toEqual([0, 1, 2, 1, 2]);
  });

  it('freezes the clock during host pause and exposes the frozen remainder', () => {
    const r = room();
    r.pausedAt = 4_000;
    expect(nextWake(r, base)).toBeNull();
    expect(finishExpiredGame(r, 15_000)).toBeNull();
    expect(toSnapshot(r, connected).gamePausedRemaining).toBe(6_000);
    resumeGame(r, connected, 15_000, timingsOf(r, base));
    expect(r.gameDeadline).toBe(21_000);
    expect(nextWake(r, base)).toBe(21_000);
  });

  it('freezes through total disconnection and does not double-count host pause', () => {
    const r = room();
    reconcileConnections(r, new Set(), 4_000, timingsOf(r, base));
    expect(nextWake(r, base)).toBe(604_000);
    expect(finishExpiredGame(r, 15_000)).toBeNull();
    reconcileConnections(r, connected, 15_000, timingsOf(r, base));
    expect(r.gameDeadline).toBe(21_000);
    r.pausedAt = 16_000;
    reconcileConnections(r, new Set(), 17_000, timingsOf(r, base));
    reconcileConnections(r, connected, 18_000, timingsOf(r, base));
    resumeGame(r, connected, 20_000, timingsOf(r, base));
    expect(r.gameDeadline).toBe(25_000);
  });
});
