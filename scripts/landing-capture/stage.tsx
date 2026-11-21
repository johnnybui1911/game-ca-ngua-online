/**
 * Capture stage for the landing page rule illustrations: mounts the real GameScene on a
 * staged position, then replays one roll and move through the real rules engine so the
 * scene animates it exactly as a server batch would. Driven by capture-landing-media.mjs.
 *
 * `?stage=ra-chuong|da-ngua|ve-dich` picks the position; `window.__stage.play()` runs the move.
 */
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PerspectiveCamera, Vector3 } from 'three';
import { applyMove, applyRoll, createGame } from '../../shared/game/engine';
import { DEFAULT_CPU_LEVEL } from '../../shared/game/cpu-level';
import type { Color, DiceValue, GameState, HorsePos } from '../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS, SEAT_COLORS } from '../../shared/protocol';
import type { RoomSnapshot } from '../../shared/protocol';
import type { StateBatch } from '../../web/src/room/batches';
import { defaultPolar, fitCameraDistance, seatCameraPosition } from '../../web/src/scene/camera';
import GameScene from '../../web/src/scene/GameScene';
import { horseGround } from '../../web/src/scene/layout';

/** A board point: horse `horse` of `color` at position `pos` (its stable slot when -1). */
type Point = [color: Color, horse: number, pos: HorsePos];

interface Stage {
  /** horses[color][horse] before the move; red (0) is to play. */
  horses: HorsePos[][];
  dice: DiceValue;
  /** Red horse that moves. */
  horse: number;
  /** Seat the camera looks from. */
  seat: Color;
  /** Board points whose centroid frames the crop. */
  focus: Point[];
}

const STAGES: Record<string, Stage> = {
  // Red rolls 6 and brings a horse out of the stable onto its start cell.
  'ra-chuong': {
    horses: [[-1, -1, -1, 23], [10, -1, -1, 30], [5, -1, -1, -1], [20, -1, -1, -1]],
    dice: 6,
    horse: 0,
    seat: 0,
    focus: [[0, 0, -1], [0, 3, -1], [0, 0, 0], [0, 0, 2]],
  },
  // Red at progress 2 rolls 4 and lands on the blue horse at absolute cell 6, kicking it home.
  'da-ngua': {
    horses: [[-1, -1, 30, 2], [48, 12, -1, -1], [9, -1, -1, -1], [33, -1, -1, -1]],
    dice: 4,
    horse: 3,
    seat: 0,
    focus: [[0, 3, 2], [0, 3, 6], [0, 3, 6], [1, 0, -1]],
  },
  // Red at its gate rolls 4 and climbs to step 4, below the horses already on steps 5 and 6;
  // seen from the blue seat so the home column runs across the frame.
  've-dich': {
    horses: [[61, 60, 55, 41], [20, -1, -1, -1], [3, -1, -1, -1], [8, -1, -1, -1]],
    dice: 4,
    horse: 2,
    seat: 1,
    focus: [[0, 2, 55], [0, 2, 58], [0, 0, 61]],
  },
};

const stageName = new URLSearchParams(window.location.search).get('stage') ?? 'ra-chuong';
const stage = STAGES[stageName];
if (!stage) throw new Error(`Unknown stage ${stageName}`);

function snapshot(game: GameState, seq: number): RoomSnapshot {
  const colors = SEAT_COLORS[4]!;
  return {
    code: 'CAPTURE',
    name: 'Capture',
    visibility: 'private',
    hostId: 'capture',
    status: 'playing',
    seats: colors.map((color) => ({ color, occupant: { kind: 'cpu' as const, name: `CPU ${color}` }, horseNames: ['', '', '', ''], auto: false })),
    game,
    turnDeadline: null,
    paused: false,
    cpuLevel: DEFAULT_CPU_LEVEL,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    seq,
  };
}

function initialGame(s: Stage): GameState {
  const game = createGame(SEAT_COLORS[4]!);
  return { ...game, horses: s.horses.map((row) => row.slice()), turn: 0, phase: 'roll', dice: null, legalHorses: [] };
}

/** Page centroid of board points for the camera the scene starts with at `seat`. */
function project(seat: Color, points: Point[]): { x: number; y: number } | null {
  const box = document.querySelector('[data-testid="game-scene"]')?.getBoundingClientRect();
  if (!box) return null;
  const cam = new PerspectiveCamera(40, box.width / box.height, 0.5, 200);
  cam.position.set(...seatCameraPosition(seat, fitCameraDistance(cam.aspect, cam.fov), defaultPolar(cam.aspect)));
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const v = new Vector3();
  let x = 0;
  let y = 0;
  for (const [color, horse, pos] of points) {
    const g = horseGround(color, horse, pos);
    v.set(g.x, 0.3, g.z).project(cam);
    x += box.left + ((v.x + 1) / 2) * box.width;
    y += box.top + ((1 - v.y) / 2) * box.height;
  }
  return { x: x / points.length, y: y / points.length };
}

function Stage({ s }: { s: Stage }) {
  const [batches, setBatches] = useState<StateBatch[]>(() => {
    const game = initialGame(s);
    return [{ room: snapshot(game, 1), events: [] }];
  });
  const room = batches[batches.length - 1]!.room;

  const play = useCallback(() => {
    setBatches((prev) => {
      const start = prev[prev.length - 1]!.room;
      const rolled = applyRoll(start.game!, s.dice);
      const moved = applyMove(rolled.state, s.horse);
      return [
        ...prev,
        { room: snapshot(rolled.state, start.seq + 1), events: rolled.events },
        { room: snapshot(moved.state, start.seq + 2), events: moved.events },
      ];
    });
  }, [s]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__stage = { play, focus: () => project(s.seat, s.focus) };
  }, [play, s]);

  const onBusyChange = useCallback((busy: boolean) => {
    document.body.dataset.busy = busy ? '1' : '0';
  }, []);

  return (
    <div style={{ height: '100%' }}>
      <GameScene room={room} batches={batches} myColor={s.seat} onPickHorse={() => {}} onBusyChange={onBusyChange} />
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <Stage s={stage} />
  </StrictMode>,
);
