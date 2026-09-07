import type { ReactNode } from 'react';

type ContainerWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

const widthMap: Record<ContainerWidth, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: '',
};

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: ContainerWidth;
}

export default function PageContainer({ children, className = '', maxWidth = 'full' }: PageContainerProps) {
  return (
    <div className={`flex-1 p-3 sm:p-4 lg:p-5 ${widthMap[maxWidth]} mx-auto ${className}`}>
      {children}
    </div>
  );
}
