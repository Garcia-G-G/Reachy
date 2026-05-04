import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface BtnInkProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function BtnInk({ className = '', children, type = 'button', ...rest }: BtnInkProps) {
  return (
    <button type={type} className={`btn-ink ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
