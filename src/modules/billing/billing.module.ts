import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './billing.service';
import { TierService } from './tier.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PublicController } from './public.controller';
import { CommonModule } from '../../common/common.module';

/**
 * BillingModule
 *
 * Provides Stripe billing integration for Outpost.
 *
 * Exposes:
 *   POST   /api/v1/billing/subscribe                — subscribe to a plan (returns subscription + client_secret)
 *   DELETE /api/v1/billing/cancel                   — cancel subscription at period end
 *   POST   /api/v1/billing/create-checkout-session  — create a Stripe Checkout session (hosted payment page)
 *   POST   /api/v1/billing/portal                   — create a Stripe Billing Portal session
 *   POST   /api/v1/webhooks/stripe                  — Stripe webhook receiver
 *   GET    /api/v1/public/founding-seats             — unauthenticated founding seat counter (landing page)
 *
 * Guard pattern: if STRIPE_SECRET_KEY is not set in the environment, the app
 * boots normally and billing endpoints return a 400 with a clear message.
 * No Stripe SDK calls are made until the key is present.
 */
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [StripeService, TierService],
  controllers: [BillingController, StripeWebhookController, PublicController],
  exports: [StripeService, TierService],
})
export class BillingModule {}
