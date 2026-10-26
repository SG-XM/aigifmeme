import { Suspense, useState, useSyncExternalStore } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { authClient, signIn } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { isSafeAuthCallback } from '@/lib/auth-return';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { usePublicConfig } from '@/hooks/use-public-config';

export interface AuthPromptRequest {
  /** Locale-free same-site path, including search and hash. */
  callbackUrl: string;
  /** Selected portraits, shown above the headline when present. */
  previews?: string[];
  /** Persist drafts and the resume intent before a full-page redirect. */
  beforeRedirect?: () => Promise<void> | void;
  /** In-page email sign-in finished; the caller resumes its pending action. */
  onSuccess?: () => void;
}

type StoredRequest = AuthPromptRequest & { id: number };

let current: StoredRequest | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function openAuthPrompt(request: AuthPromptRequest) {
  current = { ...request, id: ++nextId };
  emit();
}

export function closeAuthPrompt() {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return current;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function safeReturnPath(callbackUrl: string) {
  return isSafeAuthCallback(callbackUrl) ? callbackUrl : '/#create';
}

function localizedReturn(callbackUrl: string) {
  const safe = safeReturnPath(callbackUrl);
  const hashAt = safe.indexOf('#');
  const before = hashAt === -1 ? safe : safe.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : safe.slice(hashAt);
  return `${localizeHref(before)}${hash}`;
}

export function AuthPrompt() {
  const request = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <AuthPromptDialog key={request.id} request={request} />
    </Suspense>
  );
}

function AuthPromptDialog({ request }: { request: StoredRequest }) {
  const router = useRouter();
  const configQuery = usePublicConfig();
  const configs = configQuery.data ?? {};
  const ready = configQuery.isSuccess || configQuery.isError;
  const emailEnabled = configs.email_auth_enabled !== 'false';
  const googleEnabled = configs.google_auth_enabled === 'true';
  const githubEnabled = configs.github_auth_enabled === 'true';
  const passwordResetEnabled = configs.password_reset_enabled === 'true';
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const previews = (request.previews ?? []).filter(Boolean).slice(0, 2);
  const afterLogin = safeReturnPath(request.callbackUrl);
  const localizedAfterLogin = localizedReturn(request.callbackUrl);
  const signUpHref = `/sign-up?callbackUrl=${encodeURIComponent(afterLogin)}`;
  const emailOnly = ready && emailEnabled && !googleEnabled && !githubEnabled;

  async function leaveFor(path: string) {
    await request.beforeRedirect?.();
    router.push(path);
  }

  async function continueWith(provider: 'google' | 'github') {
    setError('');
    setPending(true);
    try {
      await request.beforeRedirect?.();
      const callbackURL = new URL(
        localizedAfterLogin,
        window.location.origin
      ).toString();
      const result = await signIn.social({ provider, callbackURL });
      if (result?.error) {
        setError(result.error.message || m['common.sign.sign_in_title']());
        setPending(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : m['common.sign.sign_in_title']()
      );
      setPending(false);
    }
  }

  async function submitEmail() {
    setError('');
    setPending(true);
    try {
      const result = await signIn.email({ email, password });
      if (result?.error) {
        const status = result.error.status;
        const code = result.error.code;
        const message = result.error.message || '';
        if (
          code === 'EMAIL_NOT_VERIFIED' ||
          (status === 403 && /not verified/i.test(message))
        ) {
          const verifyPath = `/verify-email?sent=1&email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(afterLogin)}`;
          void authClient.sendVerificationEmail({
            email,
            callbackURL: localizedAfterLogin,
          });
          await leaveFor(verifyPath);
          return;
        }
        setError(message || m['common.sign.sign_in_title']());
        setPending(false);
        return;
      }
      await authClient.getSession();
      const resume = request.onSuccess;
      closeAuthPrompt();
      resume?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : m['common.sign.sign_in_title']()
      );
      setPending(false);
    }
  }

  const showEmailForm = emailEnabled && (emailOpen || emailOnly);

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) closeAuthPrompt();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-[80] bg-black/70" />
        <DialogPrimitive.Popup
          className="data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-[80] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl outline-none sm:max-w-sm"
          aria-describedby="auth-prompt-description"
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>

          {previews.length > 0 && (
            <div className="mb-4 flex justify-center" aria-hidden="true">
              <div className="relative h-24 w-40">
                {previews.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className={`absolute h-24 w-20 rounded-2xl border-4 border-white object-cover shadow-md ${
                      index === 0
                        ? 'left-3 -rotate-6'
                        : 'right-3 z-[1] rotate-6'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <DialogPrimitive.Title
            id="auth-prompt-title"
            className="text-center text-xl font-semibold tracking-tight text-zinc-950"
          >
            {m['common.sign.sign_in_title']()}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            id="auth-prompt-description"
            className="mt-2 text-center text-sm text-zinc-500"
          >
            {m['common.sign.sign_in_description']()}
          </DialogPrimitive.Description>

          <div className="mt-5 space-y-3">
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {!ready ? (
              <div className="text-center text-sm text-zinc-500">…</div>
            ) : (
              <>
                {googleEnabled && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void continueWith('google')}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f45b00] text-base font-semibold text-white transition-colors hover:bg-[#ff6a12] disabled:opacity-60"
                  >
                    <GoogleMark />
                    {m['common.sign.google_sign_in']()}
                  </button>
                )}
                {!googleEnabled && githubEnabled && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void continueWith('github')}
                    className="flex h-12 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-medium"
                  >
                    {m['common.sign.github_sign_in']()}
                  </button>
                )}
                {emailEnabled &&
                  (googleEnabled || githubEnabled) &&
                  !showEmailForm && (
                    <button
                      type="button"
                      className="block w-full py-1 text-center text-sm text-zinc-700 underline underline-offset-4"
                      onClick={() => setEmailOpen(true)}
                    >
                      {m['common.sign.use_email']()}
                    </button>
                  )}
                {showEmailForm && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitEmail();
                    }}
                  >
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-zinc-800">
                        {m['common.sign.email_title']()}
                      </span>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={m['common.sign.email_placeholder']()}
                        className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#f45b00]"
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span className="flex items-center justify-between font-medium text-zinc-800">
                        {m['common.sign.password_title']()}
                        {passwordResetEnabled && (
                          <button
                            type="button"
                            className="text-xs font-normal text-zinc-500 underline underline-offset-4"
                            onClick={() => void leaveFor('/forgot-password')}
                          >
                            {m['common.sign.forgot_password']()}
                          </button>
                        )}
                      </span>
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={m['common.sign.password_placeholder']()}
                        className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#f45b00]"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={pending}
                      className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {pending ? '…' : m['common.sign.sign_in_title']()}
                    </button>
                    <p className="text-center text-sm text-zinc-500">
                      {m['common.sign.no_account']()}{' '}
                      <button
                        type="button"
                        className="text-zinc-800 underline underline-offset-4"
                        onClick={() => void leaveFor(signUpHref)}
                      >
                        {m['common.sign.sign_up_title']()}
                      </button>
                    </p>
                    {(googleEnabled || githubEnabled) && (
                      <button
                        type="button"
                        className="block w-full text-center text-sm text-zinc-500 underline underline-offset-4"
                        onClick={() => setEmailOpen(false)}
                      >
                        {m['common.sign.back_to_sign_in']()}
                      </button>
                    )}
                  </form>
                )}
                {googleEnabled && githubEnabled && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void continueWith('github')}
                    className="block w-full text-center text-sm text-zinc-500 underline underline-offset-4"
                  >
                    {m['common.sign.github_sign_in']()}
                  </button>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
