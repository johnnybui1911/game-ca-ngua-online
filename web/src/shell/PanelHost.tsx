import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useT } from '../i18n';
import { useSceneStage } from './scene-host';

/** From this width the panel stands beside the board; below it, it slides up over the lower part. */
const SIDE_QUERY = '(min-width: 900px)';

function subscribeSide(onChange: () => void): () => void {
  const query = window.matchMedia(SIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Longest a leaving panel's copy stays, should its animation never report its end. */
const EXIT_LIMIT_MS = 1000;

/**
 * A panel that went away with nothing taking its place on a room page gave the board to a match:
 * a lifeless copy of it slides out over the board instead of vanishing. Called after the panel
 * left the page; `parent` is where it was.
 */
function playPanelExit(panel: HTMLElement, parent: Node): void {
  if (!parent.isConnected || !window.location.pathname.startsWith('/r/')) return;
  if (document.querySelector('.shell-panel')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = panel.cloneNode(true) as HTMLElement;
  // The copy is a picture: nothing in it can be found, focused, read out or pressed.
  for (const el of [ghost, ...ghost.querySelectorAll('[data-testid], [id], [name]')]) {
    el.removeAttribute('data-testid');
    el.removeAttribute('id');
    el.removeAttribute('name');
  }
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('shell-panel--leaving');
  const scrolled = panel.scrollTop;
  const remove = () => ghost.remove();
  ghost.addEventListener('animationend', (e) => {
    if (e.target === ghost) remove();
  });
  window.setTimeout(remove, EXIT_LIMIT_MS);
  parent.appendChild(ghost);
  ghost.scrollTop = scrolled;
}

/** Whether a panel has been on screen in this tab, so a screen shown after one knows focus was dropped. */
let panelShown = false;
export const panelWasShown = () => panelShown;

/**
 * A screen that just opened takes the focus, so a keyboard or screen-reader user lands in it and
 * hears its title instead of being left on the page body: its heading, else its status line.
 * Focus a child already took (an `autoFocus` field) or an open dialog keeps it.
 */
export function focusScreen(screen: HTMLElement): void {
  const active = document.activeElement;
  if (active && active !== document.body && (screen.contains(active) || active.closest('[role="dialog"]'))) return;
  const target = screen.querySelector<HTMLElement>('h1') ?? screen.querySelector<HTMLElement>('h2') ?? screen.querySelector<HTMLElement>('[role="status"]');
  if (!target) return;
  if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
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
  const { pathname } = useLocation();

  // On mount, and for each new page shown in the same panel (sign-in and sign-up share one).
  useLayoutEffect(() => {
    panelShown = true;
    if (ref.current) focusScreen(ref.current);
  }, [pathname]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setBox((prev) => (prev.width === el.offsetWidth && prev.height === el.offsetHeight ? prev : { width: el.offsetWidth, height: el.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const parent = el.parentNode;
    return () => {
      observer.disconnect();
      // After this commit, before the next paint: by then whatever replaces the panel is on the page.
      if (parent) queueMicrotask(() => playPanelExit(el, parent));
    };
  }, []);

  const right = side ? box.width : 0;
  // Narrow screens give the panel the whole page: nothing of the board stays in view to frame.
  useSceneStage({ activity: 'dimmed', orbit: true, insets: { top: 0, bottom: 0, right }, panel: { right, bottom: 0 } });

  return (
    <div className={wide ? 'shell-panel shell-panel--wide' : 'shell-panel'} ref={ref} data-testid="panel-host" data-layout={side ? 'side' : 'sheet'}>
      <div className="shell-panel-body">{children}</div>
    </div>
  );
}

/** The usual surface inside a panel: a glass card with the game's name above its title. */
export function GlassPanel({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <main className={`glass shell-glass${className ? ` ${className}` : ''}`}>
      <p className="ui-eyebrow">{t('brand.name')}</p>
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
