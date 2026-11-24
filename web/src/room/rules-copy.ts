import type { HouseRules } from '../../../shared/game/types';
import type { RulesSection } from '../../../shared/rules-text';
import type { TFunction, TKey } from '../i18n';

const CLASSIC_COUNT = 7;
const QUICK_COUNT = 4;

const lines = (t: TFunction, prefix: 'rules.classic' | 'rules.quick', count: number): string[] =>
  Array.from({ length: count }, (_, i) => t(`${prefix}.${i}` as TKey));

/** `rulesFor` of the shared rules text, in the player's language. */
export function rulesForT(t: TFunction, settings?: { quick: boolean; rules?: HouseRules }): RulesSection[] {
  const classic: RulesSection = { heading: t('rules.classicHeading'), items: lines(t, 'rules.classic', CLASSIC_COUNT) };
  const sections = settings?.quick
    ? [{ heading: t('rules.quickHeading'), items: lines(t, 'rules.quick', QUICK_COUNT) }, classic]
    : [classic];
  if (settings?.rules?.tripleBonusForfeit) sections.push({ heading: t('rules.houseHeading'), items: [t('rules.tripleForfeit')] });
  return sections;
}

/** The three lines of the card shown when a quick match starts. */
export const quickIntroLines = (t: TFunction): string[] => [t('rules.intro.0'), t('rules.intro.1'), t('rules.intro.2')];
