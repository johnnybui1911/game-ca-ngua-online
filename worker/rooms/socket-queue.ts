/**
 * Runs the tasks of one key (a socket) strictly one after another, in the order they were
 * submitted. A message handler that awaits must not let the socket's next message overtake it.
 * A failing task rejects only its own result; later tasks still run.
 */
export class KeyedQueue<K extends object> {
  private readonly tails = new WeakMap<K, Promise<unknown>>();

  run(key: K, task: () => Promise<void>): Promise<void> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(task);
    this.tails.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}
