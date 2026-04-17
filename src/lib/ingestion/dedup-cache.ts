import { createLogger } from "@/lib/logger";

const log = createLogger("dedup-cache");

const DEFAULT_MAX_ENTRIES = 10_000;

export class DedupCache {
  private profileCaches = new Map<string, Set<string>>();
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Check which hashes are NOT in cache (i.e., need DB lookup) */
  filterMisses(profileId: string, hashes: string[]): string[] {
    let cache = this.profileCaches.get(profileId);
    if (!cache) {
      cache = new Set();
      this.profileCaches.set(profileId, cache);
    }

    const misses: string[] = [];
    for (const hash of hashes) {
      if (!cache.has(hash)) {
        misses.push(hash);
      }
    }
    return misses;
  }

  /** Add hashes to the cache for a profile */
  addHashes(profileId: string, hashes: string[]) {
    let cache = this.profileCaches.get(profileId);
    if (!cache) {
      cache = new Set();
      this.profileCaches.set(profileId, cache);
    }

    for (const hash of hashes) {
      cache.add(hash);
    }

    // Evict oldest entries if over capacity
    if (cache.size > this.maxEntries) {
      const excess = cache.size - this.maxEntries;
      const iterator = cache.values();
      for (let i = 0; i < excess; i++) {
        const entry = iterator.next();
        if (!entry.done) {
          cache.delete(entry.value);
        }
      }
    }
  }

  /** Remove a profile's cache when profile is stopped */
  evictProfile(profileId: string) {
    this.profileCaches.delete(profileId);
  }

  getStats() {
    return {
      profiles: this.profileCaches.size,
      totalEntries: [...this.profileCaches.values()].reduce((sum, s) => sum + s.size, 0),
    };
  }
}

let _cache: DedupCache | null = null;

export function getDedupCache(): DedupCache {
  if (!_cache) {
    _cache = new DedupCache();
  }
  return _cache;
}
