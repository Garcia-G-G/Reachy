import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface BtnGhostProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function BtnGhost({ className = '', children, type = 'button', ...rest }: BtnGhostProps) {
  return (
    <button type={type} className={`btn-ghost ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
