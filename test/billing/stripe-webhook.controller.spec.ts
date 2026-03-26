import { HttpStatus } from '@nestjs/common';
import { StripeWebhookController } from '../../src/modules/billing/stripe-webhook.controller';
import type { StripeService } from '../../src/modules/billing/billing.service';
import type { TierService } from '../../src/modules/billing/tier.service';
import type Stripe from 'stripe';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

function makeReq(rawBody?: Buffer) {
  return { rawBody } as Record<string, unknown> & { rawBody?: Buffer };
}
const STRIPE_BODY = Buffer.from('stripe-body');

function makeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  id = 'evt_test_001',
): Stripe.Event {
  return {
    id,
    type,
    data: { object: dataObject },
    object: 'event',
    api_version: '2026-02-25',
    created: 1700000000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
  } as unknown as Stripe.Event;
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockStripeService = {
  constructEvent: jest.fn() as jest.MockedFunction<StripeService['constructEvent']>,
  getPriceId: jest.fn() as jest.MockedFunction<StripeService['getPriceId']>,
} as unknown as StripeService;

const mockTierService = {
  priceIdToTier: jest.fn() as jest.MockedFunction<TierService['priceIdToTier']>,
  setTierByCustomerId: jest.fn() as jest.MockedFunction<TierService['setTierByCustomerId']>,
} as unknown as TierService;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUBSCRIPTION_ACTIVE = {
  id: 'sub_001',
  customer: 'cus_001',
  status: 'active',
  items: { data: [{ price: { id: 'price_pro_001' } }] },
};

const SUBSCRIPTION_CANCELLED = {
  id: 'sub_002',
  customer: 'cus_001',
  status: 'canceled',
  items: { data: [{ price: { id: 'price_pro_001' } }] },
};

const INVOICE_SUCCEEDED = {
  id: 'in_001',
  customer: 'cus_001',
  amount_paid: 2900,
  attempt_count: 1,
};

const INVOICE_FAILED = {
  id: 'in_002',
  customer: 'cus_001',
  amount_due: 2900,
  attempt_count: 2,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StripeWebhookController(mockStripeService, mockTierService);

    // Default mock: getPriceId returns recognisable price IDs
    (mockStripeService.getPriceId as jest.Mock).mockImplementation((plan: string) => `price_${plan}_001`);

    // Default mock: priceIdToTier returns 'pro' for any known price
    (mockTierService.priceIdToTier as jest.Mock).mockReturnValue('pro');

    // Default mock: setTierByCustomerId resolves
    (mockTierService.setTierByCustomerId as jest.Mock).mockResolvedValue(null);
  });

  // ── Missing raw body ────────────────────────────────────────────────────────

  it('returns 400 when rawBody is missing', async () => {
    const req = makeReq(); // no rawBody — defaults to undefined
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_test');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  // ── Invalid signature ───────────────────────────────────────────────────────

  it('returns 400 when signature is invalid', async () => {
    (mockStripeService.constructEvent as jest.Mock).mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'bad_sig');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  // ── subscription.created ────────────────────────────────────────────────────

  it('handles subscription.created and sets tier', async () => {
    const event = makeEvent('customer.subscription.created', SUBSCRIPTION_ACTIVE);
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledWith('cus_001', 'pro');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  // ── subscription.updated ────────────────────────────────────────────────────

  it('handles subscription.updated and sets tier', async () => {
    const event = makeEvent('customer.subscription.updated', SUBSCRIPTION_ACTIVE, 'evt_upd_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledWith('cus_001', 'pro');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('handles subscription.updated with canceled status → downgrades to free', async () => {
    const event = makeEvent('customer.subscription.updated', SUBSCRIPTION_CANCELLED, 'evt_upd_002');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledWith('cus_001', 'free');
  });

  // ── subscription.deleted ────────────────────────────────────────────────────

  it('handles subscription.deleted and downgrades to free', async () => {
    const event = makeEvent('customer.subscription.deleted', SUBSCRIPTION_ACTIVE, 'evt_del_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledWith('cus_001', 'free');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  // ── invoice.payment_succeeded ───────────────────────────────────────────────

  it('handles invoice.payment_succeeded without changing tier', async () => {
    const event = makeEvent('invoice.payment_succeeded', INVOICE_SUCCEEDED, 'evt_pay_ok_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  // ── invoice.payment_failed ──────────────────────────────────────────────────

  it('handles invoice.payment_failed without changing tier', async () => {
    const event = makeEvent('invoice.payment_failed', INVOICE_FAILED, 'evt_pay_fail_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  // ── Unknown event type ──────────────────────────────────────────────────────

  it('handles unknown event type gracefully and returns 200', async () => {
    const event = makeEvent('unknown.event.type', {}, 'evt_unknown_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);
    const res = makeRes();
    await controller.handleStripeWebhook(req as any, res as any, 'sig_ok');

    expect(mockTierService.setTierByCustomerId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('skips duplicate event IDs and returns 200 without processing', async () => {
    const event = makeEvent('customer.subscription.created', SUBSCRIPTION_ACTIVE, 'evt_dupe_001');
    (mockStripeService.constructEvent as jest.Mock).mockReturnValue(event);

    const req = makeReq(STRIPE_BODY);

    // First call — should process
    const res1 = makeRes();
    await controller.handleStripeWebhook(req as any, res1 as any, 'sig_ok');
    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledTimes(1);

    // Second call with same event ID — should skip
    const res2 = makeRes();
    await controller.handleStripeWebhook(req as any, res2 as any, 'sig_ok');
    // No additional tier calls
    expect(mockTierService.setTierByCustomerId).toHaveBeenCalledTimes(1);
    // Still returns 200
    expect(res2.status).toHaveBeenCalledWith(HttpStatus.OK);
  });
});
