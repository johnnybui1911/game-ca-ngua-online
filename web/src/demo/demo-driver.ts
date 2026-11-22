/**
 * A whole game played in the browser: the shared rules engine, the shared CPU and a seeded die.
 * No React, no timers, no I/O: callers decide when the next action happens (the home page's demo
 * on a clock, the scene dev harness on its own controls) and read the steps it produced. All
 * randomness is drawn inside the methods, never inside a state updater, so the same seed always
 * plays the same game.
 */
import { chooseCpuMove } from '../../../shared/game/cpu';
import { DEFAULT_CPU_LEVEL } from '../../../shared/game/cpu-level';
import type { CpuLevel } from '../../../shared/game/cpu-level';
import { applyMove, applyRoll, createGame, segmentsOf } from '../../../shared/game/engine';
import { mulberry32 } from '../../../shared/game/seeded-random';
import { COLORS, POS_STABLE } from '../../../shared/game/types';
import type { Color, DiceValue, GameEvent, GameState, RuleVariant } from '../../../shared/game/types';
import type { ShowcaseStep } from '../scene/props';

export interface DemoDeal {
  /** Seed of the die (and of an Easy CPU's choices). Default: the previous game's seed plus one. */
  seed?: number;
  /** Colours taking part. Default: as in the previous game. */
  colors?: readonly Color[];
}

export interface DemoDriverOptions {
  seed: number;
  /** Default: all four. */
  colors?: readonly Color[];
  variant?: RuleVariant;
  level?: CpuLevel;
  /** True starts with every horse in its stable and no game dealt; `deal()` starts the first one. */
  parked?: boolean;
  /** Steps kept for consumers that read several at once. */
  history?: number;
}

/** Steps a consumer can still be behind by; the scene snaps to the newest beyond a few anyway. */
const DEFAULT_HISTORY = 8;

/** Seconds of board animation one animated segment (a roll or a move) is given at the demo's pace. */
export const DEMO_SEGMENT_SECONDS = 0.4;

/** Seconds the board needs for a step before the next one may follow. */
export function stepSeconds(step: ShowcaseStep): number {
  return DEMO_SEGMENT_SECONDS * Math.max(1, segmentsOf(step.events));
}

/** The board at rest for these colours: nothing rolled, nobody to move. */
function parkedGame(colors: readonly Color[], variant: RuleVariant): GameState {
  return { ...createGame([...colors], 'classic'), ...(variant === 'quick' ? { variant } : {}) };
}

export class DemoDriver {
  private readonly variant: RuleVariant;
  private readonly level: CpuLevel;
  private readonly history: number;
  private readonly listeners = new Set<() => void>();
  private colors: readonly Color[];
  private nextSeed: number;
  private rand: () => number;
  private steps: ShowcaseStep[];
  private isParked: boolean;
  private actionCount = 0;

  constructor(options: DemoDriverOptions) {
    this.variant = options.variant ?? 'classic';
    this.level = options.level ?? DEFAULT_CPU_LEVEL;
    this.history = Math.max(1, options.history ?? DEFAULT_HISTORY);
    this.colors = options.colors ?? COLORS;
    this.rand = mulberry32(options.seed);
    this.isParked = options.parked === true;
    // A parked driver has not used its seed yet: the first deal plays it.
    this.nextSeed = this.isParked ? options.seed : options.seed + 1;
    const game = this.isParked ? parkedGame(this.colors, this.variant) : createGame([...this.colors], this.variant);
    this.steps = [{ seq: 1, game, events: [] }];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Steps in `seq` order, newest last; a new array after every action. */
  getSteps = (): ShowcaseStep[] => this.steps;

  /** The newest step. */
  getStep = (): ShowcaseStep => {
    const step = this.steps[this.steps.length - 1];
    if (!step) throw new Error('the demo has no step');
    return step;
  };

  get game(): GameState {
    return this.getStep().game;
  }

  /** True while no game is dealt: every horse stands in its stable. */
  get parked(): boolean {
    return this.isParked;
  }

  get finished(): boolean {
    return this.game.phase === 'finished';
  }

  /** Rolls and moves made in the current game. */
  get actions(): number {
    return this.actionCount;
  }

  /**
   * Starts another game. Dealt onto a board at rest, the horses that start on the track are
   * reported as moves out of their stables, so the board animates them out; dealt over a game
   * in progress it carries no events and the board shows it at once.
   */
  deal(deal: DemoDeal = {}): ShowcaseStep {
    const fromRest = this.game.horses.every((row) => row.every((pos) => pos === POS_STABLE));
    const seed = deal.seed ?? this.nextSeed;
    this.nextSeed = seed + 1;
    this.colors = deal.colors ?? this.colors;
    this.rand = mulberry32(seed);
    this.isParked = false;
    this.actionCount = 0;
    const game = createGame([...this.colors], this.variant);
    const events: GameEvent[] = [];
    if (fromRest) {
      for (const color of game.colors) {
        game.horses[color]?.forEach((pos, horse) => {
          if (pos !== POS_STABLE) events.push({ type: 'moved', color, horse, from: POS_STABLE, to: pos, kicked: null });
        });
      }
      if (events.length > 0) events.push({ type: 'turn', color: game.turn, extraRoll: false });
    }
    return this.commit(game, events);
  }

  /** Ends the game on the board: every horse back in its stable, nothing to roll. No step when already parked. */
  park(): ShowcaseStep {
    if (this.isParked) return this.getStep();
    this.isParked = true;
    return this.commit(parkedGame(this.colors, this.variant), []);
  }

  /** Rolls the die for the colour whose turn it is. */
  roll(): ShowcaseStep {
    const rolled = applyRoll(this.playable('roll'), this.drawDie());
    this.actionCount++;
    return this.commit(rolled.state, rolled.events);
  }

  /** Moves `horse`, one of the legal horses of the colour that rolled. */
  move(horse: number): ShowcaseStep {
    const moved = applyMove(this.playable('move'), horse);
    this.actionCount++;
    return this.commit(moved.state, moved.events);
  }

  /** Moves the horse the CPU picks. */
  cpuMove(): ShowcaseStep {
    const game = this.playable('move');
    return this.move(chooseCpuMove(game, this.level, this.rand));
  }

  /** A whole CPU action in one step, as the server plays its CPUs: the roll and, when a horse can move, its move. */
  playTurn(): ShowcaseStep {
    const rolled = applyRoll(this.playable('roll'), this.drawDie());
    this.actionCount++;
    if (rolled.state.phase !== 'move') return this.commit(rolled.state, rolled.events);
    const moved = applyMove(rolled.state, chooseCpuMove(rolled.state, this.level, this.rand));
    this.actionCount++;
    return this.commit(moved.state, [...rolled.events, ...moved.events]);
  }

  private playable(phase: 'roll' | 'move'): GameState {
    const game = this.game;
    if (this.isParked) throw new Error('No game is dealt');
    if (game.phase !== phase) throw new Error(`The game is not in the ${phase} phase`);
    return game;
  }

  private drawDie(): DiceValue {
    return (1 + Math.floor(this.rand() * 6)) as DiceValue;
  }

  private commit(game: GameState, events: GameEvent[]): ShowcaseStep {
    const step: ShowcaseStep = { seq: this.getStep().seq + 1, game, events };
    this.steps = [...this.steps, step].slice(-this.history);
    for (const listener of this.listeners) listener();
    return step;
  }
}
