import { CPU_LEVELS, DEFAULT_CPU_LEVEL, type CpuLevel } from '../../../shared/game/cpu-level';
import type { RoomSnapshot } from '../../../shared/protocol';

export const CPU_LEVEL_LABELS: Record<CpuLevel, string> = {
  easy: 'Dễ',
  normal: 'Thường',
  hard: 'Khó',
};

export { CPU_LEVELS };

/** The room's CPU level; a snapshot from an older server has no field. */
export function cpuLevelOf(room: RoomSnapshot): CpuLevel {
  return room.cpuLevel ?? DEFAULT_CPU_LEVEL;
}
