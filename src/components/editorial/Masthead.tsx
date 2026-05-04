import Link from 'next/link';

type NavLink = { href: string; label: string };

interface MastheadProps {
  vol?: string;
  brand?: string;
  links?: NavLink[];
}

const defaultLinks: NavLink[] = [
  { href: '/producto', label: 'Producto' },
  { href: '/precio', label: 'Suscripción' },
  { href: '/login', label: 'Acceder →' },
];

export function Masthead({
  vol = 'Vol. 01 · No. 04 · 2026',
  brand = 'Reachy',
  links = defaultLinks,
}: MastheadProps) {
  return (
    <header className="border-b border-ink">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-3 px-6 py-4 text-center md:grid-cols-[1fr_auto_1fr] md:gap-6 md:px-10 md:text-left">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">{vol}</div>
        <Link
          href="/"
          aria-label={`${brand} — Inicio`}
          className="display text-[28px] font-semibold leading-none tracking-tight"
        >
          {brand}
        </Link>
        <nav
          aria-label="Principal"
          className="flex flex-wrap justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 md:justify-end md:gap-6"
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-accent">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
