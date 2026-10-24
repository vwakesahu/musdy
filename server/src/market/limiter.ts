export class Limiter {
  private stamps: number[] = [];

  constructor(
    private max: number,
    private windowMs = 60_000,
    private gapMs = 0,
    private now: () => number = Date.now,
  ) {}

  async take(maxWaitMs = Infinity): Promise<boolean> {
    for (;;) {
      const t = this.now();
      while (this.stamps.length && t - this.stamps[0]! >= this.windowMs) this.stamps.shift();
      const since = this.stamps.length ? t - this.stamps[this.stamps.length - 1]! : Infinity;
      if (this.stamps.length < this.max && since >= this.gapMs) {
        this.stamps.push(t);
        return true;
      }
      const wait = this.stamps.length < this.max ? this.gapMs - since + 5 : this.windowMs - (t - this.stamps[0]!) + 5;
      if (wait > maxWaitMs) return false;
      await Bun.sleep(wait);
    }
  }

  // after a 429 the whole window is spent
  exhaust() {
    const t = this.now();
    this.stamps = Array.from({ length: this.max }, () => t);
  }
}
