import { useSyncExternalStore } from 'react';

export const LANGS = ['vi', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Vietnamese for everyone who never chose, whatever their browser locale says. */
export const DEFAULT_LANG: Lang = 'vi';

export const LANG_STORAGE_KEY = 'ca_lang';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function isLang(v: unknown): v is Lang {
  return v === 'vi' || v === 'en';
}

/**
 * The language choice, kept in this browser. `storage` is injectable for tests (null means unavailable);
 * `onChange` runs after every change, so the page can update `<html lang>`.
 */
export function createLangStore(storage: StorageLike | null, onChange?: (lang: Lang) => void) {
  const read = (): Lang => {
    try {
      const v = storage?.getItem(LANG_STORAGE_KEY);
      return isLang(v) ? v : DEFAULT_LANG;
    } catch {
      return DEFAULT_LANG;
    }
  };
  let lang = read();
  const listeners = new Set<() => void>();
  return {
    get: (): Lang => lang,
    set(next: Lang): void {
      if (next === lang) return;
      lang = next;
      try {
        storage?.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // private mode: the choice lasts for this page only
      }
      onChange?.(next);
      for (const l of listeners) l();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function applyHtmlLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const langStore = createLangStore(browserStorage(), applyHtmlLang);
applyHtmlLang(langStore.get());

export function useLang(): Lang {
  return useSyncExternalStore(langStore.subscribe, langStore.get, () => DEFAULT_LANG);
}
