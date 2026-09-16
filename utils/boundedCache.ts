/** A small LRU cache. Expiry is enforced on writes as well as reads. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly capacity: number, private readonly now = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number) {
    const now = this.now();
    for (const [cachedKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(cachedKey);
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    while (this.entries.size > Math.max(0, this.capacity)) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear() { this.entries.clear(); }
  get size() { return this.entries.size; }
}
