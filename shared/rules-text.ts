/**
 * Rules copy shown inside rooms. The landing page (`co-ca-ngua-online.html`, `.lp-rules`) stays static
 * HTML for search engines; `rules-text.test.ts` fails when the two disagree.
 * The rules themselves live in `shared/game/types.ts`.
 */

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

/** The sections of the rules sheet, first section first. Classic rules only for now. */
export function rulesFor(): RulesSection[] {
  return [{ heading: 'Luật cá ngựa', items: CLASSIC_RULES }];
}
