import { describe, expect, it } from 'vitest';
import { createEmoteSettings } from './emote-settings';

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

describe('emote settings', () => {
  it('defaults to not muted', () => {
    expect(createEmoteSettings(fake()).isMuted()).toBe(false);
    expect(createEmoteSettings(null).isMuted()).toBe(false);
  });

  it('reads a persisted mute', () => {
    expect(createEmoteSettings(fake({ ca_emotes_muted: '1' })).isMuted()).toBe(true);
  });

  it('persists and notifies', () => {
    const s = fake();
    const settings = createEmoteSettings(s);
    let calls = 0;
    settings.subscribe(() => calls++);
    settings.setMuted(true);
    expect(settings.isMuted()).toBe(true);
    expect(s.data.ca_emotes_muted).toBe('1');
    expect(calls).toBe(1);
    expect(createEmoteSettings(s).isMuted()).toBe(true);
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
    const settings = createEmoteSettings(bad);
    expect(settings.isMuted()).toBe(false);
    settings.setMuted(true);
    expect(settings.isMuted()).toBe(true);
  });
});
