import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useSceneStage } from './scene-host';

/** From this width the panel stands beside the board; below it, it slides up over the lower part. */
const SIDE_QUERY = '(min-width: 900px)';

function subscribeSide(onChange: () => void): () => void {
  const query = window.matchMedia(SIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Where every screen that is not the home page or a match lives: a column on the right of a wide
 * screen, a sheet over the lower part of a narrow one. It dims the board and tells the camera
 * how much room is left, so the board stays in view beside or above the panel. The child brings
 * its own surface (a `.glass` section).
 */
export function PanelHost({ children, wide = false }: { children: ReactNode; /** A broader column, for screens with more to show (the waiting room). */ wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const side = useSyncExternalStore(subscribeSide, () => window.matchMedia(SIDE_QUERY).matches);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setBox((prev) => (prev.width === el.offsetWidth && prev.height === el.offsetHeight ? prev : { width: el.offsetWidth, height: el.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const right = side ? box.width : 0;
  const bottom = side ? 0 : box.height;
  useSceneStage({ activity: 'dimmed', orbit: true, insets: { top: 0, bottom, right }, panel: { right, bottom } });

  return (
    <div className={wide ? 'shell-panel shell-panel--wide' : 'shell-panel'} ref={ref} data-testid="panel-host" data-layout={side ? 'side' : 'sheet'}>
      <div className="shell-panel-body">{children}</div>
    </div>
  );
}

/** The usual surface inside a panel: a glass card with the game's name above its title. */
export function GlassPanel({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <main className={`glass shell-glass${className ? ` ${className}` : ''}`}>
      <p className="ui-eyebrow">Cờ Cá Ngựa 3D</p>
      <h1 className="ui-title shell-glass-title">{title}</h1>
      {children}
    </main>
  );
}

/** A short line on glass for the moments a screen has nothing else to show yet. */
export function PanelStatus({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <PanelHost>
      <p className="glass shell-status" role="status" data-testid={testid}>
        {children}
      </p>
    </PanelHost>
  );
}
