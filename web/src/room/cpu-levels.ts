import { CPU_LEVELS, DEFAULT_CPU_LEVEL, type CpuLevel } from '../../../shared/game/cpu-level';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { TFunction } from '../i18n';

export const CPU_LEVEL_LABELS: Record<CpuLevel, string> = {
  easy: 'Dễ',
  normal: 'Thường',
  hard: 'Khó',
};

/** A level's name in the player's language. */
export const cpuLevelLabel = (t: TFunction, level: CpuLevel): string => t(`cpu.level.${level}`);

export { CPU_LEVELS };

/** The room's CPU level; a snapshot from an older server has no field. */
export function cpuLevelOf(room: RoomSnapshot): CpuLevel {
  return room.cpuLevel ?? DEFAULT_CPU_LEVEL;
}
