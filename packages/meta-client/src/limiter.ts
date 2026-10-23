/**
 * Semaphore: giới hạn số tác vụ chạy đồng thời. Khi nhả slot mà có tác vụ đang chờ, slot được
 * chuyển thẳng cho tác vụ đó (không giảm bộ đếm) để không có tác vụ mới chen vào giữa.
 */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {}

  setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
    while (this.active < this.limit && this.queue.length) {
      this.active++;
      this.queue.shift()!();
    }
  }

  get size(): number {
    return this.limit;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++;
    else await new Promise<void>((resolve) => this.queue.push(resolve));
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private release(): void {
    const next = this.active <= this.limit ? this.queue.shift() : undefined;
    if (next) next();
    else this.active--;
  }
}

/**
 * Giới hạn đồng thời theo ad account (mặc định 1 request/lúc) và theo app (mặc định 5) — L3 6.2.
 */
export class MetaLimiter {
  private readonly global: Semaphore;
  private readonly perAccount = new Map<string, Semaphore>();

  constructor(
    appConcurrency = 5,
    private readonly accountConcurrency = 1,
  ) {
    this.global = new Semaphore(appConcurrency);
  }

  /** Giảm tốc khi Meta báo gần chạm hạn mức (playbook meta_rate_limited: giảm 50%). */
  throttle(factor = 0.5): void {
    this.global.setLimit(Math.floor(this.global.size * factor));
  }

  restore(appConcurrency: number): void {
    this.global.setLimit(appConcurrency);
  }

  get appConcurrency(): number {
    return this.global.size;
  }

  run<T>(account: string | null, fn: () => Promise<T>): Promise<T> {
    if (!account) return this.global.run(fn);
    let sem = this.perAccount.get(account);
    if (!sem) {
      sem = new Semaphore(this.accountConcurrency);
      this.perAccount.set(account, sem);
    }
    return sem.run(() => this.global.run(fn));
  }
}
