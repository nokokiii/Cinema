// Repertoire page (Karta A: Repertuar i lista seansów) with Suspense streaming
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getTakenSeats } from "@/app/lib/events-service";
import { getCachedEvents } from "@/app/lib/cached-events";

export const instant = false;

async function ScreeningsList() {
  await connection();
  const events = await getCachedEvents();

  // Fetch taken seats for each event to show real-time availability
  const eventsWithAvailability = await Promise.all(
    events.map(async (event) => {
      const taken = await getTakenSeats(event._id);
      const availableCount = Math.max(0, event.seats.length - taken.length);
      return {
        ...event,
        takenCount: taken.length,
        availableCount,
      };
    })
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {eventsWithAvailability.map((screening) => {
        const date = new Date(screening.startsAt);
        const dateFormatted = date.toLocaleDateString("pl-PL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        const timeFormatted = date.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div
            key={screening._id}
            className="flex flex-col justify-between bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all shadow-xl"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20">
                  {screening.hall}
                </span>
                {screening.genre && (
                  <span className="text-xs text-slate-400 font-medium">
                    {screening.genre}
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 line-clamp-1">
                {screening.title}
              </h2>

              {screening.description && (
                <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                  {screening.description}
                </p>
              )}

              <div className="space-y-1.5 text-sm text-slate-300 mb-6 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📅</span>
                  <span className="capitalize">{dateFormatted}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🕒</span>
                  <span className="font-semibold text-white">Godzina {timeFormatted}</span>
                  {screening.durationMinutes && (
                    <span className="text-xs text-slate-400">({screening.durationMinutes} min)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <span className="text-slate-400">💺</span>
                  <span>
                    Wolne fotele:{" "}
                    <strong className={screening.availableCount > 0 ? "text-emerald-400" : "text-rose-400"}>
                      {screening.availableCount}
                    </strong>{" "}
                    / {screening.seats.length}
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={`/events/${screening._id}`}
              className="w-full text-center py-3 px-4 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              Wybierz miejsce &rarr;
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function ScreeningsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-80 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="h-6 w-24 bg-slate-800 rounded-full mb-4"></div>
          <div className="h-8 w-3/4 bg-slate-800 rounded-lg mb-4"></div>
          <div className="h-16 w-full bg-slate-800/60 rounded-lg mb-6"></div>
          <div className="h-12 w-full bg-slate-800 rounded-xl"></div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl">🎬</span>
            <span className="font-bold text-xl tracking-tight text-amber-400 group-hover:text-amber-300 transition-colors">
              Kino Gwiazda
            </span>
          </Link>
          <div className="text-sm text-slate-400">
            System Rezerwacji Biletów
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Aktualny Repertuar Kinowy
          </h1>
          <p className="text-slate-400 text-lg">
            Wybierz seans, sprawdź dostępne fotele na mapie sali i zarezerwuj swoje miejsce.
          </p>
        </div>

        {/* Screenings Grid wrapped in Suspense for instant partial prerendering */}
        <Suspense fallback={<ScreeningsSkeleton />}>
          <ScreeningsList />
        </Suspense>
      </main>
    </div>
  );
}
