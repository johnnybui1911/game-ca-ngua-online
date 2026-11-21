import { describe, expect, it } from 'vitest';
import { applyRoll, createGame } from '../../shared/game/engine';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/protocol';
import type { Timings } from './constants';
import { generateRoomCode, isRoomCode } from './room-code';
import {
  cleanHorseNames,
  AlarmTracker,
  drawDie,
  dueDelay,
  nextCpuName,
  nextWake,
  pickHost,
  planTurn,
  playDueAction,
  reconcileConnections,
  resumeGame,
  setOccupant,
  toSnapshot,
  toSummary,
  type RoomState,
} from './room-state';

const T: Timings = { cpuDelayMs: 700, turnMs: 30_000, playingDisconnectMs: 3_000, waitingDisconnectMs: 30_000, idleCloseMs: 600_000, lobbySweepMs: 180_000 };
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
    actionDueAt: null,
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
    const r = room({ status: 'playing', game, dueAt: 9_000, disconnectedSince: { u2: 1_000 } });
    expect(nextWake(r, T)).toBe(9_000);
    r.noHumanConnectedSince = 2_000;
    r.dueAt = null;
    expect(nextWake(r, T)).toBe(602_000);
  });

  it('freezes automatic play while no human is connected, leaving only the idle close', () => {
    const game = createGame([0, 2]);
    const r = room({ status: 'playing', game, dueAt: 9_000, disconnectedSince: { u1: 1_000, u2: 1_000 }, noHumanConnectedSince: 2_000 });
    expect(nextWake(r, T)).toBe(602_000);
  });

  it('wakes a finished room when its disconnected host can be replaced, but only if someone is connected', () => {
    const r = room({ status: 'finished', game: createGame([0, 2]), disconnectedSince: { u1: 1_000 } });
    expect(nextWake(r, T)).toBe(31_000);
    r.noHumanConnectedSince = 1_000;
    expect(nextWake(r, T)).toBe(601_000);
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

describe('reconcileConnections', () => {
  const playing = (over: Partial<RoomState> = {}) =>
    room({ status: 'playing', game: createGame([0, 2]), ...over });

  it('records who is gone and since when, and who is back', () => {
    const r = room();
    reconcileConnections(r, new Set(['u1']), 100, T);
    expect(r.disconnectedSince).toEqual({ u2: 100 });
    expect(r.noHumanConnectedSince).toBeNull();
    reconcileConnections(r, new Set(), 200, T);
    expect(r.disconnectedSince).toEqual({ u1: 200, u2: 100 });
    expect(r.noHumanConnectedSince).toBe(200);
    reconcileConnections(r, new Set(['u1', 'u2']), 300, T);
    expect(r.disconnectedSince).toEqual({});
    expect(r.noHumanConnectedSince).toBeNull();
  });

  it('is idempotent', () => {
    const r = playing({ dueAt: 5_000, actionDueAt: 5_000 });
    reconcileConnections(r, new Set(['u2']), 1_000, T);
    const once = JSON.stringify(r);
    reconcileConnections(r, new Set(['u2']), 1_000, T);
    expect(JSON.stringify(r)).toBe(once);
  });

  it('shortens the deadline of a human on turn who just dropped, and restores the original on return', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    expect(r.actionDueAt).toBe(30_000);
    reconcileConnections(r, new Set(['u2']), 29_000, T);
    expect(r.dueAt).toBe(30_000);
    r.dueAt = 29_500;
    reconcileConnections(r, new Set(['u1', 'u2']), 29_400, T);
    expect(r.dueAt).toBe(30_000);
  });

  it('never extends a deadline by reconnecting, however often', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    let now = 1_000;
    for (let i = 0; i < 5; i++, now += 1_000) {
      reconcileConnections(r, new Set(['u2']), now, T);
      reconcileConnections(r, new Set(['u1', 'u2']), now + 100, T);
      expect(r.dueAt).toBe(30_000);
    }
  });

  it('freezes the turn clock while nobody is connected and resumes it with the time that was left', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    reconcileConnections(r, new Set(), 5_000, T);
    expect(nextWake(r, T)).toBe(5_000 + T.idleCloseMs);
    // Back long after the original deadline: 25 s were left when the pause began.
    reconcileConnections(r, new Set(['u1']), 45_000, T);
    expect(r.dueAt).toBe(70_000);
    expect(r.actionDueAt).toBe(70_000);
    expect(nextWake(r, T)).toBe(70_000);
    reconcileConnections(r, new Set(['u1']), 45_000, T);
    expect(r.dueAt).toBe(70_000);
  });

  it('gives a disconnected human on turn the short takeover delay', () => {
    const r = playing();
    planTurn(r, new Set(['u2']), 10_000, T);
    expect(r.dueAt).toBe(13_000);
    expect(r.actionDueAt).toBe(40_000);
  });

  it('hands the host role to a connected human once the host has been away past the grace', () => {
    const r = room({ status: 'finished', game: createGame([0, 2]) });
    reconcileConnections(r, new Set(['u2']), 1_000, T);
    expect(r.hostId).toBe('u1');
    reconcileConnections(r, new Set(['u2']), 1_000 + T.waitingDisconnectMs - 1, T);
    expect(r.hostId).toBe('u1');
    reconcileConnections(r, new Set(['u2']), 1_000 + T.waitingDisconnectMs, T);
    expect(r.hostId).toBe('u2');
  });

  it('keeps the host during a game and when nobody else is connected', () => {
    const r = playing();
    reconcileConnections(r, new Set(['u2']), 0, T);
    reconcileConnections(r, new Set(['u2']), 999_999, T);
    expect(r.hostId).toBe('u1');
    const lonely = room({ status: 'finished', game: createGame([0, 2]) });
    reconcileConnections(lonely, new Set(), 0, T);
    reconcileConnections(lonely, new Set(), 999_999, T);
    expect(lonely.hostId).toBe('u1');
  });

  it('moves the host at once when the host loses the seat', () => {
    const r = room();
    r.seats[0]!.occupant = null;
    reconcileConnections(r, new Set(['u2']), 0, T);
    expect(r.hostId).toBe('u2');
  });
});

describe('host pause', () => {
  const playing = (over: Partial<RoomState> = {}) =>
    room({ status: 'playing', game: createGame([0, 2]), ...over });

  it('stops automatic play and the visible countdown while paused', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    r.pausedAt = 5_000;
    expect(nextWake(r, T)).toBeNull();
    const snap = toSnapshot(r, new Set(['u1', 'u2']));
    expect(snap.paused).toBe(true);
    expect(snap.turnDeadline).toBeNull();
  });

  it('resumes with the time the action had left when the pause began', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    r.pausedAt = 5_000;
    resumeGame(r, new Set(['u1', 'u2']), 65_000, T);
    expect(r.pausedAt).toBeNull();
    expect(r.dueAt).toBe(90_000);
    expect(r.actionDueAt).toBe(90_000);
    expect(nextWake(r, T)).toBe(90_000);
  });

  it('does not also count a stretch with nobody connected inside the pause', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    r.pausedAt = 5_000;
    reconcileConnections(r, new Set(), 10_000, T);
    reconcileConnections(r, new Set(['u1', 'u2']), 20_000, T);
    expect(r.dueAt).toBe(30_000);
    resumeGame(r, new Set(['u1', 'u2']), 25_000, T);
    expect(r.dueAt).toBe(50_000);
  });

  it('gives a human on turn who is gone at resume only the short takeover delay', () => {
    const r = playing();
    planTurn(r, new Set(['u1', 'u2']), 0, T);
    r.pausedAt = 5_000;
    resumeGame(r, new Set(['u2']), 60_000, T);
    expect(r.dueAt).toBe(63_000);
    expect(r.actionDueAt).toBe(85_000);
  });

  it('hands the host role over when the host stays away through a pause', () => {
    const r = playing({ pausedAt: 0 });
    reconcileConnections(r, new Set(['u2']), 1_000, T);
    expect(nextWake(r, T)).toBe(1_000 + T.waitingDisconnectMs);
    reconcileConnections(r, new Set(['u2']), 1_000 + T.waitingDisconnectMs, T);
    expect(r.hostId).toBe('u2');
  });
});

describe('horse names', () => {
  it('cleans four names and keeps empty ones as the default', () => {
    expect(cleanHorseNames(['  Xích  Thố ', '', 'a\u200Bb', '🐴'])).toEqual(['Xích Thố', '', 'ab', '🐴']);
  });

  it('rejects a wrong shape or a name over the limit', () => {
    expect(cleanHorseNames(['a', 'b', 'c'])).toBeNull();
    expect(cleanHorseNames(['a', 'b', 'c', 1])).toBeNull();
    expect(cleanHorseNames('abcd')).toBeNull();
    expect(cleanHorseNames(['x'.repeat(13), '', '', ''])).toBeNull();
    expect(cleanHorseNames(['x'.repeat(12), '', '', ''])).not.toBeNull();
  });

  it('drops the names when the seat changes hands and shows defaults in the snapshot', () => {
    const r = room();
    const seat = r.seats[0]!;
    seat.horseNames = ['A', 'B', 'C', 'D'];
    expect(toSnapshot(r, new Set()).seats[0]?.horseNames).toEqual(['A', 'B', 'C', 'D']);
    setOccupant(seat, { kind: 'cpu', name: 'Máy 1' });
    expect(toSnapshot(r, new Set()).seats[0]?.horseNames).toEqual(['', '', '', '']);
  });
});

describe('automated turn in one step', () => {
  const cpuSeats: RoomState['seats'] = [
    { color: 0, occupant: { kind: 'cpu', name: 'Máy 1' } },
    { color: 2, occupant: { kind: 'cpu', name: 'Máy 2' } },
  ];
  const dueRoom = (seats = cpuSeats) => room({ status: 'playing', seats, game: createGame([0, 2]), dueAt: 1_000 });
  const types = (events: { type: string }[]) => events.map((e) => e.type);

  it('rolls and moves for a CPU in one step and waits one extra pause for the next action', () => {
    const r = dueRoom();
    const played = playDueAction(r, new Set(['u1']), 1_000, T, () => 6)!;
    expect(types(played.events).slice(0, 2)).toEqual(['rolled', 'moved']);
    expect(played.finished).toBe(false);
    expect(r.game!.phase).toBe('roll');
    expect(r.game!.horses[0]!.filter((p) => p >= 0)).toHaveLength(1);
    // A six earns another roll for the same colour, still a CPU: now + two pauses.
    expect(r.game!.turn).toBe(0);
    expect(r.dueAt).toBe(1_000 + 2 * T.cpuDelayMs);
  });

  it('passes the turn after a combined step that gives no extra roll', () => {
    const r = dueRoom();
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    const played = playDueAction(r, new Set(['u1']), 1_000, T, () => 2)!;
    expect(types(played.events)).toEqual(['rolled', 'moved', 'turn']);
    expect(r.game!.turn).toBe(2);
    expect(r.game!.phase).toBe('roll');
    expect(r.dueAt).toBe(1_000 + 2 * T.cpuDelayMs);
  });

  it('gives a connected human who plays next their full clock after a combined step', () => {
    const r = dueRoom([cpuSeats[0]!, { color: 2, occupant: { kind: 'human', user: ann } }]);
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    playDueAction(r, new Set(['u1']), 1_000, T, () => 2);
    expect(r.game!.turn).toBe(2);
    expect(r.dueAt).toBe(1_000 + T.turnMs);
    expect(r.actionDueAt).toBe(1_000 + T.turnMs);
  });

  it('only rolls when no move is legal', () => {
    const r = dueRoom();
    const played = playDueAction(r, new Set(['u1']), 1_000, T, () => 3)!;
    expect(types(played.events)).toEqual(['rolled', 'turn']);
    expect(r.dueAt).toBe(1_000 + T.cpuDelayMs);
  });

  it('plays a due move phase on its own', () => {
    const r = dueRoom();
    r.game = applyRoll(r.game!, 6).state;
    const played = playDueAction(r, new Set(), 1_000, T)!;
    expect(types(played.events)[0]).toBe('moved');
    expect(r.dueAt).toBe(1_000 + T.cpuDelayMs);
  });

  it('only rolls for a connected human whose clock ran out', () => {
    const r = dueRoom([{ color: 0, occupant: { kind: 'human', user: ann } }, cpuSeats[1]!]);
    const played = playDueAction(r, new Set(['u1']), 1_000, T, () => 6)!;
    expect(types(played.events)).toEqual(['rolled']);
    expect(r.game!.phase).toBe('move');
    expect(r.dueAt).toBe(1_000 + T.turnMs);
  });

  it('rolls and moves for a human who is not connected', () => {
    const r = dueRoom([{ color: 0, occupant: { kind: 'human', user: ann } }, cpuSeats[1]!]);
    const played = playDueAction(r, new Set(), 1_000, T, () => 6)!;
    expect(types(played.events).slice(0, 2)).toEqual(['rolled', 'moved']);
  });

  it('ends the match from the combined step and clears the clocks', () => {
    const r = dueRoom();
    const g = r.game!;
    const horses = g.horses.map((row) => row.slice());
    horses[0] = [59, 60, 61, 55];
    r.game = { ...g, horses };
    r.actionDueAt = 5;
    const played = playDueAction(r, new Set(['u1']), 1_000, T, () => 3)!;
    expect(played.finished).toBe(true);
    expect(types(played.events)).toEqual(['rolled', 'moved', 'won']);
    expect(r.status).toBe('finished');
    expect(r.dueAt).toBeNull();
    expect(r.actionDueAt).toBeNull();
  });
});

describe('AlarmTracker', () => {
  it('arms once per new wake, trusts nothing after construction and nothing armed after firing', () => {
    const t = new AlarmTracker();
    // A fresh instance may find any alarm armed.
    expect(t.plan(5)).toBe('set');
    expect(t.plan(null)).toBe('delete');
    t.armed(5);
    expect(t.plan(5)).toBe('none');
    expect(t.plan(9)).toBe('set');
    expect(t.plan(null)).toBe('delete');
    // The firing consumed it: the same wake must be armed again.
    t.fired();
    expect(t.plan(5)).toBe('set');
    expect(t.plan(null)).toBe('none');
    t.armed(null);
    expect(t.plan(null)).toBe('none');
    expect(t.plan(9)).toBe('set');
  });

  it('keeps the previous value when the storage call is not recorded', () => {
    const t = new AlarmTracker();
    t.armed(5);
    // plan() alone (a storage call that threw) changes nothing.
    expect(t.plan(9)).toBe('set');
    expect(t.plan(9)).toBe('set');
  });
});
