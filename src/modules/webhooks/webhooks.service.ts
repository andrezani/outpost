import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Webhook, WebhookEvent } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';

export interface CreateWebhookDto {
  url: string;
  events?: WebhookEvent[];
}

export interface WebhookPayload {
  event: WebhookEvent;
  postId: string;
  platform?: string;
  url?: string;
  timestamp: string;
  error?: {
    code: string;
    message: string;
    agentHint: string;
  } | null;
}

/**
 * Manages webhook registrations and delivers events with retries.
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 5s, 30s).
 * Signature: X-Outpost-Signature: sha256=<HMAC-SHA256(secret, payload)>
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async createWebhook(
    organizationId: string,
    dto: CreateWebhookDto,
  ): Promise<Webhook> {
    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    return this.prisma.webhook.create({
      data: {
        organizationId,
        url: dto.url,
        events: dto.events ?? [],
        secret,
      },
    });
  }

  async listWebhooks(organizationId: string): Promise<Webhook[]> {
    return this.prisma.webhook.findMany({
      where: { organizationId, enabled: true },
    });
  }

  async getWebhook(id: string, organizationId: string): Promise<Webhook> {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
    });
    if (!webhook) throw new NotFoundException(`Webhook ${id} not found`);
    return webhook;
  }

  async deleteWebhook(id: string, organizationId: string): Promise<void> {
    await this.getWebhook(id, organizationId);
    await this.prisma.webhook.delete({ where: { id } });
  }

  // ─── Delivery ─────────────────────────────────────────────────────────────

  /**
   * Deliver a webhook event to all enabled webhooks for the org.
   * Called after a post is published or fails.
   * Fire-and-forget — errors are logged, not re-thrown.
   */
  async deliver(
    organizationId: string,
    payload: WebhookPayload,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        enabled: true,
        // If events is empty, fire for all events
        OR: [
          { events: { isEmpty: true } },
          { events: { has: payload.event } },
        ],
      },
    });

    for (const webhook of webhooks) {
      // Fire each delivery independently — don't await or block
      void this.deliverToEndpoint(webhook, payload).catch((err: unknown) => {
        this.logger.error(
          `Webhook delivery failed for ${webhook.id} (${webhook.url}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  /**
   * Deliver payload to a single endpoint with retry.
   * Retries: 3x with 1s, 5s, 30s delays.
   */
  private async deliverToEndpoint(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.sign(webhook.secret, body);

    const delays = [0, 1000, 5000, 30000];

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        await sleep(delays[attempt]);
      }

      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Outpost-Signature': `sha256=${signature}`,
            'X-Outpost-Event': payload.event,
            'X-Outpost-Attempt': String(attempt + 1),
          },
          body,
          signal: AbortSignal.timeout(10_000), // 10s timeout per attempt
        });

        if (res.ok) {
          this.logger.log(
            `✅ Webhook delivered: ${payload.event} → ${webhook.url} (attempt ${attempt + 1})`,
          );
          return;
        }

        this.logger.warn(
          `Webhook attempt ${attempt + 1} failed: ${webhook.url} → HTTP ${res.status}`,
        );
      } catch (err) {
        this.logger.warn(
          `Webhook attempt ${attempt + 1} error: ${webhook.url} → ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.error(
      `❌ Webhook exhausted all retries: ${webhook.url} for event ${payload.event}`,
    );
  }

  /**
   * HMAC-SHA256 signature for webhook verification.
   * Verify on your end: sha256(secret, body) === X-Outpost-Signature.split('sha256=')[1]
   */
  private sign(secret: string, body: string): string {
    return createHmac('sha256', secret).update(body, 'utf-8').digest('hex');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
