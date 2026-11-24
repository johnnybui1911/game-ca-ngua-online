/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const roomCss = readFileSync(new URL('./room.css', import.meta.url), 'utf8');

describe('waiting-room header layout', () => {
  it('sticks the opaque header and reserves space for the sound control on mobile', () => {
    const header = /\.room-head \{([\s\S]*?)\n\}/.exec(roomCss)?.[1] ?? '';
    expect(header).toContain('position: sticky');
    expect(header).toContain('background: var(--glass-fill-solid)');
    expect(roomCss).toContain('top: calc(var(--touch) + var(--space-2))');
    expect(roomCss).not.toContain('.room-panel .start-row');
  });
});
