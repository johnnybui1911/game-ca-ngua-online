import { useSyncExternalStore } from 'react';

/**
 * Whether this tab's visitor has already gone past the home page ("Chơi ngay", an invite link, a
 * sign-in). A signed-in visitor who has is taken straight to the lobby at `/`; a fresh visit
 * starts on the home page. Kept for the tab, so a reload or an OAuth round trip does not ask again.
 */
const KEY = 'ca-ngua:entered';

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let value = read();
const listeners = new Set<() => void>();

export const entered = {
  get: (): boolean => value,
  set(next: boolean): void {
    if (next === value) return;
    value = next;
    try {
      if (next) sessionStorage.setItem(KEY, '1');
      else sessionStorage.removeItem(KEY);
    } catch {
      // private mode: remembered for this page only
    }
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useEntered(): boolean {
  return useSyncExternalStore(entered.subscribe, entered.get);
}
