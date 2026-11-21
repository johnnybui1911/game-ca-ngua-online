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

/**
 * Calls `onShake` once per entry into `active` when the device is shaken; opt-in, only on touch
 * devices with motion events. The choice is stored in this browser; iOS asks for permission again
 * on each visit, so there it starts off.
 */
export function useShakeToRoll(active: boolean, onShake: () => void): ShakeToRoll {
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
  // One roll per stretch of `active`: re-armed when it turns on again.
  const armed = useRef(active);
  const activeRef = useRef(active);
  if (active && !activeRef.current) armed.current = true;
  activeRef.current = active;

  useEffect(() => {
    if (!enabled) return;
    const detect = createShakeDetector();
    const listener = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      if (!detect({ x: a.x, y: a.y, z: a.z }, e.timeStamp) || !activeRef.current || !armed.current) return;
      armed.current = false;
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
