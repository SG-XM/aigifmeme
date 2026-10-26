import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { Link, useRouter } from '@/core/i18n/navigation';
import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type RedemptionResult =
  | { status: 'redeemed'; credits: number }
  | { status: 'account-not-found' }
  | { status: 'invalid' | 'invalidated' | 'used' | 'expired' };

function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [needsSignup, setNeedsSignup] = useState(false);
  const [message, setMessage] = useState('');
  const autoSubmitted = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get('code') || '');
    setEmail((params.get('email') || '').trim().toLowerCase());
    setInitialized(true);
  }, []);

  const redeemMutation = useMutation({
    mutationFn: () =>
      apiPost<RedemptionResult>('/api/credit-redeem-codes/redeem', {
        code,
        email,
      }),
    onSuccess: (result) => {
      if (result.status === 'account-not-found') {
        setNeedsSignup(true);
        setMessage(m['redeem.account_missing']());
        return;
      }
      if (result.status === 'redeemed') {
        setNeedsSignup(false);
        setMessage(m['redeem.success']({ credits: result.credits }));
        router.push('/#create');
        return;
      }
      const messageKey = {
        invalid: 'redeem.invalid',
        invalidated: 'redeem.invalidated',
        used: 'redeem.used',
        expired: 'redeem.expired',
      } as const;
      setNeedsSignup(false);
      setMessage(m[messageKey[result.status]]());
    },
    onError: (error: Error) => {
      setNeedsSignup(false);
      setMessage(error.message);
    },
  });

  useEffect(() => {
    if (!initialized || autoSubmitted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoclaim') !== '1' || !code || !email) return;
    autoSubmitted.current = true;
    redeemMutation.mutate();
  }, [initialized, code, email]);

  const signUpHref = (() => {
    const callback = new URLSearchParams({ code, email, autoclaim: '1' });
    const params = new URLSearchParams({
      email,
      callbackUrl: `/redeem?${callback.toString()}`,
    });
    return `/sign-up?${params.toString()}`;
  })();

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m['redeem.title']()}</CardTitle>
          <CardDescription>{m['redeem.description']()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="redeem-code">{m['redeem.code_label']()}</Label>
            <Input
              id="redeem-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redeem-email">{m['redeem.email_label']()}</Label>
            <Input
              id="redeem-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setNeedsSignup(false);
              }}
              autoComplete="email"
            />
          </div>
          {message && (
            <p className="text-muted-foreground text-sm">{message}</p>
          )}
          {needsSignup ? (
            <Link
              href={signUpHref}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium"
            >
              {m['redeem.create_account']()}
            </Link>
          ) : (
            <Button
              className="w-full"
              onClick={() => {
                setMessage('');
                redeemMutation.mutate();
              }}
              disabled={
                redeemMutation.isPending ||
                !initialized ||
                !code.trim() ||
                !email.trim()
              }
            >
              {redeemMutation.isPending
                ? m['redeem.submitting']()
                : m['redeem.submit']()}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute('/redeem')({ component: RedeemPage });
