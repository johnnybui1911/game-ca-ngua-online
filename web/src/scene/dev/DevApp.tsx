/**
 * Development-only harness: plays a local game with the real engine and CPU
 * and feeds each step to GameScene as a server batch would.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_CPU_LEVEL, isCpuLevel, type CpuLevel } from '../../../../shared/game/cpu-level';
import { DEFAULT_PACE, isPaceName, paceTimings, pauseSeconds, type PaceName } from '../../../../shared/game/pace';
import { DEFAULT_ROOM_SETTINGS, SEAT_COLORS } from '../../../../shared/protocol';
import type { RoomSnapshot } from '../../../../shared/protocol';
import { DemoDriver } from '../../demo/demo-driver';
import { defaultPolar, fitCameraDistance, seatCameraPosition } from '../camera';
import GameScene from '../GameScene';
import { STABLE, horseGround } from '../layout';
import type { ShowcaseStep } from '../props';

/** `?level=easy|normal|hard` makes the harness CPUs play at that level (default Thường). */
/** `?quick=1` plays the quick match variant with the quick table of the pace. */
function devQuick(): boolean {
  return devFlag('quick');
}

/**
 * `?server=1` starts with "Nhịp máy chủ" on: every colour plays as a CPU does in a room, a roll and its move in
 * one batch, the next one after the pause the server would leave. `?paused=1` starts paused.
 */
function devFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === '1';
}

function devLevel(): CpuLevel {
  const level = new URLSearchParams(window.location.search).get('level');
  return isCpuLevel(level) ? level : DEFAULT_CPU_LEVEL;
}

/** `?pace=nhanh|vua|thu-thai` is the harness room's "Nhịp ván" (default Vừa). */
function devPace(): PaceName {
  const pace = new URLSearchParams(window.location.search).get('pace');
  return isPaceName(pace) ? pace : DEFAULT_PACE;
}

const DEFAULT_SEED = 7;

function snapshot(step: ShowcaseStep, players: number): RoomSnapshot {
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
    settings: { ...DEFAULT_ROOM_SETTINGS, quick: devQuick(), pace: devPace() },
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
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [delay, setDelay] = useState(700);
  const [likeServer, setLikeServer] = useState(() => devFlag('server'));
  const [playMe, setPlayMe] = useState(false);
  const [paused, setPaused] = useState(() => devFlag('paused'));
  const [picks, setPicks] = useState(0);
  // The game lives outside React state: the die is drawn once per action, whatever React re-runs.
  const [driver] = useState(
    () => new DemoDriver({ seed: DEFAULT_SEED, colors: SEAT_COLORS[4]!, variant: devQuick() ? 'quick' : 'classic', level: devLevel() }),
  );
  const step = useSyncExternalStore(driver.subscribe, driver.getStep);

  const restart = (count: number, nextSeed: number) => driver.deal({ colors: SEAT_COLORS[count]!, seed: nextSeed });

  const { game } = step;
  const humanTurn = playMe && game.turn === 0;

  useEffect(() => {
    if (game.phase === 'finished' || paused || humanTurn) return;
    const wait = likeServer ? pauseSeconds(step.events, paceTimings(devPace(), devQuick())) * 1000 : delay;
    const id = window.setTimeout(() => {
      if (driver.game.phase !== 'roll') driver.cpuMove();
      else if (likeServer) driver.playTurn();
      else driver.roll();
    }, wait);
    return () => window.clearTimeout(id);
  }, [driver, game, step, paused, humanTurn, delay, likeServer]);

  const onPickHorse = useCallback(
    (horse: number) => {
      setPicks((n) => n + 1);
      driver.move(horse);
    },
    [driver],
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
          <input id="like-server" type="checkbox" checked={likeServer} onChange={(e) => setLikeServer(e.target.checked)} /> Nhịp máy chủ (
          {devPace()})
        </label>
        <label>
          <input type="checkbox" checked={playMe} onChange={(e) => setPlayMe(e.target.checked)} /> Tự chơi màu đỏ
        </label>
        <label>
          <input id="paused" type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Tạm dừng
        </label>
        {humanTurn && game.phase === 'roll' && (
          <button id="roll" onClick={() => driver.roll()}>
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
