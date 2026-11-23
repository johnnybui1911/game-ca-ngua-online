import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { sound } from '../audio/sound';
import { CELEBRATION_SECONDS } from '../scene/director';
import { closeUpPolicy } from '../scene/motion/close-up-policy';
import { motionSetting, useMotionLevel } from '../scene/motion/motion-setting';
import { stableReturn } from '../scene/motion/stable-return';
import type { ShowcaseScene } from '../scene/props';
import { useQuality } from '../scene/render/QualityProvider';
import { useMatchTransition, useSceneHostState, useShowcase } from '../shell/scene-host';
import { useNearCalmZone } from './calm-zone';
import { DemoDriver, stepSeconds } from './demo-driver';

/**
 * Seed of the first demo game of a visit; every game after it uses the next seed. The demo plays
 * the basic game (no locks on the home columns), at the quick pace. Picked for its opening: a
 * horse leaves its stable within a second and the first kick comes in about thirteen seconds.
 */
export const DEMO_SEED = 228;
/** Seconds the board only turns before the first move, and again after a match gives it back. */
export const OPENING_SECONDS = 3;
/** Pause between the horses of a finished game landing in their stables and the next game. */
const REDEAL_SECONDS = 0.6;
/** Pace of the game while a panel is open, as a share of the normal demo pace. */
export const PANEL_SPEED = 0.5;
/** A game that drags on this long (rolls and moves) is replaced by a new one. */
const MAX_ACTIONS = 900;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Four CPU colours playing on the board behind the home page and the panels, entirely in the
 * browser. Mount it once inside the scene host, above the routes. It plays nothing on a software
 * renderer (which shows a still picture there) or with reduced motion.
 */
export function DemoMatch() {
  const { webgl } = useQuality();
  // Both re-render this component when the answer of `isReduced` may have changed.
  useMotionLevel();
  useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches);
  if (webgl !== 'gpu' || motionSetting.isReduced()) return null;
  return <DemoGame />;
}

function DemoGame() {
  const { stage, match, load } = useSceneHostState();
  const { activity, tier } = useQuality();
  const [driver] = useState(() => new DemoDriver({ seed: DEMO_SEED, parked: true }));
  const steps = useSyncExternalStore(driver.subscribe, driver.getSteps);
  // The basic game, drawn with the quick pace's animation timings.
  const showcase = useMemo<ShowcaseScene>(() => ({ key: 'demo', steps, quick: true }), [steps]);
  useShowcase(showcase);

  // A match is about to take the board: the demo's horses fly home first, and the demo is over.
  useMatchTransition(async () => {
    await stableReturn.request();
    driver.park();
  });

  const panelOpen = stage.activity !== 'full';
  const nearControls = useNearCalmZone();
  const demoOnBoard = match === null;

  // No close-ups under a panel, next to the call to action, or where the frame rate is already tight.
  const calm = demoOnBoard && (panelOpen || nearControls || tier === 'low');
  useEffect(() => {
    closeUpPolicy.setCalm(calm);
    return () => closeUpPolicy.setCalm(false);
  }, [calm]);

  const muted = demoOnBoard && panelOpen;
  useEffect(() => {
    sound.setBoardEffectsMuted(muted);
    return () => sound.setBoardEffectsMuted(false);
  }, [muted]);

  const speed = useRef(1);
  speed.current = panelOpen ? PANEL_SPEED : 1;
  // `paused` covers a hidden tab; nothing moves before the board is on screen.
  const running = demoOnBoard && load === 'ready' && activity !== 'paused';
  useEffect(() => {
    if (!running) return;
    let live = true;
    let timer = 0;
    const after = (seconds: number, act: () => void) => {
      timer = window.setTimeout(act, (seconds * 1000) / speed.current);
    };
    const next = (opening: boolean) => {
      if (driver.parked) {
        after(opening ? OPENING_SECONDS : REDEAL_SECONDS, () => {
          driver.deal();
          next(false);
        });
        return;
      }
      const settle = stepSeconds(driver.getStep());
      if (driver.finished || driver.actions >= MAX_ACTIONS) {
        after(driver.finished ? Math.max(settle, CELEBRATION_SECONDS) : settle, () => {
          void stableReturn.request().then(() => {
            if (!live) return;
            driver.park();
            next(false);
          });
        });
        return;
      }
      after(settle, () => {
        driver.playTurn();
        next(false);
      });
    };
    next(true);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [running, driver]);

  return null;
}
