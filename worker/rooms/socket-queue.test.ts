import { describe, expect, it } from 'vitest';
import { KeyedQueue } from './socket-queue';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('KeyedQueue', () => {
  it('runs one key in submission order even when an earlier task is slower', async () => {
    const q = new KeyedQueue<object>();
    const key = {};
    const seen: string[] = [];
    const a = q.run(key, async () => {
      await tick();
      await tick();
      seen.push('first');
    });
    const b = q.run(key, async () => {
      seen.push('second');
    });
    await Promise.all([a, b]);
    expect(seen).toEqual(['first', 'second']);
  });

  it('does not make different keys wait for each other', async () => {
    const q = new KeyedQueue<object>();
    const seen: string[] = [];
    const a = q.run({}, async () => {
      await tick();
      await tick();
      seen.push('slow');
    });
    const b = q.run({}, async () => {
      seen.push('fast');
    });
    await Promise.all([a, b]);
    expect(seen).toEqual(['fast', 'slow']);
  });

  it('still runs later tasks after one fails, and reports the failure to its own caller', async () => {
    const q = new KeyedQueue<object>();
    const key = {};
    const failing = q.run(key, async () => {
      throw new Error('boom');
    });
    const after = q.run(key, async () => undefined);
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBeUndefined();
  });
});
