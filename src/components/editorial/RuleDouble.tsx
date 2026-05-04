interface RuleDoubleProps {
  className?: string;
}

export function RuleDouble({ className = '' }: RuleDoubleProps) {
  return <hr className={`rule-double ${className}`.trim()} />;
}
