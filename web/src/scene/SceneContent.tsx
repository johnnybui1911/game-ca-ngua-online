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
import { NO_INSETS, defaultPolar, fitCameraDistance, freeBand, seatCameraPosition } from './camera';
import type { HudInsets } from './camera';
import { Director, QUICK_SEGMENT_SECONDS } from './director';
import type { SceneView } from './director';
import LockMarkers from './LockMarkers';
import { Celebration, Die, Horse } from './Pieces';
import { createSceneState } from './scene-state';
import type { SceneState } from './scene-state';
import { unconsumed } from '../room/batches';
import type { GameSceneProps, HorseLabelElements } from './props';
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

function Rig({ myColor, insets }: { myColor: Color | null; insets: HudInsets }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
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

  return (
    <OrbitControls
      ref={controls}
      makeDefault
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
      <Rig myColor={myColor} insets={insets} />
    </>
  );
}
