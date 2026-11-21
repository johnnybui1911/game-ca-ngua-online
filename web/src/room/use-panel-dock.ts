import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type Dock = 'bottom' | 'left' | 'right' | 'float';
export const DOCKS: readonly Dock[] = ['bottom', 'left', 'right', 'float'];

interface Point {
  x: number;
  y: number;
}

const DOCK_KEY = 'ca-ngua:panel-dock';
const POS_KEY = 'ca-ngua:panel-pos';

function load<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode): the choice just lasts for this visit.
  }
}

const parseDock = (v: unknown): Dock | null => (DOCKS.includes(v as Dock) ? (v as Dock) : null);
const parsePoint = (v: unknown): Point | null => {
  const p = v as Point | null;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
};

/** Where the control panel sits, plus drag handling for the free-floating mode. */
export function usePanelDock(panel: React.RefObject<HTMLElement | null>) {
  const [dock, setDockState] = useState<Dock>(() => load(DOCK_KEY, parseDock, 'bottom'));
  const [pos, setPos] = useState<Point | null>(() => load<Point | null>(POS_KEY, parsePoint, null));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const setDock = useCallback((next: Dock) => {
    setDockState(next);
    save(DOCK_KEY, next);
  }, []);

  const clamp = useCallback(
    (p: Point): Point => {
      const el = panel.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      return {
        x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
        y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
      };
    },
    [panel],
  );

  // Keep a floating panel reachable after a resize or rotation.
  useEffect(() => {
    if (dock !== 'float') return;
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dock, clamp]);

  const onDragStart = (e: ReactPointerEvent<HTMLElement>) => {
    if (dock !== 'float' || !panel.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panel.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d) setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
  };
  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos((p) => {
      if (p) save(POS_KEY, p);
      return p;
    });
  };

  // Until first dragged, the floating panel starts near the bottom centre.
  const floatStyle =
    dock === 'float'
      ? pos
        ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
        : undefined
      : undefined;

  return { dock, setDock, floatStyle, handlers: { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd } };
}
