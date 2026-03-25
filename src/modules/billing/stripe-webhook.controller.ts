import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import Stripe from 'stripe';
import { StripeService } from './billing.service';
import { TierService } from './tier.service';
import type { OrgTier as TierKey } from '../../common/tier-limits';

/**
 * StripeWebhookController
 *
 * POST /api/v1/webhooks/stripe
 *
 * Handles incoming Stripe webhook events.
 * Raw body parsing is required for signature verification — express raw body
 * middleware is applied selectively via the `rawBody` option in main.ts.
 *
 * Handled events:
 *   - customer.subscription.created  → set org tier from price
 *   - customer.subscription.updated  → set org tier from current price
 *   - customer.subscription.deleted  → downgrade org to free
 *   - invoice.payment_failed         → log + (future: notify org)
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly tierService: TierService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Not an authenticated endpoint — exclude from Swagger auth docs
  @ApiOperation({
    summary: 'Stripe webhook receiver',
    description:
      'Receives and processes Stripe webhook events. ' +
      'Requires valid Stripe-Signature header. ' +
      'This endpoint does NOT require an API key.',
  })
  @ApiResponse({ status: 200, description: 'Event processed.' })
  @ApiResponse({ status: 400, description: 'Invalid signature or unrecognised event.' })
  async handleStripeWebhook(
    @Req() req: Record<string, unknown> & { rawBody?: Buffer; body?: Buffer | unknown },
    @Res() res: { status: (code: number) => { json: (body: unknown) => void } },
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    // Raw body is required for Stripe signature verification.
    // We read it from req.rawBody (set by NestJS rawBody:true option) or req.body.
    const rawBody: Buffer = (req.rawBody as Buffer | undefined) ?? (req.body as Buffer);

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      this.logger.error('Stripe webhook: raw body not available — ensure raw body middleware is enabled');
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Raw body required for signature verification.' });
      return;
    }

    if (!signature) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing Stripe-Signature header.' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe webhook signature validation failed: ${message}`);
      res.status(HttpStatus.BAD_REQUEST).json({ error: `Webhook signature invalid: ${message}` });
      return;
    }

    this.logger.log(`Stripe event received: ${event.type} (${event.id})`);

    try {
      await this.processEvent(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Stripe event processing failed for ${event.type}: ${message}`);
      // Return 200 to prevent Stripe retrying — log the error for ops
      res.status(HttpStatus.OK).json({ received: true, error: message });
      return;
    }

    res.status(HttpStatus.OK).json({ received: true });
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type} — ignoring`);
    }
  }

  private async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId = this.resolveCustomerId(subscription.customer);
    const priceId = this.extractPriceId(subscription);

    if (!customerId || !priceId) {
      this.logger.warn(
        `subscription.created: missing customerId or priceId — sub ${subscription.id}`,
      );
      return;
    }

    const tier = this.tierService.priceIdToTier(
      priceId,
      this.stripeService.getPriceId('pro'),
      this.stripeService.getPriceId('team'),
      this.stripeService.getPriceId('founding'),
    );

    await this.tierService.setTierByCustomerId(customerId, tier);
    this.logger.log(
      `subscription.created: org upgraded to ${tier} (customer: ${customerId}, sub: ${subscription.id})`,
    );
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId = this.resolveCustomerId(subscription.customer);
    const priceId = this.extractPriceId(subscription);

    if (!customerId || !priceId) {
      this.logger.warn(
        `subscription.updated: missing customerId or priceId — sub ${subscription.id}`,
      );
      return;
    }

    // If the subscription is being cancelled (cancel_at_period_end) or is already cancelled,
    // don't change the tier yet — wait for subscription.deleted.
    if (subscription.status === 'canceled') {
      await this.tierService.setTierByCustomerId(customerId, 'free');
      this.logger.log(
        `subscription.updated: subscription cancelled → downgrading to free (customer: ${customerId})`,
      );
      return;
    }

    const tier = this.tierService.priceIdToTier(
      priceId,
      this.stripeService.getPriceId('pro'),
      this.stripeService.getPriceId('team'),
      this.stripeService.getPriceId('founding'),
    );

    await this.tierService.setTierByCustomerId(customerId, tier);
    this.logger.log(
      `subscription.updated: org tier set to ${tier} (customer: ${customerId}, sub: ${subscription.id})`,
    );
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId = this.resolveCustomerId(subscription.customer);

    if (!customerId) {
      this.logger.warn(
        `subscription.deleted: missing customerId — sub ${subscription.id}`,
      );
      return;
    }

    await this.tierService.setTierByCustomerId(customerId, 'free' as TierKey);
    this.logger.log(
      `subscription.deleted: org downgraded to free (customer: ${customerId}, sub: ${subscription.id})`,
    );
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = this.resolveCustomerId(invoice.customer);
    const amount = invoice.amount_due;
    const attempt = invoice.attempt_count;

    this.logger.warn(
      `invoice.payment_failed: customer ${customerId ?? 'unknown'}, ` +
        `amount: ${amount}, attempt: ${attempt}, invoice: ${invoice.id}`,
    );

    // TODO (Phase 3): notify org via email + in-app banner.
    // For now we log only — Stripe will retry the charge automatically.
    // After max retries Stripe fires subscription.deleted which downgrades the tier.
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private resolveCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): string | null {
    if (!customer) return null;
    if (typeof customer === 'string') return customer;
    return customer.id;
  }

  private extractPriceId(subscription: Stripe.Subscription): string | null {
    const item = subscription.items?.data?.[0];
    return item?.price?.id ?? null;
  }
}
