import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { HudInsets } from '../scene/camera';
import type { GameSceneProps, ShowcaseScene } from '../scene/props';
import type { SceneActivity } from '../scene/render/quality';

/** How a screen wants the board behind it while no match owns it. */
export interface SceneStage {
  /** `full` for the home page; `dimmed` while a panel has the player's attention. */
  activity: SceneActivity;
  /** Screen space the screen's own controls cover; the board is framed in what is left. */
  insets: HudInsets;
  /** Slow turn around the board. */
  orbit: boolean;
  /** The part of `insets` a panel covers edge to edge; the corner controls move out of its way. */
  panel?: { right: number; bottom: number };
}

/** A match that asked for the board: the props of `GameScene`, and the element that takes its pointer input. */
export interface MatchSource extends GameSceneProps {
  insets?: HudInsets;
  eventSource: HTMLElement | null;
}

/** Runs when a match is about to take the board; the board waits for the returned promise (up to a limit). */
export type MatchTransition = () => void | Promise<void>;

/** Longest the board waits for the transitions before a match takes it anyway. */
export const MATCH_TRANSITION_LIMIT_MS = 2500;

/**
 * How far the board is: its code is `loading`, the canvas is `building` its first picture, `ready`;
 * `poster` when the still picture stands in for it (see `SceneLayer`), `unavailable` without WebGL.
 */
export type SceneLoad = 'loading' | 'building' | 'ready' | 'poster' | 'unavailable';

export interface SceneHostApi {
  /** Registers (or, with null, withdraws) the stage of the screen identified by `id`; the newest registration wins. */
  setStage: (id: string, stage: SceneStage | null) => void;
  /** Hands the board to a match, or takes it back with null. Called by `GameScene`. */
  setMatch: (match: MatchSource | null) => void;
  /** Game the board plays while no match owns it; null for the idle board. */
  setShowcase: (showcase: ShowcaseScene | null) => void;
  /** Adds a step that runs before a match takes the board (e.g. demo horses going home). Returns its removal. */
  addMatchTransition: (transition: MatchTransition) => () => void;
  /** Called by the canvas as it loads. */
  setLoad: (load: SceneLoad) => void;
  /** Called by the canvas as the files it cannot start without arrive: 0 to 100, never going back. */
  setProgress: (percent: number) => void;
  /** Transitions registered now, in registration order. */
  matchTransitions: () => MatchTransition[];
}

export interface SceneHostState {
  stage: SceneStage;
  match: MatchSource | null;
  showcase: ShowcaseScene | null;
  load: SceneLoad;
  /** How far the board's first picture is, 0 to 100. */
  progress: number;
}

const DEFAULT_STAGE: SceneStage = { activity: 'dimmed', insets: { top: 0, bottom: 0 }, orbit: false };

const ApiContext = createContext<SceneHostApi | null>(null);
const StateContext = createContext<SceneHostState | null>(null);

const MATCH_KEYS = ['room', 'batches', 'myColor', 'onBusyChange', 'eventSource', 'cameraReset'] as const;

function sameInsets(a: HudInsets | undefined, b: HudInsets | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.bottom === b.bottom && (a.left ?? 0) === (b.left ?? 0) && (a.right ?? 0) === (b.right ?? 0);
}

function sameStage(a: SceneStage, b: SceneStage): boolean {
  return (
    a.activity === b.activity &&
    a.orbit === b.orbit &&
    sameInsets(a.insets, b.insets) &&
    (a.panel?.right ?? 0) === (b.panel?.right ?? 0) &&
    (a.panel?.bottom ?? 0) === (b.panel?.bottom ?? 0)
  );
}

/** Owns what the one persistent canvas shows. Mounted once, above every route. */
export function SceneHostProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<{ id: string; stage: SceneStage }[]>([]);
  const [match, setMatchState] = useState<MatchSource | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseScene | null>(null);
  const [load, setLoad] = useState<SceneLoad>('loading');
  const [progress, setProgressState] = useState(0);
  const transitions = useRef<MatchTransition[]>([]);
  /** The match's newest pick handler; it changes with every render of the match page. */
  const pick = useRef<GameSceneProps['onPickHorse'] | null>(null);
  const onPickHorse = useCallback((horse: number) => pick.current?.(horse), []);

  const api = useMemo<SceneHostApi>(
    () => ({
      setStage: (id, stage) =>
        setStages((all) => {
          const at = all.findIndex((s) => s.id === id);
          if (stage === null) return at < 0 ? all : all.filter((s) => s.id !== id);
          if (at < 0) return [...all, { id, stage }];
          const current = all[at];
          return current && sameStage(current.stage, stage) ? all : all.map((s) => (s.id === id ? { id, stage } : s));
        }),
      setMatch: (next) => {
        pick.current = next?.onPickHorse ?? null;
        setMatchState((prev) => {
          if (next === null) return null;
          if (prev && MATCH_KEYS.every((k) => prev[k] === next[k]) && sameInsets(prev.insets, next.insets)) return prev;
          return { ...next, onPickHorse };
        });
      },
      setShowcase,
      addMatchTransition: (transition) => {
        transitions.current = [...transitions.current, transition];
        return () => {
          transitions.current = transitions.current.filter((t) => t !== transition);
        };
      },
      setLoad,
      setProgress: (percent) => setProgressState((prev) => Math.max(prev, Math.min(100, Math.round(percent)))),
      matchTransitions: () => transitions.current,
    }),
    [onPickHorse],
  );

  const stage = stages[stages.length - 1]?.stage ?? DEFAULT_STAGE;
  const state = useMemo<SceneHostState>(() => ({ stage, match, showcase, load, progress }), [stage, match, showcase, load, progress]);

  return (
    <ApiContext value={api}>
      <StateContext value={state}>{children}</StateContext>
    </ApiContext>
  );
}

/** The persistent board's controls, or null outside the app shell (dev harness, tests). */
export function useSceneHost(): SceneHostApi | null {
  return useContext(ApiContext);
}

export function useSceneHostState(): SceneHostState {
  const state = useContext(StateContext);
  if (!state) throw new Error('useSceneHostState needs a SceneHostProvider above it');
  return state;
}

/** Stages the board for the calling screen while it is mounted. */
export function useSceneStage(stage: SceneStage): void {
  const host = useSceneHost();
  const id = useId();
  const { activity, orbit } = stage;
  const { top, bottom, left = 0, right = 0 } = stage.insets;
  const panelRight = stage.panel?.right ?? 0;
  const panelBottom = stage.panel?.bottom ?? 0;
  useEffect(() => {
    host?.setStage(id, { activity, orbit, insets: { top, bottom, left, right }, panel: { right: panelRight, bottom: panelBottom } });
  }, [host, id, activity, orbit, top, bottom, left, right, panelRight, panelBottom]);
  useEffect(() => () => host?.setStage(id, null), [host, id]);
}

/**
 * Plays `showcase` on the board whenever no match owns it. For the home page's demo game: build
 * the steps with the shared engine and pass a new object as the game advances.
 */
export function useShowcase(showcase: ShowcaseScene | null): void {
  const host = useSceneHost();
  useEffect(() => {
    host?.setShowcase(showcase);
  }, [host, showcase]);
  useEffect(() => () => host?.setShowcase(null), [host]);
}

/**
 * Runs `transition` each time a match is about to take the board from the showcase; the camera
 * flight to the player's seat starts when the promise settles.
 */
export function useMatchTransition(transition: MatchTransition): void {
  const host = useSceneHost();
  const latest = useRef(transition);
  latest.current = transition;
  useEffect(() => host?.addMatchTransition(() => latest.current()), [host]);
}
