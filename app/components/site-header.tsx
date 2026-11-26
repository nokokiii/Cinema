import Link from "next/link";

interface SiteHeaderProps {
  backHref?: string;
  backLabel?: string;
}

export default function SiteHeader({ backHref, backLabel }: SiteHeaderProps) {
  return (
    <header className="border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          Kino<span className="text-accent">Gwiazda</span>
        </Link>
        {backHref && (
          <Link
            href={backHref}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            {backLabel ?? "Wróć"}
          </Link>
        )}
      </div>
    </header>
  );
}
