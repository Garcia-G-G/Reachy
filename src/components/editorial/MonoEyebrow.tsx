import type { ReactNode } from 'react';

interface MonoEyebrowProps {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'div' | 'p';
}

export function MonoEyebrow({ children, className = '', as: Tag = 'span' }: MonoEyebrowProps) {
  return <Tag className={`mono-eyebrow ${className}`.trim()}>{children}</Tag>;
}
