import type { ApiError } from '../../shared/protocol';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON request against the worker. Throws `ApiRequestError` with the server's code and message. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Không kết nối được máy chủ. Vui lòng thử lại.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? 'unknown', err?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.');
  }
  return data as T;
}
