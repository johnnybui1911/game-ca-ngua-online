import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, createGame } from '../../shared/game/engine';
import { PACES, PACE_NAMES, animationSeconds, pauseSeconds, type PaceName } from '../../shared/game/pace';
import type { DiceValue, GameEvent } from '../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TURN_SECONDS_OPTIONS, type RoomSettings } from '../../shared/protocol';
import type { Env } from '../env';
import { IDLE_AUTOPLAY_AFTER, timingsFor, type Timings } from './constants';
import { generateRoomCode, isRoomCode } from './room-code';
import {
  cleanHorseNames,
  AlarmTracker,
  animationMs,
  drawDie,
  dueDelay,
  levelForOccupant,
  levelOf,
  parseCpuLevel,
  parseRoomSettings,
  clearMisses,
  isAutopilot,
  paceMs,
  settingsOf,
  timingsOf,
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

/** Fixed pauses, as in fast mode: nothing waits for an animation. */
const BASE: Timings = {
  paced: false,
  cpuDelayMs: 700,
  turnUnitMs: 1_000,
  autoRollMs: 1_500,
  quickSegmentMs: 400,
  playingDisconnectMs: 3_000,
  waitingDisconnectMs: 30_000,
  idleCloseMs: 600_000,
  lobbySweepMs: 180_000,
};
const T = timingsOf({} as RoomState, BASE);
/** Events of a commit with this many animated segments: a roll, then moves. */
const commitOf = (segments: number): GameEvent[] =>
  (
    [
      { type: 'rolled', color: 0, dice: 3, legalHorses: [0] },
      { type: 'moved', color: 0, horse: 0, from: 0, to: 3, kicked: null },
      { type: 'moved', color: 0, horse: 0, from: 3, to: 6, kicked: null },
    ] satisfies GameEvent[]
  ).slice(0, segments);
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
    const r = room({ status: 'playing', game, dueAt: 12_345, actionDueAt: 12_345 });
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

  it('takes over for a disconnected human who plays next after the longer of the pause and the grace, leaving their own clock alone', () => {
    const r = dueRoom([cpuSeats[0]!, { color: 2, occupant: { kind: 'human', user: ann } }]);
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    playDueAction(r, new Set(), 1_000, T, () => 2);
    expect(r.dueAt).toBe(1_000 + Math.max(2 * T.cpuDelayMs, T.playingDisconnectMs));
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

describe('cpu level', () => {
  it('reads an absent or unrecognised stored value as Thường', () => {
    expect(levelOf(room())).toBe('normal');
    expect(levelOf(room({ cpuLevel: 'easy' }))).toBe('easy');
    expect(levelOf(room({ cpuLevel: 'hard' }))).toBe('hard');
    expect(levelOf(room({ cpuLevel: 'normal' }))).toBe('normal');
    for (const garbage of ['ultra', 7, null]) {
      expect(levelOf(room({ cpuLevel: garbage as never }))).toBe('normal');
    }
  });

  it('plays a CPU seat at the room level and a seated human at Thường', () => {
    const r = room({ cpuLevel: 'hard' });
    expect(levelForOccupant(r, { kind: 'cpu', name: 'Máy 1' })).toBe('hard');
    expect(levelForOccupant(r, { kind: 'human', user: ann })).toBe('normal');
    expect(levelForOccupant(r, null)).toBe('normal');
  });

  it('parses only the three known levels', () => {
    expect(parseCpuLevel('easy')).toBe('easy');
    expect(parseCpuLevel('normal')).toBe('normal');
    expect(parseCpuLevel('hard')).toBe('hard');
    for (const bad of ['ultra', 'Hard', '', 1, null, undefined, {}]) expect(parseCpuLevel(bad)).toBeNull();
  });

  it('shows in the snapshot, and a room stored without the field still snapshots as Thường', () => {
    expect(toSnapshot(room(), new Set()).cpuLevel).toBe('normal');
    expect(toSnapshot(room({ cpuLevel: 'hard' }), new Set()).cpuLevel).toBe('hard');
    const stored = JSON.parse(JSON.stringify(room())) as RoomState;
    expect('cpuLevel' in stored).toBe(false);
    expect(toSnapshot(stored, new Set()).cpuLevel).toBe('normal');
  });
});

describe('room settings', () => {
  const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ ...DEFAULT_ROOM_SETTINGS, ...over });
  const playing = (st?: RoomSettings, over: Partial<RoomState> = {}) =>
    room({ status: 'playing', game: createGame([0, 2]), settings: st, ...over });
  const both = new Set(['u1', 'u2']);

  it('reads a room without settings as the defaults', () => {
    expect(settingsOf(room())).toEqual({ turnSeconds: 30, quick: false, autoRoll: false, pace: 'vua' });
    expect(timingsOf(room(), BASE).turnMs).toBe(30_000);
    expect(paceMs(room(), BASE)).toBe(700);
  });

  it('derives the turn time from every allowed choice', () => {
    for (const turnSeconds of TURN_SECONDS_OPTIONS) {
      expect(timingsOf(room({ settings: settings({ turnSeconds }) }), BASE).turnMs).toBe(turnSeconds * 1_000);
    }
    expect(timingsOf(room({ settings: settings({ turnSeconds: 10 }) }), { ...BASE, turnUnitMs: 50 }).turnMs).toBe(500);
  });

  it('accepts exactly the allowed settings and nothing else', () => {
    expect(parseRoomSettings({ turnSeconds: 20, quick: true, autoRoll: false, pace: 'vua' })).toEqual({
      turnSeconds: 20,
      quick: true,
      autoRoll: false,
      pace: 'vua',
    });
    for (const turnSeconds of TURN_SECONDS_OPTIONS) {
      expect(parseRoomSettings({ turnSeconds, quick: false, autoRoll: true, pace: 'vua' })?.turnSeconds).toBe(turnSeconds);
    }
    for (const pace of PACE_NAMES) {
      expect(parseRoomSettings({ turnSeconds: 30, quick: false, autoRoll: false, pace })?.pace).toBe(pace);
    }
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      { turnSeconds: 0, quick: false, autoRoll: false, pace: 'vua' },
      { turnSeconds: 31, quick: false, autoRoll: false, pace: 'vua' },
      { turnSeconds: '30', quick: false, autoRoll: false, pace: 'vua' },
      { turnSeconds: 30.5, quick: false, autoRoll: false, pace: 'vua' },
      { turnSeconds: 30, quick: 'true', autoRoll: false, pace: 'vua' },
      { turnSeconds: 30, quick: 1, autoRoll: false, pace: 'vua' },
      { turnSeconds: 30, quick: false, autoRoll: undefined, pace: 'vua' },
      { turnSeconds: 30, quick: false, pace: 'vua' },
      { turnSeconds: 30, quick: false, autoRoll: false },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: 'vua', extra: 1 },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: 'current' },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: 'Vừa' },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: 1 },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: null },
      { turnSeconds: 30, quick: false, autoRoll: false, pace: 'toString' },
    ];
    for (const b of bad) expect(parseRoomSettings(b)).toBeNull();
  });

  it('plans the action deadline from the room turn time and keeps 30 s without settings', () => {
    const a = playing(settings({ turnSeconds: 10 }));
    planTurn(a, both, 1_000, timingsOf(a, BASE));
    expect(a.actionDueAt).toBe(11_000);
    expect(a.dueAt).toBe(11_000);
    const b = playing();
    planTurn(b, both, 1_000, timingsOf(b, BASE));
    expect(b.actionDueAt).toBe(31_000);
    expect(b.dueAt).toBe(31_000);
    const fast = timingsOf(a, { ...BASE, turnUnitMs: 50 });
    planTurn(a, both, 0, fast);
    expect(a.actionDueAt).toBe(500);
  });

  it('keeps the original deadline across a reconnect with settings present', () => {
    const r = playing(settings({ turnSeconds: 15 }));
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t);
    reconcileConnections(r, new Set(['u2']), 4_000, t);
    expect(r.dueAt).toBe(7_000);
    reconcileConnections(r, both, 5_000, t);
    expect(r.dueAt).toBe(15_000);
  });

  it('pause keeps the time left, measured with the room turn time', () => {
    const r = playing(settings({ turnSeconds: 10 }));
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t);
    r.pausedAt = 4_000;
    resumeGame(r, both, 100_000, t);
    expect(r.dueAt).toBe(106_000);
    expect(r.actionDueAt).toBe(106_000);
  });

  it('snapshot publishes the settings, the seat autopilot flag and the action deadline', () => {
    const r = playing(settings({ turnSeconds: 20, quick: true }), { dueAt: 1_700, actionDueAt: 20_000 });
    r.seats[1]!.misses = IDLE_AUTOPLAY_AFTER;
    const snap = toSnapshot(r, both);
    expect(snap.settings).toEqual({ turnSeconds: 20, quick: true, autoRoll: false, pace: 'vua' });
    expect(snap.seats.map((s) => s.auto)).toEqual([false, true]);
    expect(snap.turnDeadline).toBe(20_000);
    r.actionDueAt = null;
    expect(toSnapshot(r, both).turnDeadline).toBeNull();
    expect(toSnapshot(room(), both).settings).toEqual(DEFAULT_ROOM_SETTINGS);
  });
});

describe('missed turns and autopilot', () => {
  const both = new Set(['u1', 'u2']);
  const dice = (v: DiceValue) => () => v;
  const playing = (over: Partial<RoomState> = {}) => room({ status: 'playing', game: createGame([0, 2]), ...over });

  /** The turn runs out for the colour on turn, then the server plays it. */
  function timeOut(r: RoomState, connected: ReadonlySet<string>, roll: DiceValue = 2) {
    const t = timingsOf(r, BASE);
    const at = r.dueAt!;
    return playDueAction(r, connected, at, t, dice(roll));
  }

  it('counts a missed turn only for a connected human whose own deadline passed', () => {
    const r = playing();
    planTurn(r, both, 0, T);
    timeOut(r, both);
    expect(r.seats[0]!.misses).toBe(1);
    expect(isAutopilot(r.seats[0])).toBe(false);
  });

  it('puts the seat on autopilot after two misses and schedules it at CPU pace with no countdown', () => {
    const r = playing();
    planTurn(r, both, 0, T);
    timeOut(r, both); // roll 2 with every horse in the stable: the turn passes to the other colour
    expect(r.game!.turn).toBe(2);
    // Give the first colour the turn again with a fresh clock.
    r.game = { ...r.game!, turn: 0, phase: 'roll', legalHorses: [] };
    planTurn(r, both, 100_000, T);
    timeOut(r, both);
    expect(r.seats[0]!.misses).toBe(IDLE_AUTOPLAY_AFTER);
    expect(toSnapshot(r, both).seats[0]!.auto).toBe(true);
    r.game = { ...r.game!, turn: 0, phase: 'roll', legalHorses: [] };
    planTurn(r, both, 200_000, T);
    expect(r.dueAt).toBe(200_000 + T.cpuDelayMs);
    expect(r.actionDueAt).toBeNull();
    expect(toSnapshot(r, both).turnDeadline).toBeNull();
  });

  it('never counts autopilot actions, CPU actions or a takeover for a disconnected human', () => {
    const r = playing();
    r.seats[0]!.misses = IDLE_AUTOPLAY_AFTER;
    planTurn(r, both, 0, T);
    timeOut(r, both);
    expect(r.seats[0]!.misses).toBe(IDLE_AUTOPLAY_AFTER);

    const takeover = playing();
    planTurn(takeover, new Set(['u2']), 0, T);
    expect(takeover.dueAt).toBe(3_000);
    timeOut(takeover, new Set(['u2']));
    expect(takeover.seats[0]!.misses).toBeUndefined();

    const cpu = playing();
    cpu.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    planTurn(cpu, both, 0, T);
    timeOut(cpu, both);
    expect(cpu.seats[0]!.misses).toBeUndefined();
  });

  it('ends autopilot when misses are cleared, and the clock restarts for the player', () => {
    const r = playing();
    r.seats[0]!.misses = 3;
    clearMisses(r);
    expect(isAutopilot(r.seats[0])).toBe(false);
    planTurn(r, both, 0, T);
    expect(r.actionDueAt).toBe(30_000);
  });

  it('does not treat a CPU seat or an emptied seat as autopilot', () => {
    const r = playing();
    r.seats[0]!.misses = 5;
    setOccupant(r.seats[0]!, { kind: 'cpu', name: 'Máy 1' });
    expect(isAutopilot(r.seats[0])).toBe(false);
    expect(r.seats[0]!.misses).toBeUndefined();
  });

  it('a room stored without settings or misses loads and plays at the old pace', () => {
    const stored = JSON.parse(JSON.stringify(playing())) as RoomState;
    expect(stored.settings).toBeUndefined();
    planTurn(stored, both, 0, timingsOf(stored, BASE));
    expect(stored.dueAt).toBe(30_000);
    const played = timeOut(stored, both)!;
    expect(played.events.map((e) => e.type)).toEqual(['rolled', 'turn']);
    expect(stored.game!.variant ?? 'classic').toBe('classic');
    expect(stored.seats[0]!.misses).toBe(1);
  });
});

describe('quick match pace and auto-roll', () => {
  const both = new Set(['u1', 'u2']);
  const quick = (over: Partial<RoomState> = {}) =>
    room({ status: 'playing', game: createGame([0, 2], 'quick'), settings: { turnSeconds: 20, quick: true, autoRoll: false }, ...over });

  it('creates a quick game with each colour starting with a horse out', () => {
    const g = createGame([0, 2], 'quick');
    expect(g.variant).toBe('quick');
    for (const color of g.colors) expect(g.horses[color]!.filter((p) => p >= 0)).toHaveLength(1);
    expect(createGame([0, 2]).horses.flat().every((p) => p < 0)).toBe(true);
  });

  it('paces CPU, autopilot and takeover by segments of the last commit', () => {
    const r = quick();
    r.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    const t = timingsOf(r, BASE);
    expect(dueDelay(r, both, t)).toBe(400);
    expect(dueDelay(r, both, t, commitOf(2))).toBe(800);
    expect(dueDelay(r, both, t, commitOf(0))).toBe(400);
    planTurn(r, both, 1_000, t, commitOf(2));
    expect(r.dueAt).toBe(1_800);

    const normal = room({ status: 'playing', game: createGame([0, 2]) });
    normal.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    expect(dueDelay(normal, both, T, commitOf(2))).toBe(1_400);
    expect(dueDelay(normal, both, T, commitOf(1))).toBe(700);

    const auto = quick();
    auto.seats[0]!.misses = IDLE_AUTOPLAY_AFTER;
    expect(dueDelay(auto, both, timingsOf(auto, BASE), commitOf(2))).toBe(800);
    expect(dueDelay(auto, new Set(['u2']), timingsOf(auto, BASE), commitOf(2))).toBe(3_000);
  });

  it('plays a forced single move in the same step in a quick match and passes segments to the clock', () => {
    const r = quick();
    r.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t);
    const played = playDueAction(r, both, r.dueAt!, t, () => 2)!;
    expect(played.events.map((e) => e.type)).toEqual(['rolled', 'moved', 'turn']);
    expect(r.game!.turn).toBe(2);
    // The next colour is a human: full turn time, no pace involved.
    expect(r.dueAt).toBe(400 + 20_000);
  });

  it('a normal room rolls for a human whose clock ran out and leaves the move to them', () => {
    const r = room({ status: 'playing', game: createGame([0, 2]) });
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    planTurn(r, both, 0, T);
    const played = playDueAction(r, both, r.actionDueAt!, T, () => 2)!;
    expect(played.events.map((e) => e.type)).toEqual(['rolled']);
    expect(r.game!.phase).toBe('move');
  });

  it('ends the match through the same path and reports it', () => {
    const r = room({ status: 'playing', game: createGame([0, 2]) });
    const h = r.game!.horses.map((row) => [...row]);
    h[0] = [61, 60, 59, 55];
    r.game = applyRoll({ ...r.game!, horses: h }, 3).state;
    expect(r.game.phase).toBe('move');
    const played = playDueAction(r, both, 0, T)!;
    expect(played.finished).toBe(true);
    expect(played.events.map((e) => e.type)).toEqual(['moved', 'won']);
    expect(r.status).toBe('finished');
    expect(r.dueAt).toBeNull();
    expect(r.actionDueAt).toBeNull();
  });

  it('auto-roll: a human on a roll phase is rolled for early, without moving the action deadline or counting a miss', () => {
    const r = room({ status: 'playing', game: createGame([0, 2]), settings: { turnSeconds: 30, quick: false, autoRoll: true } });
    const t = timingsOf(r, BASE);
    planTurn(r, both, 10_000, t);
    expect(r.dueAt).toBe(11_500);
    expect(r.actionDueAt).toBe(40_000);
    expect(toSnapshot(r, both).turnDeadline).toBe(40_000);
    playDueAction(r, both, 11_500, t, () => 2);
    expect(r.seats[0]!.misses).toBeUndefined();
  });

  it('auto-roll does not apply to a move phase and a timeout still counts', () => {
    const r = room({ status: 'playing', game: createGame([0, 2]), settings: { turnSeconds: 30, quick: false, autoRoll: true } });
    const t = timingsOf(r, BASE);
    r.game = applyRoll(r.game!, 6).state;
    expect(r.game.phase).toBe('move');
    planTurn(r, both, 0, t);
    expect(r.dueAt).toBe(30_000);
    playDueAction(r, both, 30_000, t, () => 2);
    expect(r.seats[0]!.misses).toBe(1);
  });

  it('auto-roll is re-derived on reconnect and shifted by a pause', () => {
    const r = room({ status: 'playing', game: createGame([0, 2]), settings: { turnSeconds: 30, quick: false, autoRoll: true } });
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t);
    reconcileConnections(r, new Set(['u2']), 200, t);
    expect(r.dueAt).toBe(1_500);
    reconcileConnections(r, both, 300, t);
    expect(r.dueAt).toBe(1_500);

    const p = room({ status: 'playing', game: createGame([0, 2]), settings: { turnSeconds: 30, quick: false, autoRoll: true } });
    planTurn(p, both, 0, t);
    p.pausedAt = 500;
    resumeGame(p, both, 10_500, t);
    expect(p.dueAt).toBe(11_500);
    expect(p.actionDueAt).toBe(40_000);
  });

  it('a quick match room with a human keeps pace segments out of the human turn clock', () => {
    const r = quick();
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t, commitOf(3));
    expect(r.dueAt).toBe(20_000);
    expect(r.actionDueAt).toBe(20_000);
  });

  it('applying a move by hand matches what the server plays for a forced single move', () => {
    const g = createGame([0, 2], 'quick');
    const rolled = applyRoll(g, 3);
    expect(rolled.state.legalHorses).toHaveLength(1);
    const moved = applyMove(rolled.state, rolled.state.legalHorses[0]!);
    const r = quick({ game: g });
    r.seats[0]!.occupant = { kind: 'cpu', name: 'Máy 1' };
    const t = timingsOf(r, BASE);
    planTurn(r, both, 0, t);
    playDueAction(r, both, r.dueAt!, t, () => 3);
    expect(r.game).toEqual(moved.state);
  });
});

describe('rematch', () => {
  it('keeps the settings and clears missed turns', () => {
    const r = room({ status: 'finished', game: createGame([0, 2]), settings: { turnSeconds: 15, quick: true, autoRoll: true, pace: 'thu-thai' } });
    r.seats[0]!.misses = 2;
    r.seats[1]!.misses = 1;
    clearMisses(r);
    expect(r.seats.map((s) => s.misses)).toEqual([undefined, undefined]);
    expect(settingsOf(r)).toEqual({ turnSeconds: 15, quick: true, autoRoll: true, pace: 'thu-thai' });
  });
});

describe('a room at the real pace', () => {
  const LIVE = timingsFor({} as Env);
  const both = new Set(['u1', 'u2']);
  /** `pace` undefined: settings as stored before the pace setting existed. */
  const cpuFirst = (quick: boolean, autoRoll = false, pace?: PaceName): RoomState =>
    room({
      status: 'playing',
      game: createGame([0, 2], quick ? 'quick' : 'classic'),
      settings: { turnSeconds: 30, quick, autoRoll, ...(pace ? { pace } : {}) },
      seats: [
        { color: 0, occupant: { kind: 'cpu', name: 'Máy 1' } },
        { color: 2, occupant: { kind: 'human', user: ann } },
      ],
      dueAt: 1_000,
    });
  const ms = (seconds: number) => Math.round(seconds * 1_000);

  it("waits before the next CPU action exactly as long as the board animates the commit at the room's pace, plus the beat", () => {
    for (const name of PACE_NAMES) {
      for (const quick of [false, true]) {
        const timings = quick ? PACES[name].quick : PACES[name].normal;
        const r = cpuFirst(quick, false, name);
        r.seats[1]!.occupant = { kind: 'cpu', name: 'Máy 2' };
        const t = timingsOf(r, LIVE);
        // A six brings a horse out and earns another roll: the same CPU plays next.
        const played = playDueAction(r, both, 1_000, t, () => 6)!;
        expect(played.events.map((e) => e.type).slice(0, 2)).toEqual(['rolled', 'moved']);
        expect(r.dueAt).toBe(1_000 + ms(pauseSeconds(played.events, timings)));
        expect(r.dueAt! - 1_000).toBeGreaterThanOrEqual(ms(animationSeconds(played.events, timings) + timings.beat));
      }
    }
  });

  it('pauses longer the slower the pace the host chose, and a quick match pauses less at every pace', () => {
    const batch: GameEvent[] = [
      { type: 'rolled', color: 0, dice: 6, legalHorses: [0] },
      { type: 'moved', color: 0, horse: 0, from: 0, to: 6, kicked: null },
    ];
    const pause = (pace: PaceName, quick: boolean) => paceMs(cpuFirst(quick, false, pace), LIVE, batch);
    expect(pause('nhanh', false)).toBe(1_400);
    expect(pause('vua', false)).toBeGreaterThan(pause('nhanh', false));
    expect(pause('thu-thai', false)).toBeGreaterThan(pause('vua', false));
    for (const name of PACE_NAMES) expect(pause(name, true)).toBeLessThan(pause(name, false));
  });

  it('plays a room stored before the pace setting, or with a pace it does not know, at Vừa', () => {
    const batch: GameEvent[] = [{ type: 'moved', color: 0, horse: 0, from: 0, to: 6, kicked: null }];
    const vua = cpuFirst(false, false, 'vua');
    const old = JSON.parse(JSON.stringify(cpuFirst(false))) as RoomState;
    expect(old.settings).toEqual({ turnSeconds: 30, quick: false, autoRoll: false });
    const odd = cpuFirst(false, false, 'current' as PaceName);
    for (const r of [old, odd]) {
      expect(settingsOf(r).pace).toBe('vua');
      expect(toSnapshot(r, both).settings.pace).toBe('vua');
      expect(paceMs(r, LIVE, batch)).toBe(paceMs(vua, LIVE, batch));
      expect(animationMs(r, LIVE, batch)).toBe(animationMs(vua, LIVE, batch));
    }
    expect(paceMs(room({ status: 'playing', game: createGame([0, 2]) }), LIVE, batch)).toBe(paceMs(vua, LIVE, batch));
  });

  it('pauses longer for a long move than for a short one', () => {
    const r = cpuFirst(false);
    const short: GameEvent[] = [{ type: 'moved', color: 0, horse: 0, from: 0, to: 1, kicked: null }];
    const long: GameEvent[] = [{ type: 'moved', color: 0, horse: 0, from: 0, to: 6, kicked: null }];
    expect(paceMs(r, LIVE, long)).toBeGreaterThan(paceMs(r, LIVE, short));
    expect(paceMs(r, LIVE)).toBe(PACES.vua.normal.minSegmentPause * 1_000);
  });

  it('fast mode ignores the pace: fixed pauses, and a person\'s clock starts at once', () => {
    const r = cpuFirst(false, false, 'thu-thai');
    const long: GameEvent[] = [{ type: 'moved', color: 0, horse: 0, from: 0, to: 6, kicked: null }];
    expect(paceMs(r, BASE, long)).toBe(BASE.cpuDelayMs);
    expect(animationMs(r, BASE, long)).toBe(0);
  });

  it('starts a person\'s clock when the board has shown the action before theirs', () => {
    const r = cpuFirst(false);
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    const t = timingsOf(r, LIVE);
    const played = playDueAction(r, both, 1_000, t, () => 2)!;
    expect(r.game!.turn).toBe(2);
    const shown = animationMs(r, t, played.events);
    expect(shown).toBe(ms(animationSeconds(played.events, PACES.vua.normal)));
    expect(shown).toBeGreaterThan(1_000);
    expect(r.actionDueAt).toBe(1_000 + shown + t.turnMs);
    expect(r.dueAt).toBe(r.actionDueAt);
    expect(toSnapshot(r, both).turnDeadline).toBe(r.actionDueAt);
  });

  it('auto-rolls for a person only after the board has shown the action before theirs', () => {
    const r = cpuFirst(false, true);
    r.game = { ...r.game!, horses: [[5, -1, -1, -1], ...r.game!.horses.slice(1)] };
    const t = timingsOf(r, LIVE);
    const played = playDueAction(r, both, 1_000, t, () => 2)!;
    const shown = animationMs(r, t, played.events);
    expect(r.dueAt).toBe(1_000 + shown + t.autoRollMs);
    // Dropping and coming back re-derives the same moment, moved on by the 100 ms the game stood still with nobody connected.
    reconcileConnections(r, new Set(['u2']), 1_100, t);
    reconcileConnections(r, both, 1_200, t);
    expect(r.dueAt).toBe(1_000 + shown + t.autoRollMs + 100);
  });
});
