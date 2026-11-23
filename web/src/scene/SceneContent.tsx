import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import { Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { isLocked } from '../../../shared/game/engine';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import { Assets } from './assets';
import Board from './Board';
import {
  HOME_ORBIT_SECONDS,
  NO_INSETS,
  SEAT_FLIGHT_SECONDS,
  closeUpFraming,
  defaultPolar,
  farPlane,
  fitCameraDistance,
  fitOrbitDistance,
  followShare,
  freeBand,
  freeBandX,
  homePose,
  poseOf,
  posePosition,
  seatPose,
  shakeOffset,
} from './camera';
import type { CameraPose, HudInsets } from './camera';
import { paceTimings } from '../../../shared/game/pace';
import { Director } from './director';
import { useHorseModel } from './horse-model';
import type { SceneView } from './director';
import LockMarkers from './LockMarkers';
import { Celebration, Die, Horse, KickImpact } from './Pieces';
import { createSceneState } from './scene-state';
import type { SceneState } from './scene-state';
import { unconsumed } from '../room/batches';
import type { GameSceneProps, HorseLabelElements, SceneStaging } from './props';
import TetEnvironment from './environment/TetEnvironment';
import { useQuality } from './render/QualityProvider';
import RenderPipeline from './render/RenderPipeline';
import { sound } from '../audio/sound';
import { KickCamera, SHAKE_SECONDS } from './motion/kick-camera';
import { motionSetting } from './motion/motion-setting';
import { stableReturn } from './motion/stable-return';

function createView(state: SceneState, kickCamera: KickCamera): SceneView {
  // The kick being played: where it lands, and whether it is the slow-motion one (dust, flash, a chasing camera).
  let kickX = 0;
  let kickZ = 0;
  let cinematic = false;
  return {
    setHorse(color, horse, x, y, z, yaw, pitch, stretch, roll = 0) {
      const g = state.horses[color]?.[horse];
      if (!g) return;
      g.visible = true;
      g.position.set(x, y, z);
      // Order YXZ: the lean tips the horse along the way it faces, the roll to its side.
      g.rotation.set(pitch, yaw, roll);
      // Squash and stretch keep the volume: what the height gains, the footprint gives up.
      const wide = 1 / Math.sqrt(stretch);
      g.scale.set(wide, stretch, wide);
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
    moveStarted(hops, hopSeconds, kickAt, flight) {
      sound.playHooves(hops, hopSeconds, kickAt, flight);
    },
    kickStarted(x, z, contactIn, holdSeconds) {
      kickX = x;
      kickZ = z;
      cinematic = holdSeconds > 0;
      kickCamera.start(x, z, contactIn, holdSeconds);
    },
    kickLanded() {
      kickCamera.contact();
      if (cinematic) {
        state.impact.x = kickX;
        state.impact.z = kickZ;
        state.impact.t = 0;
      }
    },
    kickFollow(x, z, y, flung) {
      kickCamera.follow(x, z, y, flung);
    },
  };
}

/** Longest frame the camera timeline accepts, like the director's clock. */
const MAX_CAMERA_DT = 0.1;

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
  kickCamera: KickCamera;
}

/**
 * Camera and orbit controls. The board centre stays the orbit pivot; panels around it are answered by
 * sliding the picture window and backing the camera off, both eased so the board glides when a
 * panel opens. Taking a seat flies the camera there from wherever it was. A kick's close-up and
 * shake move the camera for single pictures only, on top of that framing.
 */
function Rig({ seat, sourceKey, insets, orbit, kickCamera }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { activity } = useQuality();
  // The player's own framing, saved while a close-up or shake has moved the camera away from it.
  const framing = useMemo(
    () => ({ away: false, position: new Vector3(), quaternion: new Quaternion(), closeUp: [0, 0, 0, 0, 0, 0], shake: [0, 0] }),
    [],
  );
  const restoreFraming = () => {
    if (!framing.away) return;
    framing.away = false;
    camera.position.copy(framing.position);
    camera.quaternion.copy(framing.quaternion);
  };
  // Runs before the orbit controls (priority -1), which must only ever see the player's framing.
  useFrame(restoreFraming, -2);
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
    restoreFraming();
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
      // The pose between the two ends, turning the shorter way round the board (as `mixPose` and
      // `posePosition` do), written out so a flight allocates nothing per frame.
      const e = easeInOut(fl.t);
      const turn = Math.atan2(Math.sin(fl.to.azimuth - fl.from.azimuth), Math.cos(fl.to.azimuth - fl.from.azimuth));
      const azimuth = fl.from.azimuth + turn * e;
      const tilt = fl.from.polar + (fl.to.polar - fl.from.polar) * e;
      const radius = (fl.from.zoom + (fl.to.zoom - fl.from.zoom) * e) * nextFit;
      const flat = radius * Math.sin(tilt);
      camera.position.set(flat * Math.sin(azimuth), radius * Math.cos(tilt), flat * Math.cos(azimuth));
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
    f.fit = nextFit;
    f.x = x;
    f.y = y;
    f.width = size.width;
    f.height = size.height;

    const c = controls.current;
    if (c) {
      c.minDistance = nextFit * 0.4;
      c.maxDistance = nextFit * MAX_ZOOM_OUT;
      c.enabled = flight.current === null;
    }

    // After the framing above and the controls: move the camera for this frame's picture only.
    kickCamera.update(Math.min(dt, MAX_CAMERA_DT));
    if (!kickCamera.active) return;
    framing.away = true;
    framing.position.copy(camera.position);
    framing.quaternion.copy(camera.quaternion);
    const p = camera.position;
    // A tall viewport already has the board edge to edge: lean in half as far, so less of it leaves the screen.
    const weight = kickCamera.weight * Math.min(1, Math.max(0.5, size.width / Math.max(1, size.height)));
    const shot = closeUpFraming(framing.closeUp, p.x, p.y, p.z, kickCamera.focusX, kickCamera.focusZ, weight, kickCamera.focusY);
    p.set(shot[0]!, shot[1]!, shot[2]!);
    camera.lookAt(shot[3]!, shot[4]!, shot[5]!);
    const s = shakeOffset(framing.shake, kickCamera.shakeTime, SHAKE_SECONDS);
    camera.translateX(s[0]!);
    camera.translateY(s[1]!);
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
        kickCamera.setUserMoving(true);
      }}
      onEnd={() => {
        dragging.current = false;
        kickCamera.setUserMoving(false);
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
  const horseModel = useHorseModel();
  const assets = useMemo(() => new Assets(horseModel), [horseModel]);
  const state = useMemo(createSceneState, []);
  const [busy, setBusy] = useState(false);
  // The settings cannot change while a match is on screen.
  const { quick, pace } = room.settings;
  const kickCamera = useMemo(() => new KickCamera(), []);
  const { activity, settings } = useQuality();
  // Read when a batch starts, so a tier change applies to the next kick.
  const cinematicKick = useRef(settings.cinematicKick);
  cinematicKick.current = settings.cinematicKick;
  const director = useMemo(
    () =>
      new Director(createView(state, kickCamera), setBusy, {
        pace: paceTimings(pace, quick),
        reducedMotion: motionSetting.isReduced,
        cinematicKick: () => cinematicKick.current,
      }),
    [state, kickCamera, quick, pace],
  );
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // The game on the board can be asked to clear it: a showcase sends its horses home before a match takes over.
  useEffect(() => stableReturn.attach(() => director.sendHome()), [director]);
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
      <TetEnvironment />

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
      {settings.cinematicKick && <KickImpact assets={assets} state={state} count={Math.min(20, Math.floor(settings.particleBudget / 16))} />}
      <Rig
        seat={view === 'seat' ? (myColor ?? 0) : null}
        sourceKey={sourceKey}
        insets={insets}
        orbit={orbit}
        kickCamera={kickCamera}
      />
    </>
  );
}
