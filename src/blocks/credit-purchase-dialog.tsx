import { Video } from 'lucide-react';

import type { CompactOfferPriority } from '@/lib/credit-paywall';
import { m } from '@/paraglide/messages.js';
import { Pricing } from '@/blocks/pricing';
import { ABTest, useABAssignment } from '@/components/ab-test';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CreditPurchaseDialog({
  open,
  onOpenChange,
  redirect,
  experimentScene,
  placement = 'credit-dialog',
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirect?: string;
  /**
   * When set (insufficient-credit create flow), assign `paywall-sub-first-v1`.
   * A keeps the single pack first. B leads with Basic monthly.
   */
  experimentScene?: string;
  placement?: string;
  context?: { title: string; description: string; image?: string };
}) {
  const { assignment } = useABAssignment(open ? experimentScene : undefined);
  // Variant B is the only arm that should mention monthly plans in the header.
  const showPurchaseDescription = assignment.data?.variant === 'B';
  const pricing = (priority: CompactOfferPriority) => (
    <Pricing
      compact
      redirect={redirect}
      defaultGroup="monthly"
      tone="cinematic"
      compactOfferPriority={priority}
      placement={placement}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="credit-purchase-dialog grid max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-0 bg-[#fff] p-0 text-[#171b27] shadow-[0_16px_60px_rgba(9,15,28,0.38)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-3rem)] sm:max-w-[96vw] 2xl:max-w-[1536px]">
          <DialogHeader className="gap-1.5 border-b border-[#e2e5ea] px-4 pt-4 pr-12 pb-3 sm:px-5 sm:pt-4 sm:pr-14 sm:pb-3">
            <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">
              {m['settings.credits.purchase_title']()}
            </DialogTitle>
            {showPurchaseDescription && (
              <DialogDescription className="text-sm leading-snug font-medium text-[#f05a00] sm:text-base">
                {m['settings.credits.purchase_description']()}
              </DialogDescription>
            )}
            {context && (
              <div className="mt-1.5 flex items-center gap-3 rounded-[18px] bg-[#edf0f4] p-2.5 sm:p-3">
                {context.image ? (
                  <img
                    className="size-14 shrink-0 rounded-xl object-cover"
                    src={context.image}
                    alt=""
                  />
                ) : (
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#171b27]">
                    <Video className="size-5" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{context.title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-[#555d6b] sm:text-base">
                    {context.description}
                  </p>
                </div>
              </div>
            )}
          </DialogHeader>
          <div className="credit-purchase-scroll min-h-0 overflow-y-auto overscroll-contain px-4 pt-5 pb-4 sm:px-5 sm:pt-5 sm:pb-4">
            {experimentScene ? (
              <ABTest
                scene={experimentScene}
                a={pricing('single-first')}
                b={pricing('basic-sub-first')}
                fallback={pricing('single-first')}
              />
            ) : (
              pricing('single-first')
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
