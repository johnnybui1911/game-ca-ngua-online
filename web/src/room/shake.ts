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
 * that differs from the previous one by more than the threshold on two or more axes, outside
 * the cooldown of the last shake.
 */
export function createShakeDetector(threshold = SHAKE_THRESHOLD, cooldownMs = SHAKE_COOLDOWN_MS) {
  let last: Acceleration | null = null;
  let lastShake = -Infinity;
  return (a: Acceleration, now: number): boolean => {
    const prev = last;
    last = a;
    if (!prev) return false;
    const axes = [a.x - prev.x, a.y - prev.y, a.z - prev.z].filter((d) => Math.abs(d) > threshold).length;
    if (axes < 2 || now - lastShake < cooldownMs) return false;
    lastShake = now;
    return true;
  };
}

/** iOS 13+ exposes this and delivers no motion events until it resolves to 'granted'. */
interface MotionPermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function motionApi(): MotionPermissionApi | null {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return null;
  if (!window.matchMedia('(pointer: coarse)').matches) return null;
  return DeviceMotionEvent as MotionPermissionApi;
}

export interface ShakeToRoll {
  /** A phone or tablet with a motion sensor API. */
  supported: boolean;
  /** Listening for shakes. */
  enabled: boolean;
  /** Asks for motion permission where the browser requires it (must run inside a tap). */
  enable: () => void;
}

/** Calls `onShake` for each shake while `active`; only on touch devices with motion events. */
export function useShakeToRoll(active: boolean, onShake: () => void): ShakeToRoll {
  const [api] = useState(motionApi);
  const [enabled, setEnabled] = useState(() => api !== null && typeof api.requestPermission !== 'function');
  const handler = useRef(onShake);
  handler.current = onShake;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!enabled) return;
    const detect = createShakeDetector();
    const listener = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      if (detect({ x: a.x, y: a.y, z: a.z }, e.timeStamp) && activeRef.current) handler.current();
    };
    window.addEventListener('devicemotion', listener);
    return () => window.removeEventListener('devicemotion', listener);
  }, [enabled]);

  const enable = useCallback(() => {
    if (typeof api?.requestPermission !== 'function') return;
    api
      .requestPermission()
      .then((answer) => setEnabled(answer === 'granted'))
      .catch(() => setEnabled(false));
  }, [api]);

  return { supported: api !== null, enabled, enable };
}
