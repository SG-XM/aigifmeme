import Stripe from 'stripe';

import {
  CheckoutSession,
  PaymentBilling,
  PaymentEventType,
  PaymentInterval,
  PaymentInvoice,
  PaymentStatus,
  PaymentType,
  SubscriptionCycleType,
  SubscriptionInfo,
  SubscriptionStatus,
  type PaymentConfigs,
  type PaymentEvent,
  type PaymentOrder,
  type PaymentProvider,
  type PaymentSession,
} from './types';

/**
 * Stripe payment provider configs
 * @docs https://stripe.com/docs
 */
export interface StripeConfigs extends PaymentConfigs {
  secretKey: string;
  publishableKey: string;
  signingSecret?: string;
  apiVersion?: string;
  allowedPaymentMethods?: string[];
  allowPromotionCodes?: boolean;
}

/**
 * Stripe payment provider implementation
 * @website https://stripe.com/
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  configs: StripeConfigs;

  private client: Stripe;

  constructor(configs: StripeConfigs) {
    this.configs = configs;
    this.client = new Stripe(configs.secretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }

  async createPayment({
    order,
  }: {
    order: PaymentOrder;
  }): Promise<CheckoutSession> {
    try {
      // check payment price
      if (!order.price) {
        throw new Error('price is required');
      }

      // create payment with dynamic product

      // build price data
      const productName =
        order.productName?.trim() || order.description?.trim();
      if (!productName) {
        throw new Error('Product name is required to create a Stripe checkout');
      }

      const productDescription = order.description?.trim();
      const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData =
        {
          currency: order.price.currency,
          unit_amount: order.price.amount, // unit: cents
          product_data: {
            name: productName,
            ...(productDescription ? { description: productDescription } : {}),
          },
        };

      if (order.type === PaymentType.SUBSCRIPTION) {
        // create subscription payment

        // check payment plan
        if (!order.plan) {
          throw new Error('plan is required');
        }

        // build recurring data
        priceData.recurring = {
          interval: order.plan
            .interval as Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval,
        };
      } else {
        // create one-time payment
      }

      const customerId = await this.ensureCustomer(order.customer);

      // create payment session params
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        // Keep fixed EUR catalog and USD retention prices consistent with the displayed offer.
        ...(order.price.currency.toLowerCase() === 'eur' ||
        order.requestId?.startsWith('retention_')
          ? { adaptive_pricing: { enabled: false } }
          : {}),
        mode:
          order.type === PaymentType.SUBSCRIPTION ? 'subscription' : 'payment',
        line_items: [
          {
            price_data: priceData,
            quantity: 1,
          },
        ],
      };

      // pre-set promotion code
      if (order.discount && order.discount.code) {
        sessionParams.discounts = [
          {
            promotion_code: order.discount.code,
          },
        ];
      }

      // allow user input promotion code
      if (this.configs.allowPromotionCodes && !sessionParams.discounts) {
        sessionParams.allow_promotion_codes = true;
      }

      // If currency is CNY, enable WeChat Pay and Alipay (only for one-time payments)
      // Note: WeChat Pay and Alipay through Stripe only supports one-time payments, not subscriptions
      const currency = order.price.currency.toLowerCase();
      if (currency === 'cny' && order.type === PaymentType.ONE_TIME) {
        // Enable WeChat Pay and Alipay for CNY one-time payments
        sessionParams.payment_method_types = [];
        sessionParams.payment_method_options = {};

        // get allowed payment methods
        const allowedPaymentMethods = this.configs.allowedPaymentMethods || [];

        if (allowedPaymentMethods.includes('card')) {
          sessionParams.payment_method_types.push('card');
        }
        if (allowedPaymentMethods.includes('wechat_pay')) {
          sessionParams.payment_method_types.push('wechat_pay');
          sessionParams.payment_method_options.wechat_pay = {
            client: 'web',
          };
        }
        if (allowedPaymentMethods.includes('alipay')) {
          sessionParams.payment_method_types.push('alipay');
          sessionParams.payment_method_options.alipay = {};
        }

        if (allowedPaymentMethods.length === 0) {
          // not set allowed payment methods, use default payment methods
          sessionParams.payment_method_types = ['card'];
        }
      }

      if (order.type === PaymentType.ONE_TIME) {
        sessionParams.invoice_creation = {
          enabled: true,
        };
      }

      if (customerId) {
        sessionParams.customer = customerId;
      }

      if (order.metadata) {
        sessionParams.metadata = order.metadata;
      }

      if (order.successUrl) {
        sessionParams.success_url = order.successUrl;
      }

      if (order.cancelUrl) {
        sessionParams.cancel_url = order.cancelUrl;
      }

      const session = await this.client.checkout.sessions.create(
        sessionParams,
        ...(order.requestId ? [{ idempotencyKey: order.requestId }] : [])
      );
      if (!session.id || !session.url) {
        throw new Error('create payment failed');
      }

      return {
        provider: this.name,
        checkoutParams: sessionParams,
        checkoutInfo: {
          sessionId: session.id,
          checkoutUrl: session.url,
        },
        checkoutResult: session,
        metadata: order.metadata || {},
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment session by session id
   */
  async getPaymentSession({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<PaymentSession> {
    try {
      if (!sessionId) {
        throw new Error('sessionId is required');
      }

      if (sessionId.startsWith('pi_')) {
        const intent = await this.client.paymentIntents.retrieve(sessionId);
        return await this.buildPaymentSessionFromPaymentIntent(intent);
      }

      const session = await this.client.checkout.sessions.retrieve(sessionId);

      return await this.buildPaymentSessionFromCheckoutSession(session);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment event from webhook notification
   */
  async getPaymentEvent({ req }: { req: Request }): Promise<PaymentEvent> {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get('stripe-signature') as string;

      if (!rawBody || !signature) {
        throw new Error('Invalid webhook request');
      }

      if (!this.configs.signingSecret) {
        throw new Error('Signing Secret not configured');
      }

      // Worker crypto only supports async signature verification.
      const event = await this.client.webhooks.constructEventAsync(
        rawBody,
        signature,
        this.configs.signingSecret
      );

      let paymentSession: PaymentSession | undefined = undefined;

      const eventType = this.mapStripeEventType(event.type);

      if (
        event.type === 'payment_intent.succeeded' ||
        event.type === 'payment_intent.payment_failed'
      ) {
        const intent = event.data.object as Stripe.PaymentIntent;
        paymentSession =
          await this.buildPaymentSessionFromPaymentIntent(intent);
        if (
          event.type === 'payment_intent.succeeded' &&
          intent.metadata?.subscription_id &&
          !paymentSession.subscriptionInfo
        ) {
          throw new Error('Subscription is not active yet');
        }
      } else if (eventType === PaymentEventType.CHECKOUT_SUCCESS) {
        paymentSession = await this.buildPaymentSessionFromCheckoutSession(
          event.data.object as Stripe.Response<Stripe.Checkout.Session>
        );
      } else if (eventType === PaymentEventType.PAYMENT_SUCCESS) {
        paymentSession = await this.buildPaymentSessionFromInvoice(
          event.data.object as Stripe.Response<Stripe.Invoice>
        );
      } else if (eventType === PaymentEventType.SUBSCRIBE_UPDATED) {
        paymentSession = await this.buildPaymentSessionFromSubscription(
          event.data.object as Stripe.Response<Stripe.Subscription>
        );
      } else if (eventType === PaymentEventType.SUBSCRIBE_CANCELED) {
        paymentSession = await this.buildPaymentSessionFromSubscription(
          event.data.object as Stripe.Response<Stripe.Subscription>
        );
      }

      if (!paymentSession) {
        throw new Error('Invalid webhook event');
      }

      return {
        eventType: eventType,
        eventResult: event,
        paymentSession: paymentSession,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPaymentInvoice({
    invoiceId,
  }: {
    invoiceId: string;
  }): Promise<PaymentInvoice> {
    try {
      const invoice = await this.client.invoices.retrieve(invoiceId);
      if (!invoice.id) {
        throw new Error('Invoice not found');
      }

      return {
        invoiceId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url || undefined,
        amount: invoice.amount_paid,
        currency: invoice.currency,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPaymentBilling({
    customerId,
    returnUrl,
  }: {
    customerId: string;
    returnUrl?: string;
  }): Promise<PaymentBilling> {
    try {
      const billing = await this.client.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      if (!billing.url) {
        throw new Error('get billing url failed');
      }

      return {
        billingUrl: billing.url,
      };
    } catch (error) {
      throw error;
    }
  }

  async cancelSubscription({
    subscriptionId,
  }: {
    subscriptionId: string;
  }): Promise<PaymentSession> {
    try {
      if (!subscriptionId) {
        throw new Error('subscriptionId is required');
      }

      const subscription =
        await this.client.subscriptions.cancel(subscriptionId);

      if (!subscription.canceled_at) {
        throw new Error('Cancel subscription failed');
      }

      return await this.buildPaymentSessionFromSubscription(subscription);
    } catch (error) {
      throw error;
    }
  }

  private mapStripeEventType(eventType: string): PaymentEventType {
    switch (eventType) {
      case 'checkout.session.completed':
      case 'payment_intent.succeeded':
        return PaymentEventType.CHECKOUT_SUCCESS;
      case 'payment_intent.payment_failed':
        return PaymentEventType.PAYMENT_FAILED;
      case 'invoice.payment_succeeded':
        return PaymentEventType.PAYMENT_SUCCESS;
      case 'invoice.payment_failed':
        return PaymentEventType.PAYMENT_FAILED;
      case 'customer.subscription.updated':
        return PaymentEventType.SUBSCRIBE_UPDATED;
      case 'customer.subscription.deleted':
        return PaymentEventType.SUBSCRIBE_CANCELED;
      default:
        throw new Error(`Unknown Stripe event type: ${eventType}`);
    }
  }

  private mapStripeStatus(
    session: Stripe.Response<Stripe.Checkout.Session>
  ): PaymentStatus {
    switch (session.status) {
      case 'complete':
        // session complete, check payment status
        switch (session.payment_status) {
          case 'paid':
            // payment success
            return PaymentStatus.SUCCESS;
          case 'unpaid':
            // payment failed
            return PaymentStatus.PROCESSING;
          case 'no_payment_required':
            // means payment not required, should be success
            return PaymentStatus.SUCCESS;
          default:
            throw new Error(
              `Unknown Stripe payment status: ${session.payment_status}`
            );
        }
      case 'expired':
        // payment canceled
        return PaymentStatus.CANCELED;
      case 'open':
        return PaymentStatus.PROCESSING;
      default:
        throw new Error(`Unknown Stripe status: ${session.status}`);
    }
  }

  // build payment session from checkout session
  private async buildPaymentSessionFromCheckoutSession(
    session: Stripe.Response<Stripe.Checkout.Session>
  ): Promise<PaymentSession> {
    let subscription: Stripe.Response<Stripe.Subscription> | undefined =
      undefined;
    let billingUrl = '';

    if (session.subscription) {
      subscription = await this.client.subscriptions.retrieve(
        session.subscription as string
      );
    }

    const result: PaymentSession = {
      provider: this.name,
      paymentStatus: this.mapStripeStatus(session),
      paymentInfo: {
        transactionId: session.id,
        discountCode: session.discounts?.find(
          (discount) => discount.promotion_code
        )?.promotion_code as string,
        discountAmount: session.total_details?.amount_discount || 0,
        discountCurrency: session.currency || '',
        paymentAmount: session.amount_total || 0,
        paymentCurrency: session.currency || '',
        paymentEmail:
          session.customer_email ||
          session.customer_details?.email ||
          undefined,
        paymentUserName: session.customer_details?.name || '',
        paymentUserId: session.customer
          ? (session.customer as string)
          : undefined,
        paidAt: session.created ? new Date(session.created * 1000) : undefined,
        invoiceId: session.invoice ? (session.invoice as string) : undefined,
        invoiceUrl: '',
      },
      paymentResult: session,
      metadata: session.metadata,
    };

    if (subscription) {
      result.subscriptionId = subscription.id;
      result.subscriptionInfo = await this.buildSubscriptionInfo(subscription);
      result.subscriptionResult = subscription;
    }

    return result;
  }

  // build payment session from invoice
  private async buildPaymentSessionFromInvoice(
    invoice: Stripe.Response<Stripe.Invoice>
  ): Promise<PaymentSession> {
    let subscription: Stripe.Response<Stripe.Subscription> | undefined =
      undefined;
    let billingUrl = '';

    if (invoice.lines.data.length > 0) {
      const data = invoice.lines.data[0];
      let subscriptionId = '';

      // get subscription id from invoice line data
      if (data.subscription) {
        subscriptionId = data.subscription as string;
      } else if (
        data.parent &&
        data.parent.subscription_item_details &&
        data.parent.subscription_item_details.subscription
      ) {
        subscriptionId = data.parent.subscription_item_details
          .subscription as string;
      }

      if (subscriptionId) {
        subscription = await this.client.subscriptions.retrieve(subscriptionId);
      }
    }

    const result: PaymentSession = {
      provider: this.name,

      paymentStatus: PaymentStatus.SUCCESS,
      paymentInfo: {
        transactionId: invoice.id,
        discountCode: '',
        discountAmount:
          invoice.total_discount_amounts &&
          invoice.total_discount_amounts.length > 0
            ? invoice.total_discount_amounts[0].amount
            : 0,
        discountCurrency: invoice.currency || '',
        paymentAmount: invoice.amount_paid,
        paymentCurrency: invoice.currency,
        paymentEmail: invoice.customer_email || '',
        paymentUserName: invoice.customer_name || '',
        paymentUserId: invoice.customer
          ? (invoice.customer as string)
          : undefined,
        paidAt: invoice.created ? new Date(invoice.created * 1000) : undefined,
        invoiceId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url || '',
        subscriptionCycleType:
          invoice.billing_reason === 'subscription_create'
            ? SubscriptionCycleType.CREATE
            : invoice.billing_reason === 'subscription_cycle'
              ? SubscriptionCycleType.RENEWAL
              : undefined,
      },
      paymentResult: invoice,
      metadata: invoice.metadata,
    };

    if (subscription) {
      result.subscriptionId = subscription.id;
      result.subscriptionInfo = await this.buildSubscriptionInfo(subscription);
      result.subscriptionResult = subscription;
    }

    return result;
  }

  // build payment session from invoice
  private async buildPaymentSessionFromSubscription(
    subscription: Stripe.Response<Stripe.Subscription>
  ): Promise<PaymentSession> {
    const result: PaymentSession = {
      provider: this.name,
    };

    if (subscription) {
      result.subscriptionId = subscription.id;
      result.subscriptionInfo = await this.buildSubscriptionInfo(subscription);
      result.subscriptionResult = subscription;
    }

    return result;
  }

  // build subscription info from subscription
  private async buildSubscriptionInfo(
    subscription: Stripe.Response<Stripe.Subscription>
  ): Promise<SubscriptionInfo> {
    // subscription data
    const data = subscription.items.data[0];

    const subscriptionInfo: SubscriptionInfo = {
      subscriptionId: subscription.id,
      productId: data.price.product as string,
      planId: data.price.id,
      description: '',
      amount: data.price.unit_amount || 0,
      currency: data.price.currency,
      currentPeriodStart: new Date(data.current_period_start * 1000),
      currentPeriodEnd: new Date(data.current_period_end * 1000),
      interval: data.plan.interval as PaymentInterval,
      intervalCount: data.plan.interval_count || 1,
      metadata: subscription.metadata,
    };

    if (subscription.status === 'active') {
      if (subscription.cancel_at) {
        subscriptionInfo.status = SubscriptionStatus.PENDING_CANCEL;
        // cancel apply at
        subscriptionInfo.canceledAt = new Date(
          (subscription.canceled_at || 0) * 1000
        );
        // cancel end date
        subscriptionInfo.canceledEndAt = new Date(
          subscription.cancel_at * 1000
        );
        subscriptionInfo.canceledReason =
          subscription.cancellation_details?.comment || '';
        subscriptionInfo.canceledReasonType =
          subscription.cancellation_details?.feedback || '';
      } else {
        subscriptionInfo.status = SubscriptionStatus.ACTIVE;
      }
    } else if (subscription.status === 'canceled') {
      // subscription canceled
      subscriptionInfo.status = SubscriptionStatus.CANCELED;
      subscriptionInfo.canceledAt = new Date(
        (subscription.canceled_at || 0) * 1000
      );
      subscriptionInfo.canceledReason =
        subscription.cancellation_details?.comment || '';
      subscriptionInfo.canceledReasonType =
        subscription.cancellation_details?.feedback || '';
    } else {
      throw new Error(
        `Unknown Stripe subscription status: ${subscription.status}`
      );
    }

    return subscriptionInfo;
  }

  private async ensureCustomer(
    customer?: PaymentOrder['customer']
  ): Promise<string> {
    if (!customer?.email) return '';
    const customers = await this.client.customers.list({
      email: customer.email,
      limit: 1,
    });
    if (customers.data.length > 0) return customers.data[0].id;
    const created = await this.client.customers.create({
      email: customer.email,
      name: customer.name,
      metadata: customer.metadata,
    });
    return created.id;
  }

  /**
   * Create an unconfirmed PaymentIntent for an Apple Pay payment method.
   * Dashboard automatic payment methods are used — payment_method_types is
   * intentionally unset, matching USD Checkout.
   */
  async createApplePayIntent({
    order,
    paymentMethodId,
  }: {
    order: PaymentOrder;
    paymentMethodId: string;
  }): Promise<{ paymentIntentId: string; subscriptionId?: string }> {
    if (!order.price?.amount || order.price.amount <= 0) {
      throw new Error('price is required');
    }
    if (!paymentMethodId.startsWith('pm_')) {
      throw new Error('Invalid payment method');
    }
    const customerId = await this.ensureCustomer(order.customer);
    const metadata = stripeMetadata(order.metadata, {
      order_no: order.orderNo || order.metadata?.order_no || '',
    });
    const currency = order.price.currency.toLowerCase();
    const productName =
      order.productName?.trim() || order.description?.trim() || 'Payment';

    if (order.type === PaymentType.SUBSCRIPTION) {
      if (!order.plan) throw new Error('plan is required');
      if (!customerId) throw new Error('customer email is required');
      const product = await this.client.products.create({
        name: productName,
        metadata,
      });
      const price = await this.client.prices.create({
        currency,
        unit_amount: order.price.amount,
        product: product.id,
        recurring: {
          interval: order.plan
            .interval as Stripe.PriceCreateParams.Recurring.Interval,
          interval_count: order.plan.intervalCount || 1,
        },
      });
      const subscription = await this.client.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        metadata,
        expand: [
          'latest_invoice.payments',
          'latest_invoice.confirmation_secret',
        ],
      });
      const invoice = subscription.latest_invoice;
      if (!invoice || typeof invoice === 'string') {
        throw new Error('Apple Pay invoice is missing a payment');
      }
      const paymentIntentId = paymentIntentIdOf(invoice);
      await this.client.paymentIntents.update(paymentIntentId, {
        metadata: stripeMetadata(metadata, {
          subscription_id: subscription.id,
        }),
      });
      return { paymentIntentId, subscriptionId: subscription.id };
    }

    const intent = await this.client.paymentIntents.create({
      amount: order.price.amount,
      currency,
      customer: customerId || undefined,
      payment_method: paymentMethodId,
      confirm: false,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: productName,
      metadata,
    });
    return { paymentIntentId: intent.id };
  }

  async applePayClientSecret(paymentIntentId: string): Promise<string | null> {
    const intent = await this.client.paymentIntents.retrieve(paymentIntentId);
    return intent.status === 'requires_action' ? intent.client_secret : null;
  }

  async confirmApplePayIntent(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  async cancelApplePayIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.client.paymentIntents.cancel(paymentIntentId);
    } catch {
      // An already finished intent must not block a new Apple Pay attempt.
    }
  }

  private async buildPaymentSessionFromPaymentIntent(
    intent: Stripe.PaymentIntent
  ): Promise<PaymentSession> {
    const subscriptionId = intent.metadata?.subscription_id;
    let subscription: Stripe.Response<Stripe.Subscription> | undefined;
    if (subscriptionId) {
      subscription = await this.client.subscriptions.retrieve(subscriptionId);
    }
    const succeeded = intent.status === 'succeeded';
    const failed =
      intent.status === 'canceled' ||
      intent.status === 'requires_payment_method';
    const result: PaymentSession = {
      provider: this.name,
      paymentStatus: succeeded
        ? PaymentStatus.SUCCESS
        : failed
          ? PaymentStatus.FAILED
          : PaymentStatus.PROCESSING,
      paymentInfo: {
        transactionId: intent.id,
        paymentAmount: intent.amount_received || intent.amount,
        paymentCurrency: intent.currency,
        paymentUserId:
          typeof intent.customer === 'string'
            ? intent.customer
            : intent.customer?.id,
        paidAt: intent.created ? new Date(intent.created * 1000) : undefined,
      },
      paymentResult: {
        id: intent.id,
        object: intent.object,
        status: intent.status,
        amount: intent.amount_received || intent.amount,
        currency: intent.currency,
        metadata: intent.metadata,
      },
      metadata: intent.metadata,
    };
    if (
      subscription &&
      (subscription.status === 'active' || subscription.status === 'canceled')
    ) {
      result.subscriptionId = subscription.id;
      result.subscriptionInfo = await this.buildSubscriptionInfo(subscription);
      result.subscriptionResult = subscription;
    }
    return result;
  }
}

function stripeMetadata(
  metadata: Record<string, unknown> | undefined,
  extra: Record<string, string>
): Stripe.MetadataParam {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value == null || value === '') continue;
    out[key] = String(value).slice(0, 500);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

function paymentIntentIdOf(invoice: Stripe.Invoice): string {
  const payment = invoice.payments?.data.find(
    (item) =>
      item.payment?.type === 'payment_intent' && item.payment.payment_intent
  );
  const ref = payment?.payment.payment_intent;
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'id' in ref) return ref.id;
  const secret = invoice.confirmation_secret?.client_secret;
  const marker = '_secret_';
  const index = secret ? secret.indexOf(marker) : -1;
  if (secret && index > 0) return secret.slice(0, index);
  throw new Error('Apple Pay invoice is missing a payment');
}

/**
 * Create Stripe provider with configs
 */
export function createStripeProvider(configs: StripeConfigs): StripeProvider {
  return new StripeProvider(configs);
}
