import { describe, expect, it } from 'vitest';
import { FEEDBACK_LIMITS } from '../../../shared/feedback';
import { ApiRequestError } from '../api';
import { buildRequest, checkDraft, roomCodeFromPath, sendErrorText, textLength } from './feedback-form';

const env = { pathname: '/r/ABC234', width: 390.4, height: 844, userAgent: 'UA' };

describe('checkDraft', () => {
  it('needs a category and a message of at least the minimum length', () => {
    expect(checkDraft({ category: '', contact: '', message: 'xin chào' }).category).toBeDefined();
    expect(checkDraft({ category: 'bug', contact: '', message: '   ' }).message).toBeDefined();
    expect(checkDraft({ category: 'bug', contact: '', message: ' a ' }).message).toBeDefined();
    expect(checkDraft({ category: 'bug', contact: '', message: 'ok' })).toEqual({});
  });

  it('counts code points like the server, so emoji do not trip the limit early', () => {
    const emoji = '😀'.repeat(FEEDBACK_LIMITS.messageMax);
    expect(emoji.length).toBeGreaterThan(FEEDBACK_LIMITS.messageMax);
    expect(textLength(emoji)).toBe(FEEDBACK_LIMITS.messageMax);
    expect(checkDraft({ category: 'idea', contact: '', message: emoji })).toEqual({});
    expect(checkDraft({ category: 'idea', contact: '', message: emoji + 'a' }).message).toBeDefined();
  });

  it('rejects a contact over the limit', () => {
    const contact = 'x'.repeat(FEEDBACK_LIMITS.contactMax + 1);
    expect(checkDraft({ category: 'idea', contact, message: 'hay' }).contact).toBeDefined();
  });
});

describe('roomCodeFromPath', () => {
  it('reads a valid room code from /r/:code only', () => {
    expect(roomCodeFromPath('/r/abc234')).toBe('ABC234');
    expect(roomCodeFromPath('/r/ABC234/')).toBe('ABC234');
    expect(roomCodeFromPath('/')).toBeNull();
    expect(roomCodeFromPath('/r/ABC')).toBeNull();
    expect(roomCodeFromPath('/r/ABCDE0')).toBeNull();
    expect(roomCodeFromPath('/dang-nhap')).toBeNull();
  });
});

describe('buildRequest', () => {
  it('attaches room code and context and trims the text', () => {
    const body = buildRequest({ category: 'rules', contact: '  a@b.vn ', message: '  hay quá \n' }, env);
    expect(body).toEqual({
      category: 'rules',
      message: 'hay quá',
      contact: 'a@b.vn',
      roomCode: 'ABC234',
      context: { path: '/r/ABC234', viewport: '390x844', userAgent: 'UA' },
    });
  });

  it('leaves out an empty contact and the room code outside a room', () => {
    const body = buildRequest({ category: 'ui', contact: ' ', message: 'tốt' }, { ...env, pathname: '/' });
    expect(body).not.toHaveProperty('contact');
    expect(body).not.toHaveProperty('roomCode');
  });

  it('cuts a long user agent to the limit', () => {
    const body = buildRequest({ category: 'ui', contact: '', message: 'tốt' }, { ...env, userAgent: 'u'.repeat(500) });
    expect(body.context?.userAgent).toHaveLength(FEEDBACK_LIMITS.userAgentMax);
  });
});

describe('sendErrorText', () => {
  it('explains rate limiting, network and server failures in Vietnamese', () => {
    expect(sendErrorText(new ApiRequestError(429, 'too_many_feedback', 'x'))).toMatch(/quá nhiều/);
    expect(sendErrorText(new ApiRequestError(0, 'network', 'x'))).toMatch(/kết nối/);
    expect(sendErrorText(new ApiRequestError(503, 'x', 'x'))).toMatch(/sự cố/);
  });

  it('shows the server message for a rejected form', () => {
    expect(sendErrorText(new ApiRequestError(400, 'invalid_message', 'Nội dung chứa ký tự không hợp lệ.'))).toBe('Nội dung chứa ký tự không hợp lệ.');
    expect(sendErrorText(new Error('boom'))).toMatch(/Không gửi được/);
  });
});
