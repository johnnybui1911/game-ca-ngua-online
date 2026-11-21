import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ca_emotes_muted';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** "Hide emotes" flag, kept in this browser. `storage` is injectable for tests; null means unavailable. */
export function createEmoteSettings(storage: StorageLike | null) {
  const read = (): boolean => {
    try {
      return storage?.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };
  let muted = read();
  const listeners = new Set<() => void>();
  return {
    isMuted: (): boolean => muted,
    setMuted(next: boolean): void {
      muted = next;
      try {
        storage?.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // private mode: the choice lasts for this page only
      }
      for (const l of listeners) l();
    },
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

export const emoteSettings = createEmoteSettings(browserStorage());

export function useEmotesMuted(): boolean {
  return useSyncExternalStore(emoteSettings.subscribe, emoteSettings.isMuted);
}
