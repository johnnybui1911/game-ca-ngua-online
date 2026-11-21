import { describe, expect, it, vi } from 'vitest';
import { MOTION_STORAGE_KEY, createMotionSetting } from './motion-setting';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('motion setting', () => {
  it('uses the key ca-ngua:motion', () => {
    expect(MOTION_STORAGE_KEY).toBe('ca-ngua:motion');
  });

  it('defaults to full motion', () => {
    const setting = createMotionSetting(memoryStorage(), { matches: false });
    expect(setting.level()).toBe('full');
    expect(setting.isReduced()).toBe(false);
  });

  it('reads a stored choice and ignores anything else', () => {
    expect(createMotionSetting(memoryStorage({ [MOTION_STORAGE_KEY]: 'reduced' }), null).level()).toBe('reduced');
    expect(createMotionSetting(memoryStorage({ [MOTION_STORAGE_KEY]: 'full' }), null).level()).toBe('full');
    expect(createMotionSetting(memoryStorage({ [MOTION_STORAGE_KEY]: 'none' }), null).level()).toBe('full');
  });

  it('stores a change and tells subscribers until they unsubscribe', () => {
    const storage = memoryStorage();
    const setting = createMotionSetting(storage, null);
    const listener = vi.fn();
    const unsubscribe = setting.subscribe(listener);
    setting.setLevel('reduced');
    expect(storage.data.get(MOTION_STORAGE_KEY)).toBe('reduced');
    expect(setting.level()).toBe('reduced');
    expect(setting.isReduced()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setting.setLevel('full');
    expect(storage.data.get(MOTION_STORAGE_KEY)).toBe('full');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is reduced whenever the system asks for reduced motion, whatever the stored choice', () => {
    const system = { matches: true };
    const setting = createMotionSetting(memoryStorage({ [MOTION_STORAGE_KEY]: 'full' }), system);
    expect(setting.level()).toBe('full');
    expect(setting.isReduced()).toBe(true);
    // The preference is live: turning it off applies without a reload.
    system.matches = false;
    expect(setting.isReduced()).toBe(false);
  });

  it('works for the page when storage is missing or throws', () => {
    const none = createMotionSetting(null, null);
    none.setLevel('reduced');
    expect(none.isReduced()).toBe(true);

    const broken = createMotionSetting(
      {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
      null,
    );
    expect(broken.level()).toBe('full');
    broken.setLevel('reduced');
    expect(broken.level()).toBe('reduced');
  });
});
