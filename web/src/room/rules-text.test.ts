import { describe, expect, it } from 'vitest';
import { QUICK_DIFFERENCES, TRIPLE_BONUS_FORFEIT_RULE, rulesFor } from '../../../shared/rules-text';
import landingHtml from '../../../gioi-thieu.html?raw';

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

  it('puts the quick-match differences before the classic rules in a quick room only', () => {
    const quick = rulesFor({ quick: true });
    expect(quick).toHaveLength(2);
    expect(quick[0]?.items).toEqual([...QUICK_DIFFERENCES]);
    expect(quick[1]?.items).toEqual([...(rulesFor()[0]?.items ?? [])]);
    expect(rulesFor({ quick: false })).toEqual(rulesFor());
  });

  it('adds the house rules the room turned on last, and nothing when they are off', () => {
    const on = { tripleBonusForfeit: true };
    expect(rulesFor({ quick: false, rules: on }).at(-1)?.items).toEqual([TRIPLE_BONUS_FORFEIT_RULE]);
    expect(rulesFor({ quick: true, rules: on })).toHaveLength(3);
    expect(rulesFor({ quick: false, rules: { tripleBonusForfeit: false } })).toEqual(rulesFor());
  });

  it('keeps the landing page comparison in step with the quick differences', () => {
    const section = /id="van-nhanh"[\s\S]*?<\/table>/.exec(landingHtml)?.[0] ?? '';
    const rows = [...section.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)];
    expect(rows).toHaveLength(4);
    const quickCells = text(rows.map((m) => m[3] ?? '').join(' '));
    expect(quickCells).toContain('1 ngựa ở ô xuất phát');
    expect(quickCells).toContain('đá được ít nhất 1 ngựa');
    expect(quickCells).toContain('Ngựa đầu tiên lên chuồng thắng');
    expect(text(QUICK_DIFFERENCES.join(' '))).toContain('ngựa đầu tiên của bất kỳ màu nào lên chuồng');
  });
});
