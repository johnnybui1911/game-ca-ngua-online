import { auth } from './dict/auth';
import { chrome } from './dict/chrome';
import { errors } from './dict/errors';
import { lobby } from './dict/lobby';
import { match } from './dict/match';
import { room } from './dict/room';
import { shell } from './dict/shell';
import { useLang, type Lang } from './lang';
import { makeT, type Params } from './translate';

/** Every area of the dictionary. A new area is added here; its English side is checked by `defineArea`. */
const areas = [shell, auth, chrome, errors, lobby, room, match];

export const dictionaries = {
  vi: Object.assign({}, ...areas.map((a) => a.vi)) as UnionToRecord<(typeof areas)[number]['vi']>,
  en: Object.assign({}, ...areas.map((a) => a.en)) as UnionToRecord<(typeof areas)[number]['en']>,
};

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type UnionToRecord<U> = UnionToIntersection<U>;

export type TKey = keyof typeof dictionaries.vi;
export type TFunction = (key: TKey, params?: Params) => string;

const translators: Record<Lang, TFunction> = {
  vi: makeT<TKey>(dictionaries, 'vi'),
  en: makeT<TKey>(dictionaries, 'en'),
};

/** The translator for a language, for code that has no hook (tests, plain functions). */
export const translatorFor = (lang: Lang): TFunction => translators[lang];

/** `t('key', { n: 3 })` in the language the player picked. Re-renders the caller when the language changes. */
export function useT(): TFunction {
  const lang = useLang();
  return translators[lang];
}

export { useLang, langStore, LANGS, DEFAULT_LANG, type Lang } from './lang';
