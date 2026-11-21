import { useSyncExternalStore } from 'react';
import { motionSetting } from '../motion/motion-setting';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  const unsubscribe = motionSetting.subscribe(onChange);
  return () => {
    media.removeEventListener('change', onChange);
    unsubscribe();
  };
}

function read(): number {
  return motionSetting.isReduced() ? 0 : 1;
}

/** 1 while the set may move, 0 while the player or the system asked for less motion. */
export function useMotionScale(): number {
  return useSyncExternalStore(subscribe, read);
}
