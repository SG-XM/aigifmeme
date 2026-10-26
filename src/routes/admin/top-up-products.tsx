import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import {
  isRetentionNamePriceProduct,
  VIDEO_RETENTION_PRODUCT_ID,
} from '@/lib/video-retention-offer';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface TopUpProduct {
  productId: string;
  name: string;
  description: string;
  nameEs: string;
  descriptionEs: string;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays: number;
  enabled: boolean;
  sort: number;
}

type ProductDraft = Omit<
  TopUpProduct,
  'priceInCents' | 'credits' | 'creditsValidDays' | 'sort'
> & {
  priceDollars: string;
  credits: string;
  creditsValidDays: string;
  sort: string;
};

function toDraft(product?: TopUpProduct): ProductDraft {
  return {
    productId: product?.productId ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    nameEs: product?.nameEs ?? '',
    descriptionEs: product?.descriptionEs ?? '',
    priceDollars: ((product?.priceInCents ?? 999) / 100).toFixed(2),
    currency: 'usd',
    credits: String(product?.credits ?? 10),
    creditsValidDays: String(product?.creditsValidDays ?? 0),
    enabled: product?.enabled ?? true,
    sort: String(product?.sort ?? 0),
  };
}

function toPayload(draft: ProductDraft) {
  return {
    ...draft,
    productId: draft.productId.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    nameEs: draft.nameEs.trim(),
    descriptionEs: draft.descriptionEs.trim(),
    priceInCents: Math.round(Number(draft.priceDollars) * 100),
    credits: Number(draft.credits),
    creditsValidDays: Number(draft.creditsValidDays),
    sort: Number(draft.sort),
  };
}

function ProductFields({
  draft,
  setDraft,
  isNew,
}: {
  draft: ProductDraft;
  setDraft: Dispatch<SetStateAction<ProductDraft>>;
  isNew?: boolean;
}) {
  const textField = (
    key:
      | 'productId'
      | 'name'
      | 'description'
      | 'nameEs'
      | 'descriptionEs'
      | 'priceDollars'
      | 'credits'
      | 'creditsValidDays'
      | 'sort',
    label: string,
    type: 'text' | 'number' = 'text'
  ) => (
    <label className="space-y-1 text-sm" key={key}>
      <span className="text-muted-foreground">{label}</span>
      <Input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={
          key === 'priceDollars' ? '0.01' : type === 'number' ? '1' : undefined
        }
        value={draft[key]}
        disabled={key === 'productId' && !isNew}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    </label>
  );

  const toggleField = (key: 'enabled', label: string) => (
    <label className="flex items-center gap-2 text-sm" key={key}>
      <input
        type="checkbox"
        checked={draft[key]}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.checked }))
        }
      />
      <span>{label}</span>
    </label>
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {textField('productId', m['admin.topups.product_id']())}
        {textField('name', m['admin.topups.name']())}
        {textField('description', m['admin.topups.description']())}
        {textField('nameEs', m['admin.topups.name_es']())}
        {textField('descriptionEs', m['admin.topups.description_es']())}
        {textField('priceDollars', m['admin.topups.price_usd'](), 'number')}
        {textField('credits', m['admin.topups.credits'](), 'number')}
        {textField(
          'creditsValidDays',
          m['admin.topups.valid_days'](),
          'number'
        )}
        {textField('sort', m['admin.topups.sort'](), 'number')}
      </div>
      <div className="flex flex-wrap gap-5">
        {toggleField('enabled', m['admin.topups.enabled']())}
      </div>
    </>
  );
}

function ProductEditor({
  product,
  onSave,
  saving,
}: {
  product: TopUpProduct;
  onSave: (payload: ReturnType<typeof toPayload>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(() => toDraft(product));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {product.productId === VIDEO_RETENTION_PRODUCT_ID && (
          <p className="bg-muted rounded-lg p-3 text-sm">
            {m['admin.topups.retention_note']()}
          </p>
        )}
        {isRetentionNamePriceProduct(product.productId) && (
          <p className="bg-muted rounded-lg p-3 text-sm">
            {m['admin.topups.retention_name_price_note']()}
          </p>
        )}
        <ProductFields draft={draft} setDraft={setDraft} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">USD</span>
          <Button disabled={saving} onClick={() => onSave(toPayload(draft))}>
            {m['admin.topups.save']()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TopUpProductsPage() {
  const queryClient = useQueryClient();
  const [createDraft, setCreateDraft] = useState(() => toDraft());
  const query = useQuery({
    queryKey: ['admin-top-up-products'],
    queryFn: () => apiGet<TopUpProduct[]>('/api/admin/top-up-products'),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      apiPatch('/api/admin/top-up-products', payload),
    onSuccess: () => {
      toast.success(m['admin.topups.saved']());
      queryClient.invalidateQueries({ queryKey: ['admin-top-up-products'] });
      queryClient.invalidateQueries({ queryKey: ['credit-top-up-products'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      apiPost('/api/admin/top-up-products', payload),
    onSuccess: () => {
      toast.success(m['admin.topups.created']());
      setCreateDraft(toDraft());
      queryClient.invalidateQueries({ queryKey: ['admin-top-up-products'] });
      queryClient.invalidateQueries({ queryKey: ['credit-top-up-products'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.topups.title']()}</h1>
        <p className="text-muted-foreground">
          {m['admin.topups.description_page']()}
        </p>
      </div>

      <p className="bg-muted rounded-lg p-4 text-sm">
        {m['admin.topups.credit_policy']()}
      </p>
      {query.isError && (
        <p role="alert" className="text-destructive">
          {m['admin.pricing.load_error']()}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{m['admin.topups.add']()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProductFields draft={createDraft} setDraft={setCreateDraft} isNew />
          <div className="flex justify-end">
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate(toPayload(createDraft))}
            >
              {m['admin.topups.create']()}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {(query.data ?? []).map((product) => (
          <ProductEditor
            key={`${product.productId}:${JSON.stringify(product)}`}
            product={product}
            onSave={(payload) => saveMutation.mutate(payload)}
            saving={saveMutation.isPending}
          />
        ))}
        {!query.isPending && !query.data?.length && (
          <p className="text-muted-foreground text-sm">
            {m['admin.topups.empty']()}
          </p>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/admin/top-up-products')({
  component: TopUpProductsPage,
});
