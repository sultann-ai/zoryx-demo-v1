// A seeded random generator (mulberry32), so every demo reset produces exactly the same data — only
// the dates move, because they're relative to the day the reset runs.

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // 0 <= n < 1
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // min..max inclusive
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("pick from an empty list");
    }
    return items[Math.floor(this.next() * items.length)] as T;
  }

  // Each entry's weight is its relative likelihood.
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) {
        return value;
      }
    }
    return entries[entries.length - 1]![0];
  }

  // A v4-shaped UUID drawn from this generator, so ids are stable across resets too.
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => Math.floor(this.next() * 16).toString(16));
    hex[12] = "4";
    hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
    const s = hex.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }

  // From an alphabet, e.g. the public order code's.
  code(alphabet: string, length: number): string {
    return Array.from({ length }, () => alphabet[Math.floor(this.next() * alphabet.length)]).join("");
  }
}
