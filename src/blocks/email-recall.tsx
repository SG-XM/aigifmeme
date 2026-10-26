import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { apiGet, apiPost } from '@/lib/api-client';
import { settleCheckout, type CheckoutRedirect } from '@/lib/apple-pay';
import type { RecallLanding } from '@/lib/email-recall';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { DeferredApplePay } from '@/components/deferred-apple-pay';
import { PayActionRow } from '@/components/pay-action-row';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function useToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get('token') || ''),
    []
  );
  return token;
}

export function EmailRecallCheckout() {
  const token = useToken();
  const session = useSession();
  const info = useQuery({
    queryKey: ['email-recall-link', token, session.data?.user.id],
    queryFn: () =>
      apiGet<RecallLanding>(
        '/api/email-recall/link?token=' + encodeURIComponent(token || '')
      ),
    enabled: !!token && !session.isPending,
    retry: false,
  });
  const { data: configs } = usePublicConfig();
  const checkout = useMutation({
    mutationFn: async (paymentMethodId?: string) => {
      const data = await apiPost<CheckoutRedirect>('/api/payment/checkout', {
        recall_token: token,
        ...(paymentMethodId
          ? {
              apple_pay_payment_method: paymentMethodId,
              payment_provider: 'stripe',
            }
          : {}),
      });
      await settleCheckout(data, configs?.stripe_publishable_key);
      return data;
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const data = info.data;
  const callback = '/recall?token=' + encodeURIComponent(token || '');
  const interval =
    data?.status === 'ready'
      ? {
          month: m['recall.month'](),
          year: m['recall.year'](),
          week: m['recall.week'](),
          day: m['recall.day'](),
        }[data.interval || ''] || data.interval
      : '';
  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-5">
          <div className="flex items-center gap-3">
            <img
              src={envConfigs.app_logo}
              alt=""
              width={44}
              height={44}
              className="rounded-xl"
            />
            <span className="text-lg font-semibold">{envConfigs.app_name}</span>
          </div>
          <CardTitle className="text-2xl">{m['recall.title']()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {token === null ||
          (token && (session.isPending || info.isLoading)) ? (
            <p>{m['recall.loading']()}</p>
          ) : null}
          {data?.status === 'sign-in' ? (
            <>
              <p>{m['recall.sign_in_description']()}</p>
              <Link
                href={'/sign-in?callbackUrl=' + encodeURIComponent(callback)}
                className={buttonVariants()}
              >
                {m['recall.sign_in']()}
              </Link>
            </>
          ) : null}
          {data?.status === 'ready' ? (
            <>
              <div className="border-border rounded-lg border p-4">
                <p className="font-semibold">{data.productName}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {new Intl.NumberFormat(data.locale, {
                    style: 'currency',
                    currency: data.currency,
                  }).format(data.amount / 100)}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {data.subscription
                    ? m['recall.recurring']({ interval: interval || '' })
                    : m['recall.one_time']()}
                </p>
              </div>
              <PayActionRow>
                <Button
                  className="w-full"
                  disabled={checkout.isPending}
                  onClick={() => checkout.mutate(undefined)}
                >
                  {checkout.isPending
                    ? m['recall.preparing']()
                    : m['recall.continue']()}
                </Button>
                {data.amount > 0 ? (
                  <DeferredApplePay
                    amount={data.amount}
                    currency={data.currency}
                    label={data.productName}
                    buttonType={data.subscription ? 'subscribe' : 'buy'}
                    disabled={checkout.isPending}
                    onPay={(paymentMethodId) =>
                      checkout.mutateAsync(paymentMethodId)
                    }
                  />
                ) : null}
              </PayActionRow>
            </>
          ) : null}
          {data?.status === 'paid' ? (
            <>
              <p>{m['recall.paid']()}</p>
              <Link href="/create" className={buttonVariants()}>
                {m['recall.create']()}
              </Link>
            </>
          ) : null}
          {token === '' ||
          info.isError ||
          (data &&
            ['invalid', 'expired', 'unavailable'].includes(data.status)) ? (
            <p role="status">{m['recall.unavailable']()}</p>
          ) : null}
          {checkout.isError ? (
            <p className="text-destructive" role="alert">
              {checkout.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

export function EmailRecallUnsubscribe() {
  const token = useToken();
  const unsubscribe = useMutation({
    mutationFn: () => apiPost('/api/email-recall/unsubscribe', { token }),
  });
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m['recall.unsubscribe_title']()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {unsubscribe.isSuccess ? (
            <p>{m['recall.unsubscribed']()}</p>
          ) : (
            <>
              <p>{m['recall.unsubscribe_description']()}</p>
              <Button
                disabled={!token || unsubscribe.isPending}
                onClick={() => unsubscribe.mutate()}
              >
                {m['recall.unsubscribe']()}
              </Button>
            </>
          )}
          {unsubscribe.isError ? (
            <p role="alert">{m['recall.unavailable']()}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
