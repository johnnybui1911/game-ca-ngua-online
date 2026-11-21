import { FEEDBACK_CATEGORIES, FEEDBACK_LIMITS, type FeedbackCategory } from '../../shared/feedback';
import { HttpError } from '../auth/errors';
import { isRoomCode } from '../rooms/room-code';

export interface CleanFeedback {
  category: FeedbackCategory;
  message: string;
  contact: string | null;
  roomCode: string | null;
  path: string | null;
  viewport: string | null;
  userAgent: string | null;
}

const bad = (code: string, message: string) => new HttpError(400, code, message);

/** C0/C1 controls and DEL. Newlines and tabs are allowed in a message only. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const ANY_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const VIEWPORT = /^\d{1,5}x\d{1,5}$/;

const len = (s: string) => [...s].length;

function optionalText(raw: unknown, max: number, field: string, label: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw bad(`invalid_${field}`, `${label} không hợp lệ.`);
  const text = raw.trim();
  if (text === '') return null;
  if (ANY_CONTROL.test(text)) throw bad(`invalid_${field}`, `${label} chứa ký tự không hợp lệ.`);
  if (len(text) > max) throw bad(`invalid_${field}`, `${label} tối đa ${max} ký tự.`);
  return text;
}

/** Validates a feedback body; every failure is a 400 with a Vietnamese message. */
export function checkFeedback(body: unknown): CleanFeedback {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw bad('invalid_body', 'Yêu cầu không hợp lệ.');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.category !== 'string' || !(FEEDBACK_CATEGORIES as readonly string[]).includes(b.category)) {
    throw bad('invalid_category', 'Vui lòng chọn loại góp ý.');
  }
  const { messageMin, messageMax, contactMax, pathMax, userAgentMax } = FEEDBACK_LIMITS;
  if (typeof b.message !== 'string') throw bad('invalid_message', 'Vui lòng nhập nội dung góp ý.');
  const message = b.message.trim();
  if (CONTROL.test(message)) throw bad('invalid_message', 'Nội dung chứa ký tự không hợp lệ.');
  if (len(message) < messageMin) throw bad('invalid_message', `Nội dung góp ý cần ít nhất ${messageMin} ký tự.`);
  if (len(message) > messageMax) throw bad('invalid_message', `Nội dung góp ý tối đa ${messageMax} ký tự.`);

  const contact = optionalText(b.contact, contactMax, 'contact', 'Thông tin liên hệ');

  let roomCode: string | null = null;
  if (b.roomCode !== undefined && b.roomCode !== null && b.roomCode !== '') {
    const code = typeof b.roomCode === 'string' ? b.roomCode.trim().toUpperCase() : '';
    if (!isRoomCode(code)) throw bad('invalid_room_code', 'Mã phòng không hợp lệ.');
    roomCode = code;
  }

  const ctx = b.context;
  if (ctx !== undefined && ctx !== null && (typeof ctx !== 'object' || Array.isArray(ctx))) {
    throw bad('invalid_context', 'Thông tin thiết bị không hợp lệ.');
  }
  const c = (ctx ?? {}) as Record<string, unknown>;
  const path = optionalText(c.path, pathMax, 'context', 'Đường dẫn');
  const userAgent = optionalText(c.userAgent, userAgentMax, 'context', 'Trình duyệt');
  const viewport = optionalText(c.viewport, 11, 'context', 'Kích thước màn hình');
  if (viewport !== null && !VIEWPORT.test(viewport)) {
    throw bad('invalid_context', 'Kích thước màn hình không hợp lệ.');
  }

  return { category: b.category as FeedbackCategory, message, contact, roomCode, path, viewport, userAgent };
}
