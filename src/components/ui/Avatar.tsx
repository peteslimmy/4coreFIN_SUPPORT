import { motion } from 'framer-motion';
import type { AvatarProps } from '../../types/ui';
import { useMemo } from 'react';

const bgColors = [
  'bg-accent', 'bg-emerald-600', 'bg-blue-600', 'bg-amber-600',
  'bg-purple-600', 'bg-rose-600', 'bg-cyan-600', 'bg-slate-600',
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bgColors[Math.abs(hash) % bgColors.length];
}

const sizeMap = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };

export default function Avatar({ name, size = 'md', src, className = '' }: AvatarProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const bgColor = useMemo(() => getColor(name), [name]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ${sizeMap[size]} ${className}`}
      />
    );
  }

  return (
    <motion.span
      className={`relative inline-flex items-center justify-center rounded-full font-medium text-white ${bgColor} ${sizeMap[size]} ${className}`}
      title={name}
      aria-label={name}
      whileHover={{ scale: 1.1 }}
      transition={{ duration: 0.2 }}
    >
      {initials}
    </motion.span>
  );
}
