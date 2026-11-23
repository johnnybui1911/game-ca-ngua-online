import { DEFAULT_CPU_LEVEL } from '../../../shared/game/cpu-level';
import { createGame } from '../../../shared/game/engine';
import { COLORS } from '../../../shared/game/types';
import { DEFAULT_ROOM_SETTINGS } from '../../../shared/protocol';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from '../room/batches';
import type { ShowcaseScene, ShowcaseStep } from '../scene/props';

/** The board at rest: all four colours, every horse in its stable. Shown until a showcase game is supplied. */
export function idleShowcase(): ShowcaseScene {
  return { key: 'idle', steps: [{ seq: 0, game: createGame([...COLORS]), events: [] }] };
}

function showcaseRoom(step: ShowcaseStep, quick: boolean): RoomSnapshot {
  return {
    code: 'SHOWCASE',
    name: '',
    visibility: 'private',
    hostId: '',
    status: 'playing',
    seats: step.game.colors.map((color) => ({ color, occupant: null, horseNames: ['', '', '', ''], auto: false })),
    game: step.game,
    turnDeadline: null,
    allowTakeover: false,
    joinRequests: [],
    gameDeadline: null,
    gamePausedRemaining: null,
    paused: false,
    cpuLevel: DEFAULT_CPU_LEVEL,
    settings: { ...DEFAULT_ROOM_SETTINGS, quick },
    seq: step.seq,
  };
}

/** A showcase in the shape the scene animates: one batch per step, newest last. */
export function showcaseBatches(showcase: ShowcaseScene): StateBatch[] {
  return showcase.steps.map((step) => ({ room: showcaseRoom(step, showcase.quick === true), events: step.events }));
}
