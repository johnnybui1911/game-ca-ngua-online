import { useCallback, useEffect, useRef, useState } from 'react';

export interface Acceleration {
  x: number;
  y: number;
  z: number;
}

/** Change in m/s² between two readings, on at least two axes, that counts as a shake. */
export const SHAKE_THRESHOLD = 15;
/** One shake rolls once: further jolts within this window are part of the same shake. */
export const SHAKE_COOLDOWN_MS = 1200;

/**
 * Feeds accelerometer readings (gravity included) and answers true once per shake: a reading
 * that differs from the previous one by more than the threshold on two or more axes, after a
 * quiet period of `cooldownMs` without such jolts. Every jolt restarts the quiet period, so a
 * long shake, or the phone coming back to rest, never fires twice.
 */
export function createShakeDetector(threshold = SHAKE_THRESHOLD, cooldownMs = SHAKE_COOLDOWN_MS) {
  let last: Acceleration | null = null;
  let lastJolt = -Infinity;
  return (a: Acceleration, now: number): boolean => {
    const prev = last;
    last = a;
    if (!prev) return false;
    const axes = [a.x - prev.x, a.y - prev.y, a.z - prev.z].filter((d) => Math.abs(d) > threshold).length;
    if (axes < 2) return false;
    const quiet = now - lastJolt >= cooldownMs;
    lastJolt = now;
    return quiet;
  };
}

const STORAGE_KEY = 'ca-ngua:shake';

/** iOS 13+ exposes this and delivers no motion events until it resolves to 'granted'. */
interface MotionPermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function motionApi(): MotionPermissionApi | null {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return null;
  if (!window.matchMedia('(pointer: coarse)').matches) return null;
  return DeviceMotionEvent as MotionPermissionApi;
}

function storeChoice(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // private mode: the choice lasts for this page only
  }
}

export interface ShakeToRoll {
  /** A phone or tablet with a motion sensor API. */
  supported: boolean;
  /** Listening for shakes. */
  enabled: boolean;
  /** Turns listening on or off; turning on asks for motion permission where needed (call inside a tap). */
  setEnabled: (on: boolean) => void;
}

/** Stands for "no shake-roll sent yet", distinct from any roll key. */
const NONE_SENT = Symbol('none sent');

/**
 * While `active`, a shake calls `onShake` once per roll chance: `rollKey` must change whenever a
 * new chance begins (each roll the server reports), so an extra roll after a 1 or 6 re-arms it and
 * a shake sent before the server answers cannot send a second one. Opt-in, only on touch devices
 * with motion events. The choice is stored in this browser; iOS asks for permission again on each
 * visit, so there it starts off.
 */
export function useShakeToRoll(active: boolean, rollKey: unknown, onShake: () => void): ShakeToRoll {
  const [api] = useState(motionApi);
  const [enabled, setEnabledState] = useState(() => {
    if (api === null || typeof api.requestPermission === 'function') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const handler = useRef(onShake);
  handler.current = onShake;
  const activeRef = useRef(active);
  activeRef.current = active;
  const keyRef = useRef(rollKey);
  keyRef.current = rollKey;
  const sentFor = useRef<unknown>(NONE_SENT);

  useEffect(() => {
    if (!enabled) return;
    const detect = createShakeDetector();
    const listener = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      if (!detect({ x: a.x, y: a.y, z: a.z }, e.timeStamp) || !activeRef.current || sentFor.current === keyRef.current) return;
      sentFor.current = keyRef.current;
      handler.current();
    };
    window.addEventListener('devicemotion', listener);
    return () => window.removeEventListener('devicemotion', listener);
  }, [enabled]);

  const setEnabled = useCallback(
    (on: boolean) => {
      storeChoice(on);
      if (!on || typeof api?.requestPermission !== 'function') {
        setEnabledState(on && api !== null);
        return;
      }
      api
        .requestPermission()
        .then((answer) => setEnabledState(answer === 'granted'))
        .catch(() => setEnabledState(false));
    },
    [api],
  );

  return { supported: api !== null, enabled, setEnabled };
}
