interface RuleProps {
  className?: string;
}

export function Rule({ className = '' }: RuleProps) {
  return <hr className={`rule-thin ${className}`.trim()} />;
}
