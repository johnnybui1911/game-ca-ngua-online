import { FEEDBACK_LIMITS, type FeedbackCategory, type FeedbackRequest } from '../../../shared/feedback';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../shared/protocol';
import { ApiRequestError } from '../api';
import { translatorFor, type TFunction } from '../i18n';
import { errorText } from '../i18n/error-text';

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

export function checkDraft(draft: FeedbackDraft, t: TFunction = translatorFor('vi')): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.category) errors.category = t('feedback.errCategory');
  const message = textLength(draft.message.trim());
  if (message < FEEDBACK_LIMITS.messageMin) {
    errors.message = message === 0 ? t('feedback.errEmpty') : t('feedback.errMin', { min: FEEDBACK_LIMITS.messageMin });
  } else if (message > FEEDBACK_LIMITS.messageMax) {
    errors.message = t('feedback.errMax', { max: FEEDBACK_LIMITS.messageMax });
  }
  if (textLength(draft.contact.trim()) > FEEDBACK_LIMITS.contactMax) {
    errors.contact = t('feedback.errContact', { max: FEEDBACK_LIMITS.contactMax });
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
export function sendErrorText(err: unknown, t: TFunction = translatorFor('vi')): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 429) return t('feedback.errTooMany');
    if (err.status === 0) return t('feedback.errOffline');
    if (err.status >= 500) return t('feedback.errServer');
    return errorText(t, err.message);
  }
  return t('feedback.errUnknown');
}
