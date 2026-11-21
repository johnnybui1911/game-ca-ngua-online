/** Player feedback ("Góp ý"): request/response types and limits shared by the worker and the UI. */

export const FEEDBACK_CATEGORIES = ['idea', 'visual', 'rules', 'ui', 'bug'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: 'Ý tưởng tính năng mới',
  visual: 'Hình ảnh & 3D',
  rules: 'Luật chơi & máy',
  ui: 'Giao diện điện thoại / máy tính',
  bug: 'Báo lỗi / khác',
};

export const FEEDBACK_LIMITS = {
  messageMin: 2,
  messageMax: 2000,
  contactMax: 120,
  pathMax: 200,
  userAgentMax: 200,
  /** Largest accepted request body, in bytes. */
  bodyMaxBytes: 8 * 1024,
  /** Per client: at most `perWindow` posts in `windowMs`, and `perDay` in 24 hours. */
  perWindow: 5,
  windowMs: 10 * 60 * 1000,
  perDay: 30,
  dayMs: 24 * 60 * 60 * 1000,
} as const;

export interface FeedbackContext {
  path?: string;
  /** "WxH" in CSS pixels, e.g. "390x844". */
  viewport?: string;
  userAgent?: string;
}

// POST /api/feedback (same-origin JSON)
export interface FeedbackRequest {
  category: FeedbackCategory;
  message: string;
  contact?: string;
  roomCode?: string;
  context?: FeedbackContext;
}

export interface FeedbackResponse {
  ok: true;
  id: number;
}
