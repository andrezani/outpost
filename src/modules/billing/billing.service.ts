import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * StripeService — wraps the Stripe SDK.
 *
 * Guard pattern: if STRIPE_SECRET_KEY is not set, all methods no-op or throw a
 * clear error (same pattern used for RevenueCat keys in Sparq). The app starts
 * and runs without Stripe configured; billing is simply unavailable.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (secretKey && secretKey !== 'sk_test_placeholder') {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2026-02-25.clover',
        typescript: true,
      });
      this.logger.log('Stripe client initialised ✅');
    } else {
      this.stripe = null;
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — billing endpoints are stubbed. ' +
          'Set STRIPE_SECRET_KEY in .env to enable Stripe.',
      );
    }
  }

  /** Returns true when Stripe is configured and usable. */
  get isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured on this server. ' +
          'Set STRIPE_SECRET_KEY in the environment to enable billing.',
      );
    }
    return this.stripe;
  }

  // ─── Customer ──────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Customer for an organization.
   * @param email     Billing contact email (optional)
   * @param orgId     Outpost org ID — stored as metadata for webhook correlation
   */
  async createCustomer(
    orgId: string,
    email?: string,
  ): Promise<Stripe.Customer> {
    const stripe = this.requireStripe();
    const customer = await stripe.customers.create({
      email,
      metadata: { outpost_org_id: orgId },
    });
    this.logger.log(`Customer created: ${customer.id} for org ${orgId}`);
    return customer;
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  /**
   * Create a subscription for a customer.
   * @param customerId    Stripe customer ID
   * @param priceId       Stripe Price ID (Pro / Team / Founding)
   */
  async createSubscription(
    customerId: string,
    priceId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.requireStripe();

    if (!priceId) {
      throw new BadRequestException('priceId is required to create a subscription.');
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    this.logger.log(
      `Subscription created: ${subscription.id} (customer: ${customerId}, price: ${priceId})`,
    );
    return subscription;
  }

  /**
   * Cancel a subscription at period end (graceful downgrade).
   * @param subscriptionId  Stripe subscription ID
   */
  async cancelSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.requireStripe();
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    this.logger.log(`Subscription ${subscriptionId} set to cancel at period end`);
    return subscription;
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Validate + parse a Stripe webhook payload.
   * Throws if the signature is invalid or STRIPE_WEBHOOK_SECRET is not set.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret || webhookSecret === 'whsec_placeholder') {
      throw new BadRequestException(
        'STRIPE_WEBHOOK_SECRET is not configured. ' +
          'Set it in .env to enable webhook signature validation.',
      );
    }

    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  // ─── Price ID helpers ─────────────────────────────────────────────────────

  /**
   * Retrieve the Price ID for a given plan slug.
   * Returns null if the env var is not set (stub guard).
   */
  getPriceId(plan: 'pro' | 'team' | 'founding'): string | null {
    const map: Record<string, string> = {
      pro: this.config.get<string>('STRIPE_PRO_PRICE_ID') ?? '',
      team: this.config.get<string>('STRIPE_TEAM_PRICE_ID') ?? '',
      founding: this.config.get<string>('STRIPE_FOUNDING_PRICE_ID') ?? '',
    };
    const id = map[plan];
    return id && id !== `price_${plan}_placeholder` ? id : null;
  }
}
