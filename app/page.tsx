// Repertoire page (Karta A: Repertuar i lista seansów) with Suspense streaming
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getTakenSeats } from "@/app/lib/events-service";
import { getCachedEvents } from "@/app/lib/cached-events";
import SiteHeader from "@/app/components/site-header";

export const instant = false;

function formatPln(amountMinor: number): string {
  return `${(amountMinor / 100).toFixed(0)} zł`;
}

async function ScreeningsList() {
  await connection();
  const events = await getCachedEvents();

  const eventsWithAvailability = await Promise.all(
    events.map(async (event) => {
      const taken = await getTakenSeats(event._id);
      return { ...event, availableCount: Math.max(0, event.seats.length - taken.length) };
    })
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {eventsWithAvailability.map((screening) => {
        const date = new Date(screening.startsAt);
        const dateFormatted = date.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
        const timeFormatted = date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

        return (
          <Link
            key={screening._id}
            href={`/events/${screening._id}`}
            className="group flex flex-col justify-between bg-surface border border-border rounded-2xl p-6 hover:border-accent/50 transition-colors"
          >
            <div>
              <div className="text-xs text-muted mb-2">
                {screening.hall}
                {screening.genre ? ` · ${screening.genre}` : ""}
              </div>
              <h2 className="text-xl font-semibold mb-3 group-hover:text-accent transition-colors">
                {screening.title}
              </h2>
              <div className="text-sm text-muted space-y-1">
                <div className="capitalize">
                  {dateFormatted}, {timeFormatted}
                </div>
                {screening.priceMinor !== undefined && (
                  <div>{formatPln(screening.priceMinor)}</div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-sm">
              <span className={screening.availableCount > 0 ? "text-foreground" : "text-muted"}>
                {screening.availableCount} / {screening.seats.length} wolnych
              </span>
              <span className="text-accent font-medium">Wybierz miejsce →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ScreeningsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-56 bg-surface border border-border rounded-2xl" />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="max-w-5xl mx-auto w-full px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Repertuar</h1>
        <p className="text-muted mb-8">Wybierz seans i zarezerwuj miejsce.</p>
        <Suspense fallback={<ScreeningsSkeleton />}>
          <ScreeningsList />
        </Suspense>
      </main>
    </div>
  );
}
