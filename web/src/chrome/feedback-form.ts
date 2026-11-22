import { FEEDBACK_LIMITS, type FeedbackCategory, type FeedbackRequest } from '../../../shared/feedback';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../shared/protocol';
import { ApiRequestError } from '../api';

export interface FeedbackDraft {
  category: FeedbackCategory | '';
  contact: string;
  message: string;
}

export const EMPTY_DRAFT: FeedbackDraft = { category: '', contact: '', message: '' };

export interface DraftErrors {
  category?: string;
  message?: string;
  contact?: string;
}

/** Characters in `text` the way the server counts them (code points, not UTF-16 units). */
export function textLength(text: string): number {
  return [...text].length;
}

export function checkDraft(draft: FeedbackDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.category) errors.category = 'Vui lòng chọn loại góp ý.';
  const message = textLength(draft.message.trim());
  if (message < FEEDBACK_LIMITS.messageMin) {
    errors.message = message === 0 ? 'Vui lòng nhập nội dung góp ý.' : `Nội dung góp ý cần ít nhất ${FEEDBACK_LIMITS.messageMin} ký tự.`;
  } else if (message > FEEDBACK_LIMITS.messageMax) {
    errors.message = `Nội dung góp ý tối đa ${FEEDBACK_LIMITS.messageMax} ký tự.`;
  }
  if (textLength(draft.contact.trim()) > FEEDBACK_LIMITS.contactMax) {
    errors.contact = `Thông tin liên hệ tối đa ${FEEDBACK_LIMITS.contactMax} ký tự.`;
  }
  return errors;
}

export const hasErrors = (errors: DraftErrors) => Object.keys(errors).length > 0;

/** The room code in a `/r/:code` path, or null on any other page. */
export function roomCodeFromPath(pathname: string): string | null {
  const code = /^\/r\/([^/]+)\/?$/.exec(pathname)?.[1]?.toUpperCase();
  if (!code || code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}

export interface Environment {
  pathname: string;
  width: number;
  height: number;
  userAgent: string;
}

/** Cuts to `max` code points. */
const clip = (text: string, max: number) => [...text].slice(0, max).join('');

/** The request body; the room code and the context are attached here, never typed by the player. */
export function buildRequest(draft: FeedbackDraft, env: Environment): FeedbackRequest {
  if (!draft.category) throw new Error('category is required');
  const contact = draft.contact.trim();
  const roomCode = roomCodeFromPath(env.pathname);
  return {
    category: draft.category,
    message: draft.message.trim(),
    ...(contact ? { contact } : {}),
    ...(roomCode ? { roomCode } : {}),
    context: {
      path: clip(env.pathname, FEEDBACK_LIMITS.pathMax),
      viewport: `${Math.round(env.width)}x${Math.round(env.height)}`,
      userAgent: clip(env.userAgent, FEEDBACK_LIMITS.userAgentMax),
    },
  };
}

/** What the player reads when sending failed. */
export function sendErrorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 429) return 'Bạn đã gửi góp ý quá nhiều lần. Vui lòng thử lại sau ít phút.';
    if (err.status === 0) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
    if (err.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
    return err.message;
  }
  return 'Không gửi được góp ý. Vui lòng thử lại.';
}
