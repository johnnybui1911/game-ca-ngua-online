import { describe, expect, it } from 'vitest';
import { createGame } from '../../shared/game/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/protocol';
import type { Timings } from './constants';
import { generateRoomCode, isRoomCode } from './room-code';
import {
  drawDie,
  dueDelay,
  nextCpuName,
  nextWake,
  pickHost,
  toSnapshot,
  toSummary,
  type RoomState,
} from './room-state';

const T: Timings = { cpuDelayMs: 700, turnMs: 30_000, playingDisconnectMs: 3_000, waitingDisconnectMs: 30_000, idleCloseMs: 600_000 };
const ann = { id: 'u1', displayName: 'An' };
const binh = { id: 'u2', displayName: 'Bình' };

function room(over: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABC234',
    name: 'Phòng thử',
    visibility: 'public',
    hostId: 'u1',
    status: 'waiting',
    seats: [
      { color: 0, occupant: { kind: 'human', user: ann } },
      { color: 2, occupant: { kind: 'human', user: binh } },
    ],
    game: null,
    seq: 3,
    dueAt: null,
    disconnectedSince: {},
    noHumanConnectedSince: null,
    ...over,
  };
}

describe('drawDie', () => {
  it('rejects biased bytes and maps the rest uniformly onto 1..6', () => {
    const feed = [255, 252, 253, 0, 1, 2, 3, 4, 5, 251];
    let i = 0;
    const fill = (b: Uint8Array) => {
      b[0] = feed[i++] ?? 0;
      return b;
    };
    const got = Array.from({ length: 7 }, () => drawDie(fill));
    expect(got).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });

  it('is roughly uniform with the real RNG', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let n = 0; n < 6000; n++) counts[drawDie() - 1]!++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
});

describe('room codes', () => {
  it('generates valid codes from the alphabet', () => {
    for (let n = 0; n < 50; n++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect([...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(isRoomCode(code)).toBe(true);
    }
    expect(isRoomCode('abc234')).toBe(false);
    expect(isRoomCode('ABC23')).toBe(false);
  });
});

describe('seats and host', () => {
  it('names CPUs with the smallest free number', () => {
    const r = room();
    r.seats.push({ color: 1, occupant: { kind: 'cpu', name: 'Máy 1' } }, { color: 3, occupant: { kind: 'cpu', name: 'Máy 3' } });
    expect(nextCpuName(r)).toBe('Máy 2');
  });

  it('hands the host role to the earliest-seated human', () => {
    const r = room();
    r.seats[0]!.occupant = null;
    expect(pickHost(r)).toBe('u2');
    r.seats[1]!.occupant = null;
    expect(pickHost(r)).toBeNull();
  });

  it('summarises seats taken and host name', () => {
    expect(toSummary(room())).toEqual({
      code: 'ABC234',
      name: 'Phòng thử',
      hostName: 'An',
      status: 'waiting',
      seatsTaken: 2,
      seatsTotal: 2,
    });
  });
});

describe('scheduler', () => {
  it('has no wake time for an idle room with everyone connected', () => {
    expect(nextWake(room(), T)).toBeNull();
  });

  it('takes the earliest of seat expiry and idle close while waiting', () => {
    const r = room({ disconnectedSince: { u1: 1_000, u2: 5_000 }, noHumanConnectedSince: 1_000 });
    expect(nextWake(r, T)).toBe(31_000);
  });

  it('ignores seat expiry while playing but keeps the action deadline and idle close', () => {
    const game = createGame([0, 2]);
    const r = room({ status: 'playing', game, dueAt: 9_000, disconnectedSince: { u1: 1_000 }, noHumanConnectedSince: 2_000 });
    expect(nextWake(r, T)).toBe(9_000);
    r.dueAt = null;
    expect(nextWake(r, T)).toBe(602_000);
  });

  it('paces CPU, connected human and disconnected human differently', () => {
    const game = createGame([0, 2]);
    const r = room({ status: 'playing', game });
    expect(dueDelay(r, new Set(['u1']), T)).toBe(30_000);
    expect(dueDelay(r, new Set(), T)).toBe(3_000);
    r.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    expect(dueDelay(r, new Set(), T)).toBe(700);
  });
});

describe('snapshot', () => {
  it('derives connection state and only exposes the deadline for a connected human on turn', () => {
    const game = createGame([0, 2]);
    const r = room({ status: 'playing', game, dueAt: 12_345 });
    expect(toSnapshot(r, new Set(['u1'])).turnDeadline).toBe(12_345);
    expect(toSnapshot(r, new Set(['u2'])).turnDeadline).toBeNull();
    const snap = toSnapshot(r, new Set(['u2']));
    expect(snap.seats[0]?.occupant).toEqual({ kind: 'human', user: ann, connected: false });
    expect(snap.seats[1]?.occupant).toEqual({ kind: 'human', user: binh, connected: true });
    expect(snap.seq).toBe(3);
  });
});
