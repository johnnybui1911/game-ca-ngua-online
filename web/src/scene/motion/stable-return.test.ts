import { describe, expect, it } from 'vitest';
import { createStableReturn } from './stable-return';

function setup() {
  const timers: { fn: () => void; ms: number }[] = [];
  const store = createStableReturn((fn, ms) => timers.push({ fn, ms }));
  return { store, timers };
}

async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('stable return', () => {
  it('resolves at once without a board', async () => {
    const { store, timers } = setup();
    expect(await settled(store.request())).toBe(true);
    expect(timers).toHaveLength(0);
  });

  it('resolves at once when the board has nothing to fly home', async () => {
    const { store, timers } = setup();
    store.attach(() => 0);
    expect(await settled(store.request())).toBe(true);
    expect(timers).toHaveLength(0);
  });

  it('waits for the length of the flight, then resolves', async () => {
    const { store, timers } = setup();
    store.attach(() => 1);
    const request = store.request();
    expect(await settled(request)).toBe(false);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBeGreaterThanOrEqual(1000);
    expect(timers[0]!.ms).toBeLessThanOrEqual(1100);
    timers[0]!.fn();
    expect(await settled(request)).toBe(true);
  });

  it('joins a flight already under way instead of starting another', () => {
    const { store, timers } = setup();
    let started = 0;
    store.attach(() => {
      started++;
      return 1;
    });
    expect(store.request()).toBe(store.request());
    expect(started).toBe(1);
    timers[0]!.fn();
    void store.request();
    expect(started).toBe(2);
  });

  it('forgets a board that detached, but not when a newer one took over', async () => {
    const { store, timers } = setup();
    const detachFirst = store.attach(() => 1);
    store.attach(() => 2);
    detachFirst();
    void store.request();
    expect(timers[0]!.ms).toBeGreaterThanOrEqual(2000);
    timers[0]!.fn();
    const { store: other, timers: none } = setup();
    other.attach(() => 1)();
    expect(await settled(other.request())).toBe(true);
    expect(none).toHaveLength(0);
  });
});
