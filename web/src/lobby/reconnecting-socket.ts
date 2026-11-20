export type SocketStatus = 'connecting' | 'open' | 'reconnecting';

/** Close codes the room server uses to say "do not reconnect". */
export const STOP_CODES: ReadonlySet<number> = new Set([4001, 4002, 4003, 4004, 4005]);

/** Delay before reconnect attempt `attempt` (0-based): exponential from 400 ms, capped at 8 s, with jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(8000, 400 * 2 ** attempt);
  return Math.round(base * (0.75 + random() * 0.5));
}

export function socketUrl(path: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${path}`;
}

export interface ReconnectingSocketOptions {
  path: string;
  onMessage: (data: string) => void;
  onStatus: (status: SocketStatus) => void;
  /** Runs before every connection attempt; a non-null result stops reconnecting for good. */
  gate?: () => Promise<string | null>;
  onStop?: (reason: string) => void;
  /** Close code from the server that ended this socket for good (see STOP_CODES). */
  onServerStop?: (code: number) => void;
}

export interface ReconnectingSocket {
  send: (data: string) => boolean;
  close: () => void;
}

export function openReconnectingSocket(opts: ReconnectingSocketOptions): ReconnectingSocket {
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;
  let everOpened = false;

  const schedule = () => {
    if (stopped) return;
    opts.onStatus('reconnecting');
    timer = setTimeout(() => void connect(), backoffDelay(attempt));
    attempt += 1;
  };

  const connect = async () => {
    if (stopped) return;
    if (opts.gate) {
      const reason = await opts.gate().catch(() => null);
      if (stopped) return;
      if (reason !== null) {
        stopped = true;
        opts.onStop?.(reason);
        return;
      }
    }
    const socket = new WebSocket(socketUrl(opts.path));
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      everOpened = true;
      opts.onStatus('open');
    };
    socket.onmessage = (ev: MessageEvent<unknown>) => {
      if (typeof ev.data === 'string') opts.onMessage(ev.data);
    };
    socket.onclose = (ev) => {
      if (ws === socket) ws = null;
      if (stopped) return;
      if (STOP_CODES.has(ev.code)) {
        stopped = true;
        opts.onServerStop?.(ev.code);
        return;
      }
      schedule();
    };
  };

  opts.onStatus(everOpened ? 'reconnecting' : 'connecting');
  void connect();

  return {
    send: (data) => {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(data);
      return true;
    },
    close: () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close(1000);
      ws = null;
    },
  };
}
