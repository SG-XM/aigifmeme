import { useEffect, useRef } from 'react';

import { readCheckoutResume } from '@/lib/checkout-resume';
import { CreditPurchaseDialog } from '@/blocks/credit-purchase-dialog';

/**
 * The credit and plan catalog in a modal, so upgrading never navigates away
 * from a running chat. Checkout returns to the video creation page.
 */
export function UpgradeDialog({
  open,
  onOpenChange,
  redirect = '/create',
}: {
  open: boolean;
  redirect?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    if (readCheckoutResume(window.location.search)?.placement === 'upgrade')
      onOpenChangeRef.current(true);
  }, []);
  return (
    <CreditPurchaseDialog
      open={open}
      onOpenChange={onOpenChange}
      redirect={redirect}
      placement="upgrade"
    />
  );
}
