import { describe, expect, it } from 'vitest';
import { pendingAfterArrival, pendingAfterExpiry, pendingAfterReport, playsOnBoard, reportAfterExpiry, rollHeld } from './board-wait';

describe('roll gate', () => {
  it('holds the roll before the board has reported anything', () => {
    expect(rollHeld(null, 1, null)).toBe(true);
  });

  it('follows the board once it has reported', () => {
    expect(rollHeld(true, 1, null)).toBe(true);
    expect(rollHeld(false, 1, null)).toBe(false);
  });

  it('lets go when the wait for this state ran out, and holds again for the next state of a busy board', () => {
    expect(rollHeld(true, 4, 4)).toBe(false);
    expect(rollHeld(null, 4, 4)).toBe(false);
    expect(rollHeld(true, 5, 4)).toBe(true);
  });

  it('holds a board that never reports only once', () => {
    const report = reportAfterExpiry(null);
    expect(report).toBe(false);
    expect(rollHeld(report, 5, 4)).toBe(false);
  });

  it('keeps what a reporting board said when its wait runs out', () => {
    expect(reportAfterExpiry(true)).toBe(true);
    expect(reportAfterExpiry(false)).toBe(false);
  });
});

describe('HUD wait for the board', () => {
  it('waits only for states with a roll or a move in them', () => {
    expect(playsOnBoard([{ type: 'rolled' }])).toBe(true);
    expect(playsOnBoard([{ type: 'turn' }, { type: 'moved' }])).toBe(true);
    expect(playsOnBoard([{ type: 'turn' }])).toBe(false);
    expect(playsOnBoard([])).toBe(false);
  });

  it('ignores the idle report that is still on its way when a state arrives, and ends at the one after busy', () => {
    const arrived = pendingAfterArrival(null, 7, false);
    expect(arrived).toEqual({ seq: 7, sawBusy: false });
    expect(pendingAfterReport(arrived, false)).toEqual(arrived);
    const busy = pendingAfterReport(arrived, true);
    expect(busy).toEqual({ seq: 7, sawBusy: true });
    expect(pendingAfterReport(busy, false)).toBeNull();
  });

  it('ends at the first idle report when the board was already busy as the state arrived', () => {
    const arrived = pendingAfterArrival(null, 8, true);
    expect(arrived.sawBusy).toBe(true);
    expect(pendingAfterReport(arrived, false)).toBeNull();
  });

  it('keeps one wait across states that arrive while it lasts, for the newest', () => {
    const busy = pendingAfterReport(pendingAfterArrival(null, 7, false), true);
    expect(pendingAfterArrival(busy, 8, true)).toEqual({ seq: 8, sawBusy: true });
    expect(pendingAfterArrival(pendingAfterArrival(null, 7, false), 8, false)).toEqual({ seq: 8, sawBusy: false });
  });

  it('gives up on a board that never reports, but only for the state it waited for', () => {
    const waiting = pendingAfterArrival(null, 7, false);
    expect(pendingAfterExpiry(waiting, 7)).toBeNull();
    expect(pendingAfterExpiry(pendingAfterArrival(waiting, 8, false), 7)).toEqual({ seq: 8, sawBusy: false });
    expect(pendingAfterExpiry(null, 7)).toBeNull();
  });

  it('has nothing to end without a wait', () => {
    expect(pendingAfterReport(null, true)).toBeNull();
    expect(pendingAfterReport(null, false)).toBeNull();
  });
});
