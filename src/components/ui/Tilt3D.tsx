import { useRef, type MouseEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface Tilt3DProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  scale?: number;
  onClick?: () => void;
  disabled?: boolean;
}

export default function Tilt3D({ children, className = '', maxTilt = 8, scale = 1.02, onClick, disabled = false }: Tilt3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 });
  const scaleV = useSpring(useMotionValue(1), { stiffness: 260, damping: 22 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || disabled) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-py * maxTilt);
    rotateY.set(px * maxTilt);
    scaleV.set(scale);
  };

  const handleLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    scaleV.set(1);
  };

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{ rotateX, rotateY, scale: scaleV, transformStyle: 'preserve-3d', transformPerspective: 700 }}
      className={`relative ${className}`}
    >
      {children}
    </motion.div>
  );
}
