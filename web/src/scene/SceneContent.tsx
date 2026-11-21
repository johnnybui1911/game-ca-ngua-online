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
import { NO_INSETS, closeUpFraming, defaultPolar, fitCameraDistance, freeBand, seatCameraPosition, shakeOffset } from './camera';
import type { HudInsets } from './camera';
import { Director, QUICK_SEGMENT_SECONDS } from './director';
import type { SceneView } from './director';
import LockMarkers from './LockMarkers';
import { Celebration, Die, Horse } from './Pieces';
import { createSceneState } from './scene-state';
import type { SceneState } from './scene-state';
import { unconsumed } from '../room/batches';
import type { GameSceneProps, HorseLabelElements } from './props';
import { sound } from '../audio/sound';
import { KickCamera, SHAKE_SECONDS } from './motion/kick-camera';
import { motionSetting } from './motion/motion-setting';

function createView(state: SceneState, kickCamera: KickCamera): SceneView {
  return {
    setHorse(color, horse, x, y, z, yaw, pitch, stretch) {
      const g = state.horses[color]?.[horse];
      if (!g) return;
      g.visible = true;
      g.position.set(x, y, z);
      // Order YXZ: the lean tips the horse along the way it faces.
      g.rotation.set(pitch, yaw, 0);
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
    moveStarted(hops, hopSeconds, kickAt) {
      sound.playHooves(hops, hopSeconds, kickAt);
    },
    kickStarted(x, z, contactIn) {
      kickCamera.start(x, z, contactIn);
    },
    kickLanded() {
      kickCamera.contact();
    },
  };
}

/** Longest frame the camera timeline accepts, like the director's clock. */
const MAX_CAMERA_DT = 0.1;

function Rig({ myColor, insets, kickCamera }: { myColor: Color | null; insets: HudInsets; kickCamera: KickCamera }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const setFrameloop = useThree((s) => s.setFrameloop);
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
  // Runs after them: move the camera for this frame's picture only.
  useFrame((_, dt) => {
    kickCamera.update(Math.min(dt, MAX_CAMERA_DT));
    if (!kickCamera.active) return;
    framing.away = true;
    framing.position.copy(camera.position);
    framing.quaternion.copy(camera.quaternion);
    const p = camera.position;
    // A tall viewport already has the board edge to edge: lean in half as far, so less of it leaves the screen.
    const weight = kickCamera.weight * Math.min(1, Math.max(0.5, size.width / Math.max(1, size.height)));
    const f = closeUpFraming(framing.closeUp, p.x, p.y, p.z, kickCamera.focusX, kickCamera.focusZ, weight);
    p.set(f[0]!, f[1]!, f[2]!);
    camera.lookAt(f[3]!, f[4]!, f[5]!);
    const s = shakeOffset(framing.shake, kickCamera.shakeTime, SHAKE_SECONDS);
    camera.translateX(s[0]!);
    camera.translateY(s[1]!);
  });
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const seat = useRef<{ color: Color; fit: number } | null>(null);
  const color: Color = myColor ?? 0;
  const aspect = size.width / Math.max(1, size.height);
  const band = freeBand(insets, size.height);
  const fit = fitCameraDistance(aspect, camera.fov, defaultPolar(aspect), band.fraction);

  // Slide the picture window so the board centre (the orbit pivot) sits in the middle of the band the HUD leaves free.
  useLayoutEffect(() => {
    camera.setViewOffset(size.width, size.height, 0, band.shiftPx, size.width, size.height);
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height, band.shiftPx]);

  useLayoutEffect(() => {
    restoreFraming();
    const prev = seat.current;
    if (!prev || prev.color !== color) {
      camera.position.set(...seatCameraPosition(color, fit, defaultPolar(aspect)));
      camera.lookAt(0, 0, 0);
    } else if (Math.abs(prev.fit - fit) / prev.fit > 0.03) {
      // Window resized: keep the viewing direction, rescale the distance.
      camera.position.multiplyScalar(fit / prev.fit);
    }
    seat.current = { color, fit };
    controls.current?.update();
  }, [camera, color, fit, aspect]);

  // No rendering while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setFrameloop]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => kickCamera.setUserMoving(true)}
      onEnd={() => kickCamera.setUserMoving(false)}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.7}
      minDistance={fit * 0.4}
      maxDistance={fit * 1.25}
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      target={[0, 0, 0]}
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
}: GameSceneProps & { insets?: HudInsets; labels?: HorseLabelElements }) {
  const game = room.game;
  const assets = useMemo(() => new Assets(), []);
  const state = useMemo(createSceneState, []);
  const [busy, setBusy] = useState(false);
  // The setting cannot change while a match is on screen.
  const quick = room.settings.quick;
  const kickCamera = useMemo(() => new KickCamera(), []);
  const director = useMemo(
    () =>
      new Director(createView(state, kickCamera), setBusy, {
        ...(quick ? { budgetPerSegment: QUICK_SEGMENT_SECONDS } : {}),
        reducedMotion: motionSetting.isReduced,
      }),
    [state, kickCamera, quick],
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

  // Colours (and so the horse meshes) changed, or first mount: show the game as it is.
  useEffect(() => {
    if (gameRef.current) director.reset(gameRef.current);
  }, [director, colorsKey]);

  useEffect(() => {
    if (seqRef.current === null) {
      seqRef.current = room.seq;
      return;
    }
    const fresh = unconsumed(batches, seqRef.current);
    if (fresh.length === 0) return;
    seqRef.current = fresh[fresh.length - 1]?.room.seq ?? seqRef.current;
    for (const batch of fresh) if (batch.room.game) director.push(batch.room.game, batch.events);
  }, [director, room.seq, batches]);

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
      <hemisphereLight args={['#fff1dc', '#7a5a40', 1.15]} />
      <directionalLight
        position={[6, 15, 9]}
        intensity={2.3}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-9, 7, -7]} intensity={0.55} color="#c9d8ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <shadowMaterial opacity={0.38} />
      </mesh>

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
      <Rig myColor={myColor} insets={insets} kickCamera={kickCamera} />
    </>
  );
}
