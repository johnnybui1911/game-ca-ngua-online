export interface NoteEvent {
  /** Sixteenth-note step the event starts on. */
  step: number;
  /** MIDI note number; null for an unpitched hit (drums). */
  midi: number | null;
  /** Length in steps. */
  length: number;
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Space-separated tokens, one per sixteenth step: a note such as `A4` or `C#5`, `X` for a drum hit,
 * `-` to hold the previous note one more step, `.` for silence.
 */
export function parsePattern(text: string): NoteEvent[] {
  const events: NoteEvent[] = [];
  let held: NoteEvent | null = null;
  text
    .trim()
    .split(/\s+/)
    .forEach((token, step) => {
      if (token === '-') {
        if (held) held.length += 1;
        return;
      }
      held = null;
      if (token === '.') return;
      if (token === 'X') {
        events.push({ step, midi: null, length: 1 });
        return;
      }
      const m = /^([A-G])(#?)(-?\d)$/.exec(token);
      const base = m ? SEMITONE[m[1] ?? ''] : undefined;
      if (!m || base === undefined) throw new Error(`Bad note token: ${token}`);
      held = { step, midi: base + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12, length: 1 };
      events.push(held);
    });
  return events;
}
