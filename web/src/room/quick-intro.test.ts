import { describe, expect, it } from 'vitest';
import { createQuickIntro } from './quick-intro';

const fake = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

describe('quick intro card', () => {
  it('shows on a fresh device and not again once dismissed', () => {
    const s = fake();
    const intro = createQuickIntro(s);
    expect(intro.shouldShow()).toBe(true);
    intro.markSeen();
    expect(intro.shouldShow()).toBe(false);
    expect(createQuickIntro(s).shouldShow()).toBe(false);
  });

  it('stays hidden for a device that already saw it', () => {
    expect(createQuickIntro(fake({ ca_quick_intro_seen: '1' })).shouldShow()).toBe(false);
  });

  it('works without storage and remembers for the page', () => {
    const intro = createQuickIntro(null);
    expect(intro.shouldShow()).toBe(true);
    intro.markSeen();
    expect(intro.shouldShow()).toBe(false);
  });

  it('survives a throwing storage', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const intro = createQuickIntro(bad);
    expect(intro.shouldShow()).toBe(true);
    expect(() => intro.markSeen()).not.toThrow();
    expect(intro.shouldShow()).toBe(false);
  });
});
