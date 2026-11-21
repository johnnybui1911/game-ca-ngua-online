/** Classic token bucket: `capacity` tokens at most, refilled continuously at `refillPerSec`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  /** Spends one token; false when the bucket is empty. */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSec);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One bucket per key, created full on first use. Lives in memory, so a key's budget outlasts its sockets. */
export class KeyedTokenBuckets {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  take(key: string, now: number): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSec, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }
}
