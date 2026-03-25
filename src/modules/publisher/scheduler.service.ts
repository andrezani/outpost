import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublisherService } from './publisher.service';

/**
 * SchedulerService: polls for due posts on a fixed interval.
 *
 * Why not Inngest for the poll loop?
 * Inngest requires a deployed endpoint (HTTPS) for dev webhooks.
 * This simple in-process scheduler works locally AND in prod.
 * Once we have a public URL, we can migrate the cron to Inngest.
 *
 * Interval: default 60 seconds (configurable via SCHEDULER_INTERVAL_MS).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private running = false;

  constructor(
    private readonly publisher: PublisherService,
    private readonly config: ConfigService,
  ) {
    this.intervalMs = parseInt(
      this.config.get('SCHEDULER_INTERVAL_MS') ?? '60000',
      10,
    );
  }

  onModuleInit(): void {
    this.logger.log(
      `📅 Scheduler starting — polling every ${this.intervalMs / 1000}s`,
    );
    this.intervalId = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    // Run immediately on startup to catch any missed posts
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('📅 Scheduler stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.debug('Scheduler tick skipped — previous run still in progress');
      return;
    }

    this.running = true;
    try {
      const summaries = await this.publisher.findAndPublishDuePosts();
      if (summaries.length > 0) {
        const succeeded = summaries.filter((s) =>
          s.results.some((r) => r.success),
        ).length;
        this.logger.log(
          `Scheduler: published ${succeeded}/${summaries.length} posts`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Scheduler tick error: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
