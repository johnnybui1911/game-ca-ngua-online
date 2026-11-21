import { describe, expect, it } from 'vitest';
import { rulesFor } from '../../../shared/rules-text';
import landingHtml from '../../../co-ca-ngua-online.html?raw';

const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

describe('rulesFor', () => {
  it('lists the seven classic rules in order', () => {
    const sections = rulesFor();
    expect(sections).toHaveLength(1);
    expect(sections[0]?.items).toHaveLength(7);
  });

  // The landing page stays static HTML for search engines, so the copy is checked rather than shared.
  it('matches the static landing page word for word, in the same order', () => {
    const list = /<ol class="lp-rules">([\s\S]*?)<\/ol>/.exec(landingHtml)?.[1] ?? '';
    const landing = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? ''));
    expect(landing).toEqual([...(rulesFor()[0]?.items ?? [])]);
  });
});
