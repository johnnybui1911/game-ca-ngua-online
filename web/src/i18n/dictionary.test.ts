import { describe, expect, it } from 'vitest';
import { EMOTES } from '../../../shared/emotes';
import { CPU_LEVEL_LABELS } from '../room/cpu-levels';
import { COLOR_NAMES } from '../room/colors';
import { PACE_LABELS } from '../room/paces';
import { describeMove } from '../room/move-text';
import { cpuDisplayName } from '../room/names';
import { rulesForT } from '../room/rules-copy';
import { CLASSIC_RULES, QUICK_DIFFERENCES, rulesFor } from '../../../shared/rules-text';
import { dictionaries, translatorFor, type TKey } from './index';
import { errorText, matchServerMessage } from './error-text';

const vi = translatorFor('vi');
const en = translatorFor('en');
const keys = Object.keys(dictionaries.vi) as TKey[];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('dictionary', () => {
  it('has the same keys in Vietnamese and English', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual([...keys].sort());
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of keys) expect(placeholders(dictionaries.en[key]), key).toEqual(placeholders(dictionaries.vi[key]));
  });

  it('leaves no English entry empty or in Vietnamese', () => {
    const allowed = new Set<TKey>(['lang.vi', 'emote.laugh']);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(dictionaries.en[key].trim(), key).not.toBe('');
      // Words that are the game's own name stay (cờ cá ngựa); everything else must be English.
      expect(dictionaries.en[key].replace(/cờ cá ngựa/gi, ''), key).not.toMatch(/[À-ỹ]/);
    }
  });

  it('keeps Vietnamese byte-identical to the copy the app shipped', () => {
    expect(vi('rules.classic.0')).toBe(CLASSIC_RULES[0]);
    expect(rulesForT(vi, { quick: true, rules: { tripleBonusForfeit: true } })).toEqual(rulesFor({ quick: true, rules: { tripleBonusForfeit: true } }));
    expect(rulesForT(vi, { quick: false })).toEqual(rulesFor({ quick: false }));
    expect(CLASSIC_RULES).toHaveLength(7);
    expect(QUICK_DIFFERENCES).toHaveLength(4);
    for (const e of EMOTES) expect(vi(`emote.${e.id}`)).toBe(e.text);
    for (const [level, label] of Object.entries(CPU_LEVEL_LABELS)) expect(vi(`cpu.level.${level as 'easy'}`)).toBe(label);
    for (const [color, name] of Object.entries(COLOR_NAMES)) expect(vi(`color.${color as '0'}`)).toBe(name);
    for (const [pace, label] of Object.entries(PACE_LABELS)) expect(vi(`pace.${pace as 'nhanh'}`)).toBe(label);
    expect(vi('lobby.roomMeta', { host: 'An', taken: 1, total: 4, status: vi('lobby.waiting') })).toBe('An · 1/4 chỗ · Đang chờ');
  });

  it('translates the rules sheet', () => {
    const sections = rulesForT(en, { quick: true, rules: { tripleBonusForfeit: true } });
    expect(sections.map((s) => s.items.length)).toEqual([4, 7, 1]);
    expect(sections[1]!.heading).toBe('Cờ cá ngựa rules');
  });
});

describe('server-made text', () => {
  it('shows a CPU seat name in the chosen language and never touches a typed name', () => {
    expect(cpuDisplayName(vi, 'Máy 3')).toBe('Máy 3');
    expect(cpuDisplayName(en, 'Máy 3')).toBe('CPU 3');
    expect(cpuDisplayName(en, 'Máy Bay')).toBe('Máy Bay');
    expect(cpuDisplayName(en, 'Minh')).toBe('Minh');
  });

  it('turns a move button label into English', () => {
    const game = {
      turn: 0,
      dice: 4,
      horses: [[0, 5, -1, -1], [-1, -1, -1, -1], [], []],
      variant: 'classic',
    } as never;
    expect(describeMove(game, 1)).toBe('Quân 2: đi 4 ô');
    expect(describeMove(game, 1, undefined, en)).toBe('Horse 2: move 4');
  });

  it('translates a server error message and passes an unknown one through', () => {
    expect(errorText(en, 'Phòng đã đầy.')).toBe('The room is full.');
    expect(errorText(vi, 'Phòng đã đầy.')).toBe('Phòng đã đầy.');
    expect(errorText(en, 'Tên phòng cần từ 1 đến 40 ký tự.')).toBe('The room name must be 1 to 40 characters.');
    expect(errorText(en, 'Số chỗ cần từ 2 đến 4.')).toBe('The number of seats must be from 2 to 4.');
    expect(errorText(en, 'Một lỗi mới.')).toBe('Một lỗi mới.');
  });

  it('knows every message the worker and the shared protocol can send', () => {
    const sources = {
      ...import.meta.glob('../../../worker/**/*.ts', { eager: true, query: '?raw', import: 'default' }),
      ...import.meta.glob('../../../shared/protocol.ts', { eager: true, query: '?raw', import: 'default' }),
    } as Record<string, string>;
    const files = Object.keys(sources).filter((f) => !f.endsWith('.test.ts'));
    // Every Vietnamese literal in the worker is a player-facing message, except these (names, labels, comments).
    const notMessages = new Set(['Người chơi', 'Kích thước màn hình', 'Thông tin liên hệ', 'Trình duyệt', 'Đường dẫn', 'Máy ${n}']);
    const literal = /(['`])((?:(?!\1)[^\n\\])*[À-ỹ](?:(?!\1)[^\n\\])*)\1/g;
    const unknown: string[] = [];
    let found = 0;
    for (const file of files) {
      for (const line of sources[file]!.split('\n')) {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
        for (const m of line.replace(/\/\/.*$/, (c) => (/['`]/.test(c) ? c : '')).matchAll(literal)) {
          if (notMessages.has(m[2]!) || /^ ?s |"Nhịp ván"/.test(m[2]!)) continue;
          found++;
          const text = m[2]!.replace(/\$\{[^}]*\}/g, '1');
          if (!matchServerMessage(text)) unknown.push(`${file}: ${text}`);
        }
      }
    }
    expect(found).toBeGreaterThan(40);
    expect(unknown).toEqual([]);
  });
});
