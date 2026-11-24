import { describe, expect, it, vi } from 'vitest';
import { LANG_STORAGE_KEY, applyLangFromSearch, createLangStore, isLang, langFromSearch, searchWithoutLang, type Lang } from './lang';

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[LANG_STORAGE_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('language store', () => {
  it('is Vietnamese for someone who never chose', () => {
    expect(createLangStore(memoryStorage()).get()).toBe('vi');
  });

  it('is Vietnamese when storage is missing, throws or holds junk', () => {
    expect(createLangStore(null).get()).toBe('vi');
    expect(createLangStore(memoryStorage('fr')).get()).toBe('vi');
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createLangStore(broken);
    expect(store.get()).toBe('vi');
    store.set('en');
    expect(store.get()).toBe('en');
  });

  it('remembers the choice for the next visit', () => {
    const storage = memoryStorage();
    createLangStore(storage).set('en');
    expect(storage.data.get(LANG_STORAGE_KEY)).toBe('en');
    expect(createLangStore(storage).get()).toBe('en');
    const again = createLangStore(storage);
    again.set('vi');
    expect(createLangStore(storage).get()).toBe('vi');
  });

  it('tells subscribers and the page once per real change', () => {
    const seen: Lang[] = [];
    const store = createLangStore(memoryStorage(), (l) => seen.push(l));
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set('vi');
    store.set('en');
    store.set('en');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['en']);
    off();
    store.set('vi');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('accepts only the two languages', () => {
    expect(['vi', 'en', 'fr', '', null].map(isLang)).toEqual([true, true, false, false, false]);
  });
});

describe('language from the link', () => {
  const open = (search: string, stored?: string) => {
    const storage = memoryStorage(stored);
    const store = createLangStore(storage);
    applyLangFromSearch(store, search);
    return { store, storage };
  };

  it('opens in Vietnamese with no parameter and nothing stored', () => {
    const { store, storage } = open('');
    expect(store.get()).toBe('vi');
    expect(storage.data.has(LANG_STORAGE_KEY)).toBe(false);
  });

  it('keeps a stored choice when the link has no parameter', () => {
    expect(open('?foo=1', 'en').store.get()).toBe('en');
  });

  it('?lang=en opens in English and is saved for the next visit', () => {
    const { store, storage } = open('?lang=en');
    expect(store.get()).toBe('en');
    expect(createLangStore(storage).get()).toBe('en');
  });

  it('?lang=vi overrides a stored English choice', () => {
    const { store, storage } = open('?lang=vi', 'en');
    expect(store.get()).toBe('vi');
    expect(createLangStore(storage).get()).toBe('vi');
  });

  it('ignores an unknown value', () => {
    expect(open('?lang=fr', 'en').store.get()).toBe('en');
    expect(open('?lang=EN').store.get()).toBe('vi');
    expect(open('?lang=').store.get()).toBe('vi');
  });

  it('reads the parameter next to others, as on a room link', () => {
    expect(langFromSearch('?ref=invite&lang=en')).toBe('en');
    expect(langFromSearch('')).toBeNull();
  });

  it('removes only the lang parameter from the address', () => {
    expect(searchWithoutLang('?lang=en')).toBe('');
    expect(searchWithoutLang('?ref=invite&lang=en&x=1')).toBe('?ref=invite&x=1');
    expect(searchWithoutLang('?x=1')).toBe('?x=1');
  });
});
