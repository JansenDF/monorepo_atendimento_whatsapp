import { cn, initials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function Avatar({ name, imageUrl, className, fallbackClassName }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex size-10 shrink-0 overflow-hidden rounded-full bg-primary/10 text-primary', className)}>
      {imageUrl ? <img alt="" className="size-full object-cover" src={imageUrl} /> : null}
      {!imageUrl ? (
        <span className={cn('flex size-full items-center justify-center text-xs font-semibold', fallbackClassName)}>
          {initials(name) || '?'}
        </span>
      ) : null}
    </span>
  );
}
