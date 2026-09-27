import { MessageCircleMore } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-[14px]', inverse ? 'bg-white/10 text-white' : 'bg-primary text-primary-foreground')}>
        <MessageCircleMore className="size-5" strokeWidth={2.4} />
      </span>
      {!compact ? <span className={cn('text-lg font-bold tracking-tight', inverse ? 'text-white' : 'text-foreground')}>atende<span className="text-primary">.</span></span> : null}
    </div>
  );
}
