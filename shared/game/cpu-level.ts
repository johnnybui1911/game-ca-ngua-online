/** How well the machine players of a room play. Leaf module: no imports, safe for worker and web. */
export const CPU_LEVELS = ['easy', 'normal', 'hard'] as const;
export type CpuLevel = (typeof CPU_LEVELS)[number];

export const DEFAULT_CPU_LEVEL: CpuLevel = 'normal';

export function isCpuLevel(v: unknown): v is CpuLevel {
  return typeof v === 'string' && (CPU_LEVELS as readonly string[]).includes(v);
}
