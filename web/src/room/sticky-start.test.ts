/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const roomCss = readFileSync(new URL('./room.css', import.meta.url), 'utf8');

describe('mobile waiting-room start layout', () => {
  it('keeps the start row within the room panel and limits sticky styling to mobile', () => {
    const mobileRules = /@media \(max-width: 899px\) \{([\s\S]*?)\n\}/.exec(roomCss)?.[1] ?? '';
    expect(mobileRules).toContain('.room-panel:has(.start-row) .room-columns');
    expect(mobileRules).toContain('.room-panel:has(.start-row) .room-col:first-child');
    expect(mobileRules).toContain('display: contents');
    expect(mobileRules).toContain('position: sticky');
    expect(mobileRules).toContain('top: calc(var(--touch) + var(--space-2))');
    expect(mobileRules).toContain('order: -1');
    expect(mobileRules).toContain('background: var(--glass-fill-solid)');
  });
});
