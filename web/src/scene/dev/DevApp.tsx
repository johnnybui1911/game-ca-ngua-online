/**
 * Development-only harness: plays a local game with the real engine and CPU
 * and feeds each step to GameScene as a server batch would.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { applyMove, applyRoll, createGame } from '../../../../shared/game/engine';
import { chooseCpuMove } from '../../../../shared/game/cpu';
import { DEFAULT_CPU_LEVEL, isCpuLevel, type CpuLevel } from '../../../../shared/game/cpu-level';
import type { DiceValue, GameEvent, GameState } from '../../../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS, SEAT_COLORS } from '../../../../shared/protocol';
import type { RoomSnapshot } from '../../../../shared/protocol';
import { defaultPolar, fitCameraDistance, seatCameraPosition } from '../camera';
import GameScene from '../GameScene';
import { STABLE, horseGround } from '../layout';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `?level=easy|normal|hard` makes the harness CPUs play at that level (default Thường). */
/** `?quick=1` plays the quick match variant at quick pace. */
function devQuick(): boolean {
  return new URLSearchParams(window.location.search).get('quick') === '1';
}

function devLevel(): CpuLevel {
  const level = new URLSearchParams(window.location.search).get('level');
  return isCpuLevel(level) ? level : DEFAULT_CPU_LEVEL;
}

interface Step {
  game: GameState;
  events: GameEvent[];
  seq: number;
}

function snapshot(step: Step, players: number): RoomSnapshot {
  const colors = SEAT_COLORS[players] ?? SEAT_COLORS[4]!;
  return {
    code: 'DEV000',
    name: 'Scene dev',
    visibility: 'private',
    hostId: 'dev',
    status: step.game.phase === 'finished' ? 'finished' : 'playing',
    seats: colors.map((color) => ({ color, occupant: { kind: 'cpu' as const, name: `CPU ${color}` }, horseNames: ['', '', '', ''], auto: false })),
    game: step.game,
    turnDeadline: null,
    paused: false,
    cpuLevel: devLevel(),
    settings: { ...DEFAULT_ROOM_SETTINGS, quick: devQuick() },
    seq: step.seq,
  };
}

const bar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  padding: '6px 10px',
  background: '#2b1d16',
  color: '#f4e7cf',
  font: '13px system-ui, sans-serif',
};

export default function DevApp() {
  const [players, setPlayers] = useState(4);
  const [seed, setSeed] = useState(7);
  const [delay, setDelay] = useState(700);
  const [playMe, setPlayMe] = useState(false);
  const [paused, setPaused] = useState(false);
  const [picks, setPicks] = useState(0);
  const rng = useRef(mulberry32(seed));
  const [step, setStep] = useState<Step>(() => ({ game: createGame(SEAT_COLORS[4]!, devQuick() ? 'quick' : 'classic'), events: [], seq: 1 }));

  const restart = useCallback((count: number, nextSeed: number) => {
    rng.current = mulberry32(nextSeed);
    setStep((prev) => ({ game: createGame(SEAT_COLORS[count]!, devQuick() ? 'quick' : 'classic'), events: [], seq: prev.seq + 1 }));
  }, []);

  const advance = useCallback((fn: (g: GameState) => { state: GameState; events: GameEvent[] }) => {
    setStep((prev) => {
      const r = fn(prev.game);
      return { game: r.state, events: r.events, seq: prev.seq + 1 };
    });
  }, []);

  const roll = useCallback(() => {
    advance((g) => applyRoll(g, (1 + Math.floor(rng.current() * 6)) as DiceValue));
  }, [advance]);

  const { game } = step;
  const humanTurn = playMe && game.turn === 0;

  useEffect(() => {
    if (game.phase === 'finished' || paused || humanTurn) return;
    const id = window.setTimeout(() => {
      if (game.phase === 'roll') roll();
      else advance((g) => applyMove(g, chooseCpuMove(g, devLevel())));
    }, delay);
    return () => window.clearTimeout(id);
  }, [game, paused, humanTurn, delay, roll, advance, step.seq]);

  const onPickHorse = useCallback(
    (horse: number) => {
      setPicks((n) => n + 1);
      advance((g) => applyMove(g, horse));
    },
    [advance],
  );

  const room = useMemo(() => snapshot(step, players), [step, players]);
  // The harness renders every step, so each batch is the whole queue.
  const batches = useMemo(() => [{ room, events: step.events }], [room, step.events]);
  const stateText = `turn=${game.turn} phase=${game.phase} dice=${game.dice ?? '-'} winner=${game.winner ?? '-'} seq=${step.seq}`;

  // Page coordinates of a red horse for automated picking tests; valid while the camera is untouched.
  const sceneBox = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  useEffect(() => {
    const cam = new PerspectiveCamera(40, 1, 0.5, 200);
    const v = new Vector3();
    (window as unknown as Record<string, unknown>).__scenePos = (horse: number) => {
      const box = sceneBox.current?.getBoundingClientRect();
      const pos = gameRef.current.horses[0]?.[horse];
      if (!box || pos === undefined) return null;
      cam.aspect = box.width / box.height;
      cam.position.set(...seatCameraPosition(0, fitCameraDistance(cam.aspect, cam.fov), defaultPolar(cam.aspect)));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const g = pos < 0 ? STABLE[0]![horse]! : horseGround(0, horse, pos);
      v.set(g.x, 0.55, g.z).project(cam);
      return { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={bar}>
        <label>
          Người chơi{' '}
          <select
            value={players}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPlayers(n);
              restart(n, seed);
            }}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          Seed{' '}
          <input
            type="number"
            value={seed}
            style={{ width: 64 }}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>
        <button onClick={() => restart(players, seed)}>Ván mới</button>
        <label>
          Nhịp {delay} ms{' '}
          <input type="range" min={5} max={1500} step={5} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={playMe} onChange={(e) => setPlayMe(e.target.checked)} /> Tự chơi màu đỏ
        </label>
        <label>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Tạm dừng
        </label>
        {humanTurn && game.phase === 'roll' && (
          <button id="roll" onClick={roll}>
            Tung xúc xắc
          </button>
        )}
        <span id="status" data-turn={game.turn} data-phase={game.phase} data-winner={game.winner ?? ''} data-picks={picks} data-legal={game.legalHorses.join(',')} data-seq={step.seq}>
          {stateText} picks={picks}
        </span>
      </div>
      <div ref={sceneBox} style={{ flex: 1, minHeight: 0 }}>
        <GameScene room={room} batches={batches} myColor={playMe ? 0 : null} onPickHorse={onPickHorse} />
      </div>
    </div>
  );
}
