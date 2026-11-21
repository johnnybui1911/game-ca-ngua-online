import type { ApiError } from '../../shared/protocol';

/** An error that maps to a stable `ApiError` response. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  toBody(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}
