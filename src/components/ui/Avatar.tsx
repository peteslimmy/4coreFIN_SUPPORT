import { motion } from 'framer-motion';
import type { AvatarProps } from '../../types/ui';
import { useMemo } from 'react';

// White initials need ≥4.5:1 against the chip color (WCAG AA at these font
// sizes), so every entry here is a verified-dark shade of its hue — the 600
// variants of amber/emerald/cyan/accent measured below 4.5:1 with white text.
const bgColors = [
  'bg-info', 'bg-success-dark', 'bg-primary', 'bg-info-dark',
  'bg-error', 'bg-text-secondary', 'bg-warning-dark',
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
      className={`relative inline-flex items-center justify-center rounded-full font-medium text-[#fff] ${bgColor} ${sizeMap[size]} ${className}`}
      title={name}
      aria-label={name}
      whileHover={{ scale: 1.1 }}
      transition={{ duration: 0.2 }}
    >
      {initials}
    </motion.span>
  );
}
