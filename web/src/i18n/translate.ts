import type { Lang } from './lang';

export type Params = Record<string, string | number>;

/** One area of the dictionary: Vietnamese is the source of truth, English must have exactly the same keys. */
export interface Area<K extends string> {
  vi: Record<K, string>;
  en: Record<K, string>;
}

/** A missing English key, or an extra one, is a type error. */
export function defineArea<const V extends Record<string, string>>(vi: V, en: { [K in keyof V]: string }): Area<keyof V & string> {
  return { vi, en } as Area<keyof V & string>;
}

/** Replaces `{name}` placeholders; a placeholder with no value is left as written. */
export function format(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export function makeT<K extends string>(dicts: Record<Lang, Record<K, string>>, lang: Lang) {
  return (key: K, params?: Params): string => format(dicts[lang][key], params);
}
