import { errMessage, log } from "./log";

export interface BlockSteps {
  index(target: number): Promise<void>;
  price(target: number): Promise<void>;
  // never awaited by the loop, a slow pass must not hold up indexing, prices or the feed
  watch(): Promise<void>;
}

export class BlockLoop {
  private wanted: number;
  private done: number;
  private running = false;
  private waiters: { n: number; resolve: () => void }[] = [];
  private watching: Promise<void> | null = null;
  private watchAgain = false;

  constructor(
    private steps: BlockSteps,
    head: number,
  ) {
    this.wanted = head;
    this.done = head - 1;
  }

  get processed(): number {
    return this.done;
  }

  behind(): boolean {
    return this.done < this.wanted;
  }

  want(n: number) {
    this.wanted = Math.max(this.wanted, n);
    void this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.done < this.wanted) {
        const target = this.wanted;
        await this.steps.index(target);
        await this.steps.price(target);
        this.kickWatcher();
        this.done = target;
        for (const w of this.waiters.splice(0)) {
          if (w.n <= this.done) w.resolve();
          else this.waiters.push(w);
        }
      }
    } catch (e) {
      log("block.error", { wanted: this.wanted, done: this.done, error: errMessage(e) });
    } finally {
      this.running = false;
    }
  }

  private kickWatcher() {
    if (this.watching) {
      this.watchAgain = true;
      return;
    }
    this.watching = this.steps
      .watch()
      .catch((e: unknown) => log("watcher.error", { error: errMessage(e) }))
      .finally(() => {
        this.watching = null;
        if (this.watchAgain) {
          this.watchAgain = false;
          this.kickWatcher();
        }
      });
  }

  async watcherIdle(): Promise<void> {
    while (this.watching) await this.watching;
  }

  waitFor(n: number, timeoutMs = 15000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.done >= n) return resolve();
      const timer = setTimeout(() => reject(new Error(`block ${n} not processed, at ${this.done}`)), timeoutMs);
      this.waiters.push({ n, resolve: () => (clearTimeout(timer), resolve()) });
      this.want(n);
    });
  }
}
