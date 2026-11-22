/**
 * The part of the home page the player reaches for (the "Chơi ngay" band). While the pointer is
 * near it, or the keyboard focus is inside it, the demo keeps its camera still.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

/** How far from the zone's edge, CSS px, the pointer already counts as near. */
export const CALM_MARGIN_PX = 96;

export interface ZoneRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Whether point (x, y) lies within `margin` of `rect`. */
export function nearRect(x: number, y: number, rect: ZoneRect, margin: number): boolean {
  return x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;
}

let zone: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setZone(next: HTMLElement | null): void {
  if (zone === next) return;
  zone = next;
  for (const listener of listeners) listener();
}

/** Marks the element behind `ref` as the zone while the calling component is mounted. */
export function useDemoCalmZone(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    setZone(el);
    return () => {
      if (zone === el) setZone(null);
    };
  }, [ref]);
}

/** True while the pointer is near the zone or the focus is inside it. */
export function useNearCalmZone(): boolean {
  const el = useSyncExternalStore(subscribe, () => zone);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!el) {
      setNear(false);
      return;
    }
    let pointer = false;
    const update = () => setNear(pointer || el.contains(document.activeElement));
    const onMove = (e: PointerEvent) => {
      pointer = nearRect(e.clientX, e.clientY, el.getBoundingClientRect(), CALM_MARGIN_PX);
      update();
    };
    const onGone = (e: PointerEvent) => {
      // A finger that lifts is nowhere; a mouse stays where it was until it leaves the page.
      if (e.type === 'pointerup' && e.pointerType === 'mouse') return;
      pointer = false;
      update();
    };
    const leave = document.documentElement;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('pointerup', onGone, { passive: true });
    window.addEventListener('pointercancel', onGone, { passive: true });
    leave.addEventListener('pointerleave', onGone);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('pointerup', onGone);
      window.removeEventListener('pointercancel', onGone);
      leave.removeEventListener('pointerleave', onGone);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [el]);
  return near;
}
