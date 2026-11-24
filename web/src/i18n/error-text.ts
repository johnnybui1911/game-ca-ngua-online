import { dictionaries, type TFunction, type TKey } from './index';
import type { Params } from './translate';

interface Matcher {
  key: TKey;
  pattern: RegExp;
  names: string[];
}

/** One matcher per server message: its Vietnamese text with each `{name}` turned into a capture group. */
const matchers: Matcher[] = (Object.keys(dictionaries.vi) as TKey[])
  .filter((k) => k.startsWith('err.'))
  .map((key) => {
    const names: string[] = [];
    const source = dictionaries.vi[key]
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) {
          names.push(m[1]!);
          return '(.+?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { key, pattern: new RegExp(`^${source}$`), names };
  })
  // Exact messages first, so a catch-all like "{label} is invalid" never shadows a plain one.
  .sort((a, b) => a.names.length - b.names.length);

/** The dictionary key of a server message, with the values it carried; null when the message is not known. */
export function matchServerMessage(message: string): { key: TKey; params: Params } | null {
  for (const m of matchers) {
    const hit = m.pattern.exec(message);
    if (!hit) continue;
    const params: Params = {};
    m.names.forEach((name, i) => (params[name] = hit[i + 1]!));
    return { key: m.key, params };
  }
  return null;
}

/** A server error message in the player's language; an unknown one is shown as the server sent it. */
export function errorText(t: TFunction, message: string): string {
  const hit = matchServerMessage(message);
  return hit ? t(hit.key, hit.params) : message;
}
