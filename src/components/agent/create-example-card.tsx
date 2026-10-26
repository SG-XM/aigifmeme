import { ArrowDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ViewportVideo } from '@/components/viewport-video';

export function CreateExampleCard({
  title,
  video,
  useLabel,
  selected,
  onUse,
}: {
  title: string;
  video: string;
  useLabel: string;
  selected: boolean;
  onUse: () => void;
}) {
  return (
    <article
      className={`bg-card overflow-hidden rounded-2xl border transition-colors ${selected ? 'border-primary ring-primary/20 ring-2' : 'border-border'}`}
    >
      <ViewportVideo
        src={video}
        controls
        className="aspect-[3/4] w-full bg-black object-cover"
      />
      <div className="space-y-3 p-3">
        <h2 className="truncate text-sm font-medium">{title}</h2>
        <Button
          type="button"
          variant={selected ? 'default' : 'outline'}
          onClick={onUse}
          className="h-11 w-full gap-2 text-xs"
        >
          <ArrowDown className="size-3.5" />
          {useLabel}
        </Button>
      </div>
    </article>
  );
}
