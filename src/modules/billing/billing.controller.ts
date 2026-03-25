import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiBody,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, IsEmail } from 'class-validator';
import { StripeService } from './billing.service';
import { TierService } from './tier.service';
import { PrismaService } from '../../common/prisma.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

export class CreateCheckoutSessionDto {
  @IsEnum(['pro', 'team', 'founding'], {
    message: 'plan must be one of: pro, team, founding',
  })
  plan!: 'pro' | 'team' | 'founding';

  @IsString()
  successUrl!: string;

  @IsString()
  cancelUrl!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class SubscribeDto {
  @IsEnum(['pro', 'team', 'founding'], {
    message: 'plan must be one of: pro, team, founding',
  })
  plan!: 'pro' | 'team' | 'founding';

  @IsOptional()
  @IsEmail()
  email?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    private readonly tier: TierService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/v1/billing/create-checkout-session
   *
   * Creates a Stripe Checkout session for the authenticated org.
   * Returns a hosted payment URL to redirect the user to.
   */
  @Post('create-checkout-session')
  @ApiOperation({
    summary: 'Create Stripe Checkout session',
    description:
      'Creates a Stripe Checkout session for the authenticated organization.\n\n' +
      'Returns a `url` to redirect the user to for hosted payment.\n\n' +
      '**Plans:** `pro` ($29/mo), `team` ($99/mo), `founding` ($49/mo).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['plan', 'successUrl', 'cancelUrl'],
      properties: {
        plan: { type: 'string', enum: ['pro', 'team', 'founding'], example: 'pro' },
        successUrl: { type: 'string', example: 'https://app.example.com/billing/success' },
        cancelUrl: { type: 'string', example: 'https://app.example.com/billing/cancel' },
        email: { type: 'string', format: 'email', example: 'billing@yourcompany.com' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Checkout session created. Redirect user to `url`.' })
  @ApiResponse({ status: 400, description: 'Invalid plan or Stripe not configured.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  async createCheckoutSession(
    @Body() dto: CreateCheckoutSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    const org = req.organization;

    const priceId = this.stripe.getPriceId(dto.plan);
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID for plan "${dto.plan}" is not configured. ` +
          `Set STRIPE_${dto.plan.toUpperCase()}_PRICE_ID in .env.`,
      );
    }

    // Create or reuse Stripe customer
    let customerId = org.paymentId;
    if (!customerId) {
      const customer = await this.stripe.createCustomer(org.id, dto.email);
      customerId = customer.id;
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { paymentId: customerId },
      });
    }

    const session = await this.stripe.createCheckoutSession(
      customerId,
      priceId,
      dto.successUrl,
      dto.cancelUrl,
    );

    return { url: session.url ?? '' };
  }

  /**
   * POST /api/v1/billing/portal
   *
   * Creates a Stripe Billing Portal session for the authenticated org.
   * Requires an existing Stripe customer (org must have subscribed first).
   */
  @Post('portal')
  @ApiOperation({
    summary: 'Create Stripe Billing Portal session',
    description:
      'Creates a Stripe Billing Portal session so the customer can manage their subscription, ' +
      'update payment details, or cancel.\n\n' +
      'Requires the organization to have an existing Stripe customer (must have subscribed first).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['returnUrl'],
      properties: {
        returnUrl: {
          type: 'string',
          example: 'https://app.example.com/settings/billing',
          description: 'URL to return to after leaving the portal',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Portal session created. Redirect user to `url`.' })
  @ApiResponse({ status: 400, description: 'No billing account found or Stripe not configured.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  async createPortalSession(
    @Body() body: { returnUrl: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    const org = req.organization;

    if (!org.paymentId) {
      throw new BadRequestException('No billing account found — subscribe first.');
    }

    const session = await this.stripe.createPortalSession(org.paymentId, body.returnUrl);
    return { url: session.url };
  }

  /**
   * POST /api/v1/billing/subscribe
   *
   * Create a Stripe customer + subscription for the authenticated org.
   * Returns the subscription object (including client_secret for payment confirmation).
   *
   * Requires Stripe to be configured (STRIPE_SECRET_KEY set).
   */
  @Post('subscribe')
  @ApiOperation({
    summary: 'Subscribe to a plan',
    description:
      'Creates a Stripe customer and subscription for the authenticated organization.\n\n' +
      '**Plans:** `pro` ($29/mo), `team` ($99/mo), `founding` ($49/mo locked — first 50 customers).\n\n' +
      'Returns a Stripe subscription with an embedded `client_secret` for ' +
      'payment confirmation via the Stripe.js SDK.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['plan'],
      properties: {
        plan: {
          type: 'string',
          enum: ['pro', 'team', 'founding'],
          example: 'pro',
        },
        email: {
          type: 'string',
          format: 'email',
          example: 'billing@yourcompany.com',
          description: 'Billing contact email (optional)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Subscription created. Use client_secret to confirm payment.' })
  @ApiResponse({ status: 400, description: 'Invalid plan or Stripe not configured.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  async subscribe(
    @Body() dto: SubscribeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const org = req.organization;

    const priceId = this.stripe.getPriceId(dto.plan);
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID for plan "${dto.plan}" is not configured. ` +
          `Set STRIPE_${dto.plan.toUpperCase()}_PRICE_ID in .env.`,
      );
    }

    // Create or reuse Stripe customer
    let customerId = org.paymentId;
    if (!customerId) {
      const customer = await this.stripe.createCustomer(org.id, dto.email);
      customerId = customer.id;

      // Persist customer ID on the org
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { paymentId: customerId },
      });
    }

    const subscription = await this.stripe.createSubscription(customerId, priceId);
    return { subscriptionId: subscription.id, subscription };
  }

  /**
   * DELETE /api/v1/billing/cancel
   *
   * Cancel the authenticated org's active Stripe subscription at period end.
   * The org retains its current tier until the billing period ends.
   */
  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel subscription',
    description:
      'Cancels the subscription at the end of the current billing period. ' +
      'The organization retains its tier until then.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['subscriptionId'],
      properties: {
        subscriptionId: {
          type: 'string',
          example: 'sub_1234abcd',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Subscription will cancel at period end.' })
  @ApiResponse({ status: 400, description: 'Stripe not configured or missing subscriptionId.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  async cancel(
    @Body() body: { subscriptionId: string },
    @Req() _req: AuthenticatedRequest,
  ) {
    if (!body.subscriptionId) {
      throw new BadRequestException('subscriptionId is required.');
    }

    const subscription = await this.stripe.cancelSubscription(body.subscriptionId);
    return {
      message: 'Subscription will cancel at period end.',
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      subscription,
    };
  }
}
