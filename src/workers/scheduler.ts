import type { AdapterHttpClient, SourceAdapterConfig } from "../adapters";
import { runSourceMonitor, type MonitorPersistence, type MonitorRunRecord } from "./monitor";

export interface ScheduledSourceStore extends MonitorPersistence {
  claimDueSources(input: { now: string; owner: string; leaseSeconds: number; limit: number }): Promise<SourceAdapterConfig[]>;
  completeLease(input: { sourceId: string; owner: string; nextPollAt: string; outcome: MonitorRunRecord["outcome"] }): Promise<void>;
}

export interface SchedulerOptions {
  store: ScheduledSourceStore;
  http: AdapterHttpClient;
  owner?: string;
  pollIntervalMs?: number;
  claimLimit?: number;
  leaseSeconds?: number;
  random?: () => number;
  onRun?: (run: MonitorRunRecord) => void;
  onError?: (error: unknown, source?: SourceAdapterConfig) => void;
}

/**
 * In-process scheduler for local/private single-worker deployments. Production
 * can call tick() from a durable scheduler while retaining lease semantics.
 */
export class MonitoringScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopped = true;
  private readonly owner: string;
  private readonly pollIntervalMs: number;
  private readonly claimLimit: number;
  private readonly leaseSeconds: number;

  constructor(private readonly options: SchedulerOptions) {
    this.owner = options.owner ?? `worker-${process.pid}-${crypto.randomUUID()}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.claimLimit = options.claimLimit ?? 3;
    this.leaseSeconds = options.leaseSeconds ?? 120;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.startLoopCycle();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async stopAndWait(): Promise<void> {
    this.stop();
    await this.activeCycle;
  }

  async tick(now = new Date()): Promise<MonitorRunRecord[]> {
    const sources = await this.options.store.claimDueSources({ now: now.toISOString(), owner: this.owner, leaseSeconds: this.leaseSeconds, limit: this.claimLimit });
    const records: MonitorRunRecord[] = [];
    for (const source of sources) {
      try {
        const record = await runSourceMonitor({ source, http: this.options.http, persistence: this.options.store });
        records.push(record);
        this.options.onRun?.(record);
        await this.options.store.completeLease({
          sourceId: source.sourceId,
          owner: this.owner,
          nextPollAt: calculateNextPollAt(source, record, now, this.options.random),
          outcome: record.outcome,
        });
      } catch (error) {
        this.options.onError?.(error, source);
        await this.options.store.completeLease({
          sourceId: source.sourceId,
          owner: this.owner,
          nextPollAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
          outcome: "failed",
        });
      }
    }
    return records;
  }

  private async loop(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      this.options.onError?.(error);
    }
    if (!this.stopped) this.timer = setTimeout(() => this.startLoopCycle(), this.pollIntervalMs);
  }

  private startLoopCycle(): void {
    const cycle = this.loop();
    this.activeCycle = cycle;
    const clear = () => {
      if (this.activeCycle === cycle) this.activeCycle = null;
    };
    void cycle.then(clear, clear);
  }
}

export function calculateNextPollAt(
  source: SourceAdapterConfig,
  run: Pick<MonitorRunRecord, "outcome">,
  now: Date,
  random: () => number = Math.random,
): string {
  const baseMinutes = Math.max(5, source.expectedIntervalMinutes ?? 120);
  const backoffMultiplier = run.outcome === "success" ? 1 : run.outcome === "degraded" ? 2 : 4;
  const randomValue = Math.min(1, Math.max(0, random()));
  const jitter = 0.9 + randomValue * 0.2;
  return new Date(now.getTime() + baseMinutes * backoffMultiplier * jitter * 60_000).toISOString();
}
