import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import { Assets } from './assets';
import Board from './Board';
import { defaultPolar, fitCameraDistance, seatCameraPosition } from './camera';
import { Director } from './director';
import type { SceneView } from './director';
import { Celebration, Die, Horse } from './Pieces';
import { createSceneState } from './scene-state';
import type { SceneState } from './scene-state';
import type { GameSceneProps } from './props';

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
  };
}

function Rig({ myColor }: { myColor: Color | null }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const seat = useRef<{ color: Color; fit: number } | null>(null);
  const color: Color = myColor ?? 0;
  const aspect = size.width / Math.max(1, size.height);
  const fit = fitCameraDistance(aspect, camera.fov);

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

export default function SceneContent({ room, events, myColor, onPickHorse }: GameSceneProps) {
  const game = room.game;
  const assets = useMemo(() => new Assets(), []);
  const state = useMemo(createSceneState, []);
  const [busy, setBusy] = useState(false);
  const director = useMemo(() => new Director(createView(state), setBusy), [state]);

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
    if (seqRef.current === room.seq) return;
    seqRef.current = room.seq;
    if (game) director.push(game, events);
  }, [director, room.seq, game, events]);

  useFrame((_, dt) => {
    state.time += dt;
    state.pulse = 0.5 + 0.5 * Math.sin(state.time * 3.2);
    state.tap = 0.5 + 0.5 * Math.sin(state.time * 7);
    assets.haloMat.opacity = 0.55 + 0.4 * state.tap;
    director.update(dt);
  });

  if (!game) return null;

  const canPick = !busy && myColor !== null && myColor === game.turn && game.phase === 'move';
  const legal = canPick ? game.legalHorses : [];

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
      <Rig myColor={myColor} />
    </>
  );
}
