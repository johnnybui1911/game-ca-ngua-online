/**
 * Rules copy shown inside rooms. The landing page (`gioi-thieu.html`, `.lp-rules`) stays static
 * HTML for search engines; `rules-text.test.ts` fails when the two disagree.
 * The rules themselves live in `shared/game/types.ts`.
 */

import type { HouseRules } from './game/types';

export interface RulesSection {
  heading: string;
  /** Plain text, one rule per item. */
  items: readonly string[];
}

export const CLASSIC_RULES: readonly string[] = [
  'Ra chuồng khi tung được 1 hoặc 6. Ô xuất phát có ngựa đối thủ thì đá nó về chuồng; có ngựa cùng màu thì không ra được.',
  'Đi đúng số nút vừa tung. Không được nhảy qua bất kỳ con ngựa nào trên đường.',
  'Đá ngựa: dừng đúng ô có ngựa đối thủ thì ngựa đó bị đá về chuồng.',
  'Lên chuồng: đứng ở cửa chuồng, tung n thì lên bậc n nếu các bậc thấp hơn không có ngựa nhà. Đang ở bậc k, phải tung đúng k+1 mới lên tiếp.',
  'Tung 1 hoặc 6 được tung thêm lượt nữa.',
  'Có nước đi hợp lệ thì bắt buộc phải đi.',
  'Thắng: màu đầu tiên đưa đủ 4 ngựa lên chuồng.',
];

/** What a quick match ("ván nhanh") changes, one rule per item. Shown first in the rules sheet of a quick room. */
export const QUICK_DIFFERENCES: readonly string[] = [
  'Mỗi màu bắt đầu với 1 ngựa đã ra sẵn ở ô xuất phát, 3 ngựa còn lại ở trong chuồng.',
  'Chuồng đích bị khóa cho tới khi màu đó đá được ít nhất 1 ngựa đối thủ (ra chuồng đá ngựa cũng tính). Chưa mở thì ngựa vẫn đi tới cửa chuồng nhưng chưa lên được.',
  'Thắng: ngựa đầu tiên của bất kỳ màu nào lên chuồng (bậc nào cũng được) thắng ngay.',
  'Còn lại giữ luật thường. Khi chỉ có một nước đi, máy tự đi giúp; máy và hoạt ảnh chạy nhanh hơn.',
];

/** One line under the mode control in the waiting room. */
export const QUICK_MODE_SUMMARY =
  'Mỗi màu có sẵn 1 ngựa ngoài chuồng, đá được ngựa đối thủ mới mở chuồng đích, ngựa đầu tiên lên chuồng thắng. Tự đi khi chỉ có một nước.';
export const CLASSIC_MODE_SUMMARY = 'Luật cá ngựa thường: đưa đủ 4 ngựa lên chuồng để thắng.';

/** The three lines of the card shown when a quick match starts. */
export const QUICK_INTRO: readonly string[] = [
  'Mỗi màu có sẵn 1 ngựa ngoài chuồng.',
  'Phải đá được 1 ngựa đối thủ thì mới mở chuồng đích để lên.',
  'Ngựa đầu tiên lên chuồng thắng ngay.',
];

export const LOCKED_LABEL = 'Chưa mở chuồng';
export const UNLOCKED_LABEL = 'Đã mở chuồng';
export const NEED_KICK_HINT = 'Cần đá 1 ngựa trước';
export const QUICK_WIN_TEXT = 'Thắng ván nhanh: ngựa đầu tiên lên chuồng';

/** The house rule `tripleBonusForfeit`: its switch label in the waiting room, and its line in the rules sheet. */
export const TRIPLE_BONUS_FORFEIT_LABEL = 'Tung 1 hoặc 6 ba lần liên tiếp thì mất lượt';
export const TRIPLE_BONUS_FORFEIT_RULE =
  'Trong một lượt, lần tung 1 hoặc 6 thứ ba liên tiếp bị hủy: không được đi và mất lượt. Các nước đã đi trước đó vẫn giữ.';

/**
 * The sections of the rules sheet, first section first. A quick room lists its differences before the classic rules;
 * the house rules the room turned on come last.
 */
export function rulesFor(settings?: { quick: boolean; rules?: HouseRules }): RulesSection[] {
  const classic: RulesSection = { heading: 'Luật cá ngựa', items: CLASSIC_RULES };
  const sections = settings?.quick ? [{ heading: 'Ván nhanh khác ván thường', items: QUICK_DIFFERENCES }, classic] : [classic];
  if (settings?.rules?.tripleBonusForfeit) sections.push({ heading: 'Luật thêm của phòng', items: [TRIPLE_BONUS_FORFEIT_RULE] });
  return sections;
}
