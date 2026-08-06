import type { SkeletonProps, SkeletonVariant } from '../../types/ui';

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-xl',
  'table-row': 'h-10 w-full rounded',
  avatar: 'h-10 w-10 rounded-full',
  chart: 'h-48 w-full rounded-xl',
};

export default function Skeleton({ variant = 'text', count = 1, className = '' }: SkeletonProps) {
  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, i) => (
        <div
          key={i}
          className={`relative overflow-hidden bg-surface ${variantClasses[variant]} ${className}`}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-text-muted/10 to-transparent bg-[length:200%_100%] animate-shimmer"
          />
        </div>
      ))}
    </>
  );
}
