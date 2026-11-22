import { useSyncExternalStore } from 'react';

/** How much animation the board plays: everything, or short plain slides. */
export type MotionLevel = 'full' | 'reduced';

export const MOTION_STORAGE_KEY = 'ca-ngua:motion';
export const DEFAULT_MOTION_LEVEL: MotionLevel = 'full';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
/** The system's "reduce motion" preference; `matches` is read each time, so a change applies to the next animation. */
type MediaLike = Pick<MediaQueryList, 'matches'>;

function parse(raw: string | null | undefined): MotionLevel {
  return raw === 'reduced' || raw === 'full' ? raw : DEFAULT_MOTION_LEVEL;
}

/**
 * The player's animation level, kept in this browser. `storage` and `systemReduce` are injectable for tests;
 * null means unavailable.
 */
export function createMotionSetting(storage: StorageLike | null, systemReduce: MediaLike | null) {
  const read = (): MotionLevel => {
    try {
      return parse(storage?.getItem(MOTION_STORAGE_KEY));
    } catch {
      return DEFAULT_MOTION_LEVEL;
    }
  };
  let level = read();
  const listeners = new Set<() => void>();
  return {
    level: (): MotionLevel => level,
    setLevel(next: MotionLevel): void {
      level = next;
      try {
        storage?.setItem(MOTION_STORAGE_KEY, next);
      } catch {
        // private mode: the choice lasts for this page only
      }
      for (const l of listeners) l();
    },
    /** True when the player chose reduced animation or the system asks for reduced motion. */
    isReduced: (): boolean => level === 'reduced' || systemReduce?.matches === true,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function browserReduceMotion(): MediaLike | null {
  try {
    return typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    return null;
  }
}

export const motionSetting = createMotionSetting(browserStorage(), browserReduceMotion());

export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore(motionSetting.subscribe, motionSetting.level);
}
