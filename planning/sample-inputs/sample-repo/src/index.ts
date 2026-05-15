// Entry point for the Reachy sample repo.
// Demonstrates the surface area the code parser is expected to recover.

export interface CacheEntry {
  key: string;
  bytes: number;
}

export function fib(n: number): number {
  if (n < 2) return n;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
}

export const DEFAULT_LIMIT = 64 * 1024;

export class CacheService {
  private readonly entries: CacheEntry[] = [];

  public push(entry: CacheEntry): void {
    this.entries.push(entry);
  }

  public total(): number {
    return this.entries.reduce((acc, e) => acc + e.bytes, 0);
  }
}
