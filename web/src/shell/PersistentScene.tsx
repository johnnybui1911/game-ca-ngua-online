import { useEffect, useMemo, useRef, useState } from 'react';
import { LACQUER_URL } from '../scene/Board';
import { SceneCanvas } from '../scene/GameScene';
import { HORSE_MODEL_URL } from '../scene/horse-model';
import { useQuality } from '../scene/render/QualityProvider';
import { MATCH_TRANSITION_LIMIT_MS, useSceneHost, useSceneHostState } from './scene-host';
import { idleShowcase, showcaseBatches } from './showcase';

/**
 * The loading card's steps, as a share of the whole wait: the 3D code has arrived once this
 * module runs; the board cannot draw without the knight model and the lacquer texture, whose
 * sizes set their weights; after both come the shaders and the first picture, which end at 100.
 */
const CODE_ARRIVED = 20;
const FILE_STEPS: ReadonlyMap<string, number> = new Map([
  [HORSE_MODEL_URL, 20],
  [LACQUER_URL, 50],
]);
const FILES_ARRIVED = 90;

const NOTHING = () => undefined;

/**
 * The app's one canvas. Shows the showcase game framed for the current screen, and hands the
 * board to a match when one asks for it. Default export: loaded lazily, with three.js.
 */
export default function PersistentScene() {
  const host = useSceneHost();
  const { stage, match, showcase, load } = useSceneHostState();
  const { setActivity, webgl } = useQuality();

  // A match takes the board once the registered transitions (demo horses going home) have run.
  const code = match?.room.code ?? null;
  const [released, setReleased] = useState<string | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => {
    if (code === null) {
      setReleased(null);
      return;
    }
    const steps = host?.matchTransitions() ?? [];
    if (steps.length === 0) {
      setReleased(code);
      return;
    }
    let live = true;
    // The match page holds the roll button back while the board is busy.
    matchRef.current?.onBusyChange?.(true);
    const limit = new Promise<void>((resolve) => setTimeout(resolve, MATCH_TRANSITION_LIMIT_MS));
    void Promise.race([Promise.allSettled(steps.map(async (step) => step())), limit]).then(() => {
      if (live) setReleased(code);
    });
    return () => {
      live = false;
    };
  }, [code, host]);
  // With nothing to wait for the match takes the board in this very render: the showcase is never
  // built just to be replaced (it would cost a software renderer the board twice).
  const immediate = code !== null && released !== code && (host?.matchTransitions().length ?? 0) === 0;
  const playing = match !== null && (released === code || immediate) ? match : null;

  // A software renderer cannot afford a moving background: after its first match (the shell
  // gives it no canvas before) it shows still pictures between matches.
  const activity = match !== null ? 'full' : webgl === 'software' ? 'paused' : stage.activity;
  useEffect(() => {
    setActivity(activity);
  }, [activity, setActivity]);
  useEffect(() => () => setActivity('full'), [setActivity]);

  // The canvas can be hidden and shown again while something inside it loads (its effects then run
  // again); a board that already drew its first picture must not go back to "building".
  useEffect(() => {
    if (load === 'loading') host?.setLoad('building');
  }, [host, load]);

  // Each file the first picture needs moves the card forward once the browser has it (cached or not).
  useEffect(() => {
    let percent = CODE_ARRIVED;
    host?.setProgress(percent);
    const waiting = new Map(FILE_STEPS);
    const arrived = (entries: PerformanceEntryList) => {
      for (const entry of entries) {
        const path = new URL(entry.name, location.href).pathname;
        const step = waiting.get(path);
        if (step === undefined) continue;
        waiting.delete(path);
        percent += step;
      }
      host?.setProgress(waiting.size === 0 ? FILES_ARRIVED : percent);
    };
    const observer = new PerformanceObserver((list) => arrived(list.getEntries()));
    observer.observe({ type: 'resource', buffered: true });
    return () => observer.disconnect();
  }, [host]);

  const idle = useMemo(idleShowcase, []);
  const shown = showcase ?? idle;
  const batches = useMemo(() => showcaseBatches(shown), [shown]);
  const latest = batches[batches.length - 1];

  if (playing) {
    return (
      <SceneCanvas
        room={playing.room}
        batches={playing.batches}
        myColor={playing.myColor}
        onPickHorse={playing.onPickHorse}
        onBusyChange={playing.onBusyChange}
        insets={playing.insets}
        eventSource={playing.eventSource}
        sourceKey={`room:${playing.room.code}`}
        view="seat"
        onReady={() => host?.setLoad('ready')}
        onFail={() => host?.setLoad('unavailable')}
        testid="scene-canvas"
      />
    );
  }
  if (!latest) return null;
  return (
    <SceneCanvas
      room={latest.room}
      batches={batches}
      myColor={null}
      onPickHorse={NOTHING}
      insets={stage.insets}
      sourceKey={`showcase:${shown.key ?? ''}`}
      view="free"
      orbit={stage.orbit}
      labelled={false}
      onReady={() => host?.setLoad('ready')}
      onFail={() => host?.setLoad('unavailable')}
      testid="scene-canvas"
    />
  );
}
