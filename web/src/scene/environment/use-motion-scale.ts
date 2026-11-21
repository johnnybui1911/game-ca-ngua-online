import { useSyncExternalStore } from 'react';
import { MOTION_STORAGE_KEY, motionScale } from './motion';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  // Fires when another tab changes the setting.
  window.addEventListener('storage', onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read(): number {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(MOTION_STORAGE_KEY);
  } catch {
    // Storage can be blocked; the system preference still counts.
  }
  return motionScale(window.matchMedia(QUERY).matches, stored);
}

/** 1 while the set may move, 0 while the player or the system asked for less motion. */
export function useMotionScale(): number {
  return useSyncExternalStore(subscribe, read);
}
