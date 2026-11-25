import { useSyncExternalStore } from 'react';

export const LANGS = ['vi', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Vietnamese for everyone who never chose, whatever their browser locale says. */
export const DEFAULT_LANG: Lang = 'vi';

export const LANG_STORAGE_KEY = 'ca_lang';

/** Query parameter a link can carry to open the game in a language. */
export const LANG_PARAM = 'lang';

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
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = lang === 'en' ? 'Ludo 3D Online' : 'Cờ Cá Ngựa 3D Online';
  }
}

/** The language a link asks for (`?lang=en`, `?lang=vi`); anything else, including a missing parameter, is null. */
export function langFromSearch(search: string): Lang | null {
  const v = new URLSearchParams(search).get(LANG_PARAM);
  return isLang(v) ? v : null;
}

/** `search` without the `lang` parameter (other parameters kept in order); empty or starting with `?`. */
export function searchWithoutLang(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(LANG_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * A valid `?lang=` in the link wins over the stored choice and is saved as the person's choice, so moving around
 * the app and reloading without it stays in that language. Returns true when the link carried a valid value.
 */
export function applyLangFromSearch(store: Pick<LangStore, 'set'>, search: string): boolean {
  const lang = langFromSearch(search);
  if (lang === null) return false;
  store.set(lang);
  return true;
}

export type LangStore = ReturnType<typeof createLangStore>;

export const langStore = createLangStore(browserStorage(), applyHtmlLang);

// Before anything renders, so the first paint is already in the right language.
if (typeof window !== 'undefined') {
  const { search, pathname, hash } = window.location;
  if (applyLangFromSearch(langStore, search)) {
    // Drop the parameter from the address bar; the route, the other parameters and the hash stay as they were.
    try {
      window.history.replaceState(window.history.state, '', `${pathname}${searchWithoutLang(search)}${hash}`);
    } catch {
      // leaving the address as it is is harmless
    }
  }
}
applyHtmlLang(langStore.get());

export function useLang(): Lang {
  return useSyncExternalStore(langStore.subscribe, langStore.get, () => DEFAULT_LANG);
}
