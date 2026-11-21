import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { isLocked } from '../../../shared/game/engine';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import { Assets } from './assets';
import Board from './Board';
import {
  HOME_ORBIT_SECONDS,
  NO_INSETS,
  SEAT_FLIGHT_SECONDS,
  defaultPolar,
  farPlane,
  fitCameraDistance,
  fitOrbitDistance,
  followShare,
  freeBand,
  freeBandX,
  homePose,
  mixPose,
  poseOf,
  posePosition,
  seatPose,
} from './camera';
import type { CameraPose, HudInsets } from './camera';
import { Director, QUICK_SEGMENT_SECONDS } from './director';
import type { SceneView } from './director';
import LockMarkers from './LockMarkers';
import { Celebration, Die, Horse } from './Pieces';
import { createSceneState } from './scene-state';
import type { SceneState } from './scene-state';
import { unconsumed } from '../room/batches';
import type { GameSceneProps, HorseLabelElements, SceneStaging } from './props';
import { useQuality } from './render/QualityProvider';
import RenderPipeline from './render/RenderPipeline';
import { sound } from '../audio/sound';

function createView(state: SceneState): SceneView {
  return {
    setHorse(color, horse, x, y, z, yaw) {
      const g = state.horses[color]?.[horse];
      if (!g) return;
      g.visible = true;
      g.position.set(x, y, z);
      g.rotation.y = yaw;
    },
    setDie(visible, x, y, z, rx, ry, rz) {
      const g = state.die;
      if (!g) return;
      g.visible = visible;
      if (visible) {
        g.position.set(x, y, z);
        g.rotation.set(rx, ry, rz);
      }
    },
    setActive(color) {
      state.active = color;
    },
    setCelebration(color, t) {
      state.celebration.color = color;
      state.celebration.t = t;
    },
    moveStarted(hops, hopSeconds, kickAt) {
      sound.playHooves(hops, hopSeconds, kickAt);
    },
  };
}

const UP = new Vector3(0, 1, 0);
/** How far past the fitted distance the player may zoom out. */
const MAX_ZOOM_OUT = 1.25;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

interface RigProps {
  /** Colour whose seat the camera takes; null leaves the camera free (home orbit). */
  seat: Color | null;
  /** Changes with the game on the board: a new game with a seat is flown to. */
  sourceKey: string;
  insets: HudInsets;
  orbit: boolean;
}

/**
 * Camera and orbit controls. The board centre stays the orbit pivot; panels around it are answered by
 * sliding the picture window and backing the camera off, both eased so the board glides when a
 * panel opens. Taking a seat flies the camera there from wherever it was.
 */
function Rig({ seat, sourceKey, insets, orbit }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { activity } = useQuality();
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const aspect = size.width / Math.max(1, size.height);
  const band = freeBand(insets, size.height);
  const bandX = freeBandX(insets, size.width);
  const polar = defaultPolar(aspect);
  // A seat looks along an arm; a free camera may be anywhere around the board, so it backs off for the corners.
  const fit = (seat === null ? fitOrbitDistance : fitCameraDistance)(aspect, camera.fov, polar, band.fraction, bandX.fraction);
  // A paused canvas only draws single frames on request, so nothing can be eased there.
  const instant = activity === 'paused' || prefersReducedMotion();

  /** Framing as currently drawn; follows `fit` and the band shifts. */
  const frame = useRef<{ fit: number; x: number; y: number; width: number; height: number } | null>(null);
  const placed = useRef<string | null>(null);
  const flight = useRef<{ from: CameraPose; to: CameraPose; t: number } | null>(null);
  const dragging = useRef(false);

  useLayoutEffect(() => () => camera.clearViewOffset(), [camera]);

  useLayoutEffect(() => {
    const key = `${sourceKey}:${seat ?? 'free'}`;
    if (!frame.current) {
      // First picture: no flight, the camera starts where it belongs.
      frame.current = { fit, x: bandX.shiftPx, y: band.shiftPx, width: size.width, height: size.height };
      camera.position.set(...posePosition(seat === null ? homePose(polar) : seatPose(seat, polar), fit));
      camera.lookAt(0, 0, 0);
      camera.far = farPlane(fit * MAX_ZOOM_OUT);
      camera.setViewOffset(size.width, size.height, bandX.shiftPx, band.shiftPx, size.width, size.height);
    } else if (placed.current !== key && seat !== null) {
      const to = seatPose(seat, polar);
      if (instant) {
        flight.current = null;
        camera.position.set(...posePosition(to, frame.current.fit));
        camera.lookAt(0, 0, 0);
      } else {
        flight.current = { from: poseOf(camera.position.toArray(), frame.current.fit), to, t: 0 };
      }
    }
    placed.current = key;
    const c = controls.current;
    if (c) {
      c.minDistance = frame.current.fit * 0.4;
      c.maxDistance = frame.current.fit * MAX_ZOOM_OUT;
      c.update();
    }
    // Only a new seat or game places the camera; the framing is followed in the frame loop below.
  }, [camera, seat, sourceKey]);

  useFrame((_, dt) => {
    const f = frame.current;
    if (!f) return;
    const resized = f.width !== size.width || f.height !== size.height;
    const k = instant || resized ? 1 : followShare(dt);
    const follow = (from: number, to: number, snap: number) => (Math.abs(to - from) < snap ? to : from + (to - from) * k);
    const nextFit = follow(f.fit, fit, f.fit * 0.001);
    const x = follow(f.x, bandX.shiftPx, 0.25);
    const y = follow(f.y, band.shiftPx, 0.25);

    const fl = flight.current;
    if (fl) {
      fl.t = instant ? 1 : Math.min(1, fl.t + dt / SEAT_FLIGHT_SECONDS);
      camera.position.set(...posePosition(mixPose(fl.from, fl.to, easeInOut(fl.t)), nextFit));
      camera.lookAt(0, 0, 0);
      if (fl.t >= 1) flight.current = null;
    } else {
      if (nextFit !== f.fit) camera.position.multiplyScalar(nextFit / f.fit);
      if (orbit && seat === null && !dragging.current && !instant) {
        camera.position.applyAxisAngle(UP, (dt * 2 * Math.PI) / HOME_ORBIT_SECONDS);
        camera.lookAt(0, 0, 0);
      }
    }
    const far = farPlane(nextFit * MAX_ZOOM_OUT);
    const refar = camera.far !== far;
    camera.far = far;
    // Setting the view offset also rebuilds the projection.
    if (refar || resized || x !== f.x || y !== f.y) camera.setViewOffset(size.width, size.height, x, y, size.width, size.height);
    frame.current = { fit: nextFit, x, y, width: size.width, height: size.height };

    const c = controls.current;
    if (c) {
      c.minDistance = nextFit * 0.4;
      c.maxDistance = nextFit * MAX_ZOOM_OUT;
      c.enabled = flight.current === null;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={seat !== null}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.7}
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      target={[0, 0, 0]}
      onStart={() => {
        dragging.current = true;
      }}
      onEnd={() => {
        dragging.current = false;
      }}
    />
  );
}

/** Height above a horse's base at which its label sits, in board units. */
const LABEL_HEIGHT = 1.75;

export default function SceneContent({
  room,
  batches,
  myColor,
  onPickHorse,
  onBusyChange,
  insets = NO_INSETS,
  labels,
  sourceKey = 'match',
  view = 'seat',
  orbit = false,
}: GameSceneProps & SceneStaging & { insets?: HudInsets; labels?: HorseLabelElements }) {
  const game = room.game;
  const assets = useMemo(() => new Assets(), []);
  const state = useMemo(createSceneState, []);
  const [busy, setBusy] = useState(false);
  // The setting cannot change while a match is on screen.
  const quick = room.settings.quick;
  const director = useMemo(
    () => new Director(createView(state), setBusy, quick ? { budgetPerSegment: QUICK_SEGMENT_SECONDS } : {}),
    [state, quick],
  );
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // A board that goes away (WebGL loss, leaving the match) must not leave the page waiting on it.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const projected = useMemo(() => new Vector3(), []);

  useEffect(() => () => assets.dispose(), [assets]);

  const colorsKey = game ? game.colors.join(',') : '';
  const seqRef = useRef<number | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  // Colours (and so the horse meshes) or the game itself changed, or first mount: show the game as it is.
  useEffect(() => {
    if (gameRef.current) director.reset(gameRef.current);
  }, [director, colorsKey, sourceKey]);

  const sourceRef = useRef(sourceKey);
  useEffect(() => {
    if (sourceRef.current !== sourceKey) {
      // Another game took the board: its history is not this scene's to animate.
      sourceRef.current = sourceKey;
      seqRef.current = null;
    }
    if (seqRef.current === null) {
      seqRef.current = room.seq;
      return;
    }
    const fresh = unconsumed(batches, seqRef.current);
    if (fresh.length === 0) return;
    seqRef.current = fresh[fresh.length - 1]?.room.seq ?? seqRef.current;
    for (const batch of fresh) if (batch.room.game) director.push(batch.room.game, batch.events);
  }, [director, room.seq, batches, sourceKey]);

  // A paused canvas has no frame loop: draw one picture whenever what it shows changes.
  const { activity } = useQuality();
  const advance = useThree((s) => s.advance);
  const left = insets.left ?? 0;
  const right = insets.right ?? 0;
  useEffect(() => {
    if (activity !== 'paused') return;
    let frames = 2;
    let id = requestAnimationFrame(function draw() {
      advance(performance.now() / 1000);
      if (--frames > 0) id = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(id);
  }, [activity, advance, size.width, size.height, insets.top, insets.bottom, left, right, myColor, sourceKey, view, room.seq]);

  useFrame((_, dt) => {
    state.time += dt;
    state.pulse = 0.5 + 0.5 * Math.sin(state.time * 3.2);
    state.tap = 0.5 + 0.5 * Math.sin(state.time * 7);
    assets.haloMat.opacity = 0.55 + 0.4 * state.tap;
    director.update(dt);
    // Labels are DOM nodes over the canvas: place each one above its horse, hidden with it.
    // Matrices are refreshed here because the renderer only updates them after this callback.
    if (!labels) return;
    camera.updateMatrixWorld();
    for (let color = 0; color < labels.length; color++) {
      const row = labels[color] ?? [];
      for (let horse = 0; horse < row.length; horse++) {
        const el = row[horse];
        const group = state.horses[color]?.[horse];
        if (!el) continue;
        if (!group?.visible) {
          el.style.display = 'none';
          continue;
        }
        group.getWorldPosition(projected);
        projected.y += LABEL_HEIGHT;
        projected.project(camera);
        if (projected.z > 1) {
          el.style.display = 'none';
          continue;
        }
        const x = ((projected.x + 1) / 2) * size.width;
        const y = ((1 - projected.y) / 2) * size.height;
        el.style.display = '';
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  });

  if (!game) return null;

  const canPick = !busy && myColor !== null && myColor === game.turn && game.phase === 'move';
  const legal = canPick ? game.legalHorses : [];
  const lockedColors = game.colors.filter((c) => isLocked(game, c));

  return (
    <>
      <RenderPipeline />

      <Board assets={assets} state={state} colors={game.colors} />
      {lockedColors.length > 0 && <LockMarkers assets={assets} locked={lockedColors} />}
      <Die assets={assets} state={state} />
      {game.colors.flatMap((color) =>
        Array.from({ length: HORSES_PER_COLOR }, (_, index) => (
          <Horse
            key={`${color}-${index}`}
            assets={assets}
            state={state}
            color={color}
            index={index}
            pickable={color === game.turn && legal.includes(index)}
            onPick={onPickHorse}
          />
        )),
      )}
      <Celebration assets={assets} state={state} />
      <Rig seat={view === 'seat' ? (myColor ?? 0) : null} sourceKey={sourceKey} insets={insets} orbit={orbit} />
    </>
  );
}
