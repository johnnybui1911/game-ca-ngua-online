import { countWords } from '../../../shared/protocol';

export function hasLongHudName(names: readonly string[]): boolean {
  return names.some((name) => countWords(name) > 8);
}
