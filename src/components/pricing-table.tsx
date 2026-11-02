import {
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PayActionRow } from '@/components/pay-action-row';
import { Button } from '@/components/ui/button';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type PricingFeature =
  | string
  | { icon?: IconComponent; label: string; tooltip?: string };

export interface PricingPlan {
  id: string;
  name: string;
  description?: string;
  price: string;
  originalPrice?: string;
  /** Small line under the price, e.g. what actually gets charged. */
  priceNote?: string;
  currency?: string;
  interval?: string;
  featured?: boolean;
  badge?: string;
  features: PricingFeature[];
  buttonText?: string;
  productId?: string;
  productName?: string;
  paymentProvider?: string;
  priceInCents?: number;
  credits?: number;
  creditsValidDays?: number;
  plan?: {
    name: string;
    interval: string;
    intervalCount: number;
  };
}

export interface PricingGroup {
  key: string;
  label: string;
  /** Small pill next to the label, e.g. the yearly discount. */
  badge?: string;
  plans: PricingPlan[];
}

export function PricingTable({
  groups,
  defaultGroup,
  currentProductId,
  onCheckout,
  walletAction,
  busyProductId,
  labels,
  tone = 'default',
  compact = false,
  showFeatures = true,
}: {
  groups: PricingGroup[];
  /** Which tab opens first; defaults to the leftmost. */
  defaultGroup?: string;
  /** The plan the viewer already pays for — marked, and not sellable again. */
  currentProductId?: string | null;
  onCheckout: (plan: PricingPlan) => void;
  /** Wallet button rendered beside the hosted-checkout action once it mounts. */
  walletAction?: (plan: PricingPlan) => ReactNode;
  busyProductId?: string | null;
  labels: {
    currentPlan: string;
    processing: string;
    getStarted: string;
    recommended?: string;
  };
  tone?: 'default' | 'cinematic';
  /** Tighter, single-column cards used by the credit purchase dialog. */
  compact?: boolean;
  showFeatures?: boolean;
}) {
  const [activeGroup, setActiveGroup] = useState(
    defaultGroup || groups[0]?.key || ''
  );

  const currentGroup = groups.find((g) => g.key === activeGroup) || groups[0];
  // Marketing cards (home + /pricing) share the scene-card chrome. The
  // credit dialog stays on the compact light treatment.
  const sceneCard = tone === 'cinematic' && !compact;

  // Matched on the exact product, so a monthly subscriber viewing the yearly
  // tab still sees a real offer — switching interval is a genuine change.
  const isCurrent = (plan: PricingPlan) =>
    Boolean(currentProductId && plan.productId === currentProductId);

  return (
    <div
      className={cn(
        compact ? 'space-y-3' : 'space-y-10',
        tone === 'cinematic' && 'pricing-table-cinematic'
      )}
    >
      {/* Group tabs — pill toggle */}
      {groups.length > 1 && (
        <div
          className={cn(
            'flex justify-center',
            // Offset shadow paints outside the pill. Keep it inside the section.
            sceneCard && 'overflow-visible px-1.5 pb-1.5'
          )}
        >
          <div
            className={cn(
              'inline-flex items-center rounded-full p-1',
              sceneCard
                ? 'pricing-interval-toggle'
                : 'border-border bg-muted/40 border',
              !sceneCard &&
                tone === 'cinematic' &&
                'pricing-table-cinematic-toggle'
            )}
          >
            {groups.map((group) => (
              <button
                key={group.key}
                onClick={() => setActiveGroup(group.key)}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors sm:px-5',
                  sceneCard
                    ? 'data-[active=true]:bg-primary data-[active=true]:hover:bg-primary/90 cursor-pointer text-[var(--trend-scene-muted)] hover:bg-white/10 hover:text-[var(--trend-scene-paper)] data-[active=true]:text-[var(--trend-price-dark)] data-[active=true]:hover:text-[var(--trend-price-dark)]'
                    : tone === 'cinematic'
                      ? 'cursor-pointer text-[var(--trend-price-muted)] data-[active=true]:text-[var(--trend-price-ink)]'
                      : null,
                  !sceneCard &&
                    (activeGroup === group.key
                      ? tone === 'cinematic'
                        ? 'bg-card text-[var(--trend-price-ink)] shadow-sm'
                        : 'bg-background text-foreground shadow-sm'
                      : tone === 'cinematic'
                        ? 'hover:bg-accent hover:text-[var(--trend-price-ink)]'
                        : 'text-muted-foreground hover:text-foreground')
                )}
                data-active={activeGroup === group.key}
              >
                {group.label}
                {group.badge && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs',
                      tone === 'cinematic'
                        ? 'bg-[var(--trend-orange)] font-semibold text-[var(--trend-price-dark)]'
                        : 'bg-primary/10 text-primary font-medium'
                    )}
                  >
                    {group.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div
        className={cn(
          cn(
            'mx-auto grid',
            compact ? 'gap-4' : 'gap-6',
            // The Save sticker sits above the card. Keep it, and its hard
            // shadow, inside this grid so a scrolling parent cannot clip it.
            compact && tone === 'cinematic' && 'overflow-visible pe-3 pt-10',
            sceneCard && 'overflow-visible pt-1 pr-4 pb-4'
          ),
          compact
            ? currentGroup?.plans.length === 2
              ? 'max-w-3xl sm:grid-cols-2'
              : currentGroup?.plans.length === 3
                ? 'max-w-none sm:grid-cols-2 lg:grid-cols-3'
                : currentGroup?.plans.length >= 4
                  ? 'max-w-none sm:grid-cols-2 lg:grid-cols-5'
                  : 'max-w-none grid-cols-1'
            : currentGroup?.plans.length === 2
              ? 'max-w-3xl sm:grid-cols-2'
              : currentGroup?.plans.length === 3
                ? 'max-w-5xl sm:grid-cols-2 lg:grid-cols-3'
                : currentGroup?.plans.length === 5
                  ? 'max-w-7xl sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
                  : 'max-w-6xl sm:grid-cols-2 lg:grid-cols-4'
        )}
      >
        {currentGroup?.plans.map((plan) => {
          const recommended =
            tone === 'cinematic' &&
            plan.plan?.interval === 'year' &&
            plan.name.toLowerCase() === 'studio';
          const featured = plan.featured || recommended;
          const badge = isCurrent(plan)
            ? labels.currentPlan
            : recommended
              ? `${labels.recommended ?? ''}${plan.badge ? ` · ${plan.badge}` : ''}`
              : plan.badge;
          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col overflow-visible',
                sceneCard
                  ? cn(
                      'trend-offset-card p-6',
                      featured && 'trend-offset-card-featured',
                      isCurrent(plan) && 'trend-offset-card-current'
                    )
                  : cn(
                      'border-border rounded-lg border p-4 transition-all sm:p-8',
                      tone === 'cinematic' &&
                        cn(
                          'rounded-[22px] border-2 border-[var(--trend-price-line)] bg-[var(--trend-price-panel)] text-[var(--trend-price-ink)] shadow-[5px_5px_0_var(--trend-price-shadow)]',
                          compact ? 'p-3 sm:p-3' : 'p-6'
                        ),
                      featured
                        ? tone === 'cinematic'
                          ? 'border-[var(--trend-price-line)] bg-[var(--trend-price-panel)] shadow-[8px_8px_0_var(--trend-price-ink)] lg:-translate-y-1.5'
                          : 'bg-card border-primary ring-primary/20 shadow-md ring-1'
                        : tone === 'cinematic'
                          ? 'hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_var(--trend-price-shadow)]'
                          : 'bg-background hover:border-foreground/30',
                      isCurrent(plan) &&
                        'bg-card border-primary ring-primary/20 ring-1'
                    )
              )}
            >
              {/* Badge — the viewer's own plan outranks "popular"/savings */}
              {(isCurrent(plan) || plan.badge || recommended) && (
                <span
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-semibold',
                    sceneCard
                      ? 'mb-5 w-fit border-2 border-[var(--trend-stroke)] bg-[var(--trend-orange)] text-[var(--trend-price-dark)]'
                      : tone === 'cinematic'
                        ? compact
                          ? // Opaque orange fill. A transparent pill let the card stroke cut the label.
                            'absolute top-0 right-3 z-20 -translate-y-[calc(100%-8px)] rotate-[-2deg] rounded-full border-2 border-[var(--trend-price-line)] bg-[var(--trend-orange)] px-4 py-1 text-sm text-[var(--trend-price-dark)] shadow-[4px_4px_0_var(--trend-price-ink)]'
                          : 'mb-5 w-fit bg-[var(--trend-orange)] text-[var(--trend-price-dark)]'
                        : 'bg-primary/10 text-primary absolute top-4 right-4'
                  )}
                >
                  {badge}
                </span>
              )}
              {tone === 'cinematic' &&
                !compact &&
                !isCurrent(plan) &&
                !plan.badge &&
                !recommended && <div aria-hidden="true" className="mb-5 h-6" />}

              {/* Plan name */}
              {plan.name && (
                <p
                  className={cn(
                    sceneCard
                      ? 'mb-2 font-sans text-lg font-semibold tracking-tight'
                      : cn(
                          'mb-2 text-sm font-medium',
                          compact && 'mb-1 text-[15px]',
                          tone === 'cinematic'
                            ? compact
                              ? 'text-[15px] text-[var(--trend-price-ink)]'
                              : 'text-[17px] text-[var(--trend-price-ink)]'
                            : 'text-foreground'
                        )
                  )}
                >
                  {plan.name}
                </p>
              )}

              {/* Price */}
              <div
                className={cn(
                  'mb-2 flex items-baseline gap-1',
                  compact && 'mb-1'
                )}
              >
                <span
                  className={cn(
                    tone === 'cinematic'
                      ? cn(
                          'font-sans font-semibold tracking-tight tabular-nums',
                          compact ? 'text-3xl' : 'text-4xl'
                        )
                      : 'font-serif text-5xl tracking-tight',
                    tone === 'cinematic' &&
                      !sceneCard &&
                      'text-[var(--trend-price-ink)]'
                  )}
                >
                  {plan.price}
                </span>
                {plan.interval && (
                  <span
                    className={cn(
                      compact ? 'text-xs' : 'text-sm',
                      sceneCard
                        ? 'trend-offset-muted'
                        : tone === 'cinematic'
                          ? 'text-[var(--trend-price-muted)]'
                          : 'text-muted-foreground'
                    )}
                  >
                    /{plan.interval}
                  </span>
                )}
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                {plan.originalPrice && (
                  <span
                    className={cn(
                      'text-sm line-through',
                      sceneCard
                        ? 'trend-offset-muted'
                        : tone === 'cinematic'
                          ? 'text-[var(--trend-price-muted)]'
                          : 'text-muted-foreground'
                    )}
                  >
                    {plan.originalPrice}
                  </span>
                )}
                {plan.priceNote && (
                  <span
                    className={cn(
                      compact ? 'text-xs' : 'text-sm',
                      sceneCard
                        ? 'trend-offset-muted'
                        : tone === 'cinematic'
                          ? 'text-[var(--trend-price-muted)]'
                          : 'text-muted-foreground'
                    )}
                  >
                    {plan.priceNote}
                  </span>
                )}
              </div>

              {/* Description */}
              {plan.description && (
                <p
                  className={cn(
                    compact ? 'mb-4 text-xs leading-snug' : 'mb-8 text-sm',
                    sceneCard
                      ? 'trend-offset-muted sm:min-h-[2.85em]'
                      : tone === 'cinematic'
                        ? compact
                          ? 'min-h-[2.5em] text-[var(--trend-price-muted)]'
                          : 'text-[var(--trend-price-muted)] sm:min-h-[2.85em]'
                        : 'text-muted-foreground'
                  )}
                >
                  {plan.description}
                </p>
              )}

              {/* CTA — hosted checkout, Apple Pay to its right once that button mounts */}
              <PayActionRow>
                <Button
                  variant={
                    sceneCard
                      ? 'outline'
                      : featured && !isCurrent(plan)
                        ? 'default'
                        : 'outline'
                  }
                  data-featured={
                    sceneCard && featured && !isCurrent(plan)
                      ? 'true'
                      : undefined
                  }
                  className={cn(
                    'h-11 w-full cursor-pointer text-sm font-semibold',
                    sceneCard
                      ? cn(
                          'disabled:bg-muted disabled:text-muted-foreground rounded-full border-2 border-[var(--trend-stroke)] bg-transparent font-sans text-[var(--trend-paper)] hover:bg-[var(--trend-panel-raised)] disabled:opacity-100 dark:border-[var(--trend-stroke)] dark:bg-transparent dark:text-[var(--trend-paper)] dark:hover:bg-[var(--trend-panel-raised)]',
                          featured &&
                            !isCurrent(plan) &&
                            'border-[var(--trend-orange)] bg-[var(--trend-orange)] text-[var(--trend-price-dark)] hover:bg-[var(--trend-orange-hover)] dark:border-[var(--trend-orange)] dark:bg-[var(--trend-orange)] dark:text-[var(--trend-price-dark)] dark:hover:bg-[var(--trend-orange-hover)]'
                        )
                      : cn(
                          tone === 'cinematic' && compact
                            ? 'h-11 rounded-xl text-sm'
                            : 'rounded-full',
                          tone === 'cinematic' &&
                            'disabled:bg-muted disabled:text-muted-foreground border-2 border-[var(--trend-price-line)] bg-[var(--trend-price-panel)] text-[var(--trend-price-ink)] hover:bg-[var(--trend-price-hover)] disabled:opacity-100 dark:border-[var(--trend-price-line)] dark:bg-[var(--trend-price-panel)] dark:hover:bg-[var(--trend-price-hover)]',
                          tone === 'cinematic' &&
                            featured &&
                            !isCurrent(plan) &&
                            'border-[var(--trend-orange)] bg-[var(--trend-orange)] text-[var(--trend-price-dark)] hover:bg-[var(--trend-orange-hover)] dark:border-[var(--trend-orange)] dark:bg-[var(--trend-orange)] dark:hover:bg-[var(--trend-orange-hover)]',
                          tone === 'cinematic' &&
                            compact &&
                            featured &&
                            !isCurrent(plan) &&
                            'hover:bg-primary/90 dark:hover:bg-primary/90 shadow-sm hover:-translate-y-0.5 hover:text-[var(--trend-price-dark)] hover:shadow-md active:translate-y-px active:shadow-sm active:hover:translate-y-px'
                        )
                  )}
                  onClick={() => onCheckout(plan)}
                  disabled={Boolean(busyProductId) || isCurrent(plan)}
                >
                  {isCurrent(plan)
                    ? labels.currentPlan
                    : busyProductId === plan.productId
                      ? labels.processing
                      : plan.buttonText || labels.getStarted}
                </Button>
                {!isCurrent(plan) && walletAction?.(plan)}
              </PayActionRow>

              {/* Features */}
              {showFeatures && (
                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature, i) => {
                    const isObj = typeof feature !== 'string';
                    const Icon: IconComponent =
                      (isObj && feature.icon) || Check;
                    const label = isObj ? feature.label : feature;
                    return (
                      <li
                        key={i}
                        className={cn(
                          'flex items-center gap-2.5 text-sm',
                          tone === 'cinematic' &&
                            !sceneCard &&
                            'text-[var(--trend-price-ink)]'
                        )}
                      >
                        <Icon
                          className={cn(
                            'size-4 shrink-0',
                            tone === 'cinematic'
                              ? 'text-[var(--trend-orange)]'
                              : 'text-muted-foreground'
                          )}
                        />
                        <span
                          className={
                            sceneCard
                              ? undefined
                              : tone === 'cinematic'
                                ? 'text-[var(--trend-price-ink)]'
                                : 'text-foreground/90'
                          }
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
