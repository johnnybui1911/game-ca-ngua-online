import { describe, expect, it } from 'vitest';
import { dayOf, isClientEvent, normalizeSource } from './analytics';

describe('normalizeSource', () => {
  it('treats a missing or blank tag as a direct visit', () => {
    expect(normalizeSource(null)).toBe('direct');
    expect(normalizeSource(undefined)).toBe('direct');
    expect(normalizeSource('  ')).toBe('direct');
  });

  it('accepts listed sources in any case and maps common aliases', () => {
    expect(normalizeSource(' Zalo ')).toBe('zalo');
    expect(normalizeSource('FB')).toBe('facebook');
    expect(normalizeSource('twitter')).toBe('x');
    expect(normalizeSource('invite')).toBe('invite');
  });

  it('folds anything unlisted into other so the table cannot grow on junk', () => {
    expect(normalizeSource('spam-' + 'x'.repeat(500))).toBe('other');
    expect(normalizeSource('constructor')).toBe('other');
  });
});

describe('isClientEvent', () => {
  it('accepts only events the browser may report', () => {
    expect(isClientEvent('visit')).toBe(true);
    expect(isClientEvent('match_finished')).toBe(false);
    expect(isClientEvent(1)).toBe(false);
  });
});

it('buckets counters by UTC day', () => {
  expect(dayOf(Date.UTC(2026, 10, 21, 23, 59))).toBe('2026-11-21');
  expect(dayOf(Date.UTC(2026, 10, 22, 0, 0))).toBe('2026-11-22');
});
