import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'className' | 'children'> & {
  className?: string;
  children: ReactNode;
};

export function BtnInkLink({ className = '', children, ...rest }: Props) {
  return (
    <Link {...rest} className={`btn-ink ${className}`.trim()}>
      {children}
    </Link>
  );
}
